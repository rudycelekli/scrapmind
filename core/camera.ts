import { warpImage, validateQuad, type Quad } from './geometry.js';
import {
  createImageArtifact,
  inspectImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  verifyImageArtifact,
  type ImageArtifact,
  type ImageBinding,
} from './evidence.js';

export interface CapturedImage {
  artifact: ImageArtifact;
  blob: Blob;
}

function encode(canvas: HTMLCanvasElement, mimeType: 'image/png' | 'image/jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      mimeType,
      0.92,
    ),
  );
}

function canvasFor(width: number, height: number): HTMLCanvasElement {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 16000 ||
    height > 16000 ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new Error('Camera image dimensions exceed supported bounds.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Open only in response to the user's explicit camera action. Audio is never requested. */
export class CameraSession {
  private stopped = false;
  private constructor(
    readonly video: HTMLVideoElement,
    private readonly stream: MediaStream,
  ) {}

  static async open(
    options: { deviceId?: string; timeoutMs?: number } = {},
  ): Promise<CameraSession> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Camera access requires localhost or HTTPS and browser support.');
    const timeoutMs = options.timeoutMs ?? 20000;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000)
      throw new Error('Camera timeout must be between 100 and 60000 ms.');
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
      },
    });
    // A permission request cannot be cancelled. Stop a stream that arrives after timeout.
    void request.then(
      (stream) => {
        if (expired) stream.getTracks().forEach((track) => track.stop());
      },
      () => {},
    );
    let stream: MediaStream;
    try {
      stream = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error('Camera permission or startup timed out. Try again explicitly.'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const session = new CameraSession(video, stream);
    try {
      await session.firstFrame(timeoutMs);
      return session;
    } catch (error) {
      session.stop();
      throw error;
    }
  }

  private firstFrame(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let frameId: number | undefined;
      let poll: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(
        () => finish(new Error('The camera did not produce a frame.')),
        timeoutMs,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        clearTimeout(poll);
        if (frameId !== undefined) this.video.cancelVideoFrameCallback(frameId);
        if (error) reject(error);
        else resolve();
      };
      const ready = () => {
        if (this.video.videoWidth && this.video.readyState >= 2) finish();
        else poll = setTimeout(ready, 20);
      };
      if (typeof this.video.requestVideoFrameCallback === 'function')
        frameId = this.video.requestVideoFrameCallback(() => finish());
      else ready();
      void this.video
        .play()
        .catch((error: unknown) =>
          finish(error instanceof Error ? error : new Error('Camera playback failed.')),
        );
    });
  }

  get active(): boolean {
    return (
      !this.stopped && this.stream.getVideoTracks().some((track) => track.readyState === 'live')
    );
  }

  settings(): Pick<MediaTrackSettings, 'width' | 'height' | 'frameRate' | 'facingMode'> {
    if (!this.active) throw new Error('The camera session has ended.');
    const { width, height, frameRate, facingMode } = this.stream.getVideoTracks()[0].getSettings();
    // Persistent device and group IDs are deliberately omitted from exported evidence.
    return { width, height, frameRate, facingMode };
  }

  async capture(
    binding: ImageBinding,
    mimeType: 'image/png' | 'image/jpeg' = 'image/jpeg',
  ): Promise<CapturedImage> {
    if (!this.active || this.video.readyState < 2)
      throw new Error('The camera has no live frame. Open it again explicitly.');
    const capturedAt = new Date().toISOString();
    const canvas = canvasFor(this.video.videoWidth, this.video.videoHeight);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas image capture is unavailable.');
    context.drawImage(this.video, 0, 0);
    const blob = await encode(canvas, mimeType);
    return {
      blob,
      artifact: await createImageArtifact(blob, binding, 'browser-capture', capturedAt),
    };
  }

  stop(): void {
    this.stopped = true;
    this.stream.getTracks().forEach((track) => track.stop());
    this.video.pause();
    this.video.srcObject = null;
  }
}

/** Decode a selected local image. Neither this function nor capture uploads media. */
export async function importImage(blob: Blob, binding: ImageBinding): Promise<CapturedImage> {
  const artifact = await createImageArtifact(blob, binding, 'imported-image');
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' });
  try {
    if (bitmap.width !== artifact.width || bitmap.height !== artifact.height)
      throw new Error(
        'Decoded and encoded dimensions disagree. Normalize image orientation before import.',
      );
  } finally {
    bitmap.close();
  }
  return { blob, artifact };
}

/** Pixel-space corners are ordered top-left, top-right, bottom-right, bottom-left. */
export async function correctPerspective(
  image: CapturedImage,
  binding: ImageBinding,
  corners: Quad,
  width: number,
  height: number,
): Promise<CapturedImage> {
  const parent = image.artifact;
  if (!(await verifyImageArtifact(parent, image.blob)))
    throw new Error('Source image bytes have changed.');
  for (const key of ['buildId', 'itemId', 'inventoryFingerprint', 'recipeFingerprint'] as const)
    if (binding[key] !== parent[key])
      throw new Error('Corrected images must retain their original build and device.');
  if (binding.id === parent.id) throw new Error('A corrected image requires a new artifact ID.');
  if (image.blob.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds byte limit.');
  const dimensions = inspectImage(new Uint8Array(await image.blob.arrayBuffer()));
  if (!validateQuad(corners, dimensions.width, dimensions.height))
    throw new Error('Four convex corners within the source image are required.');
  const bitmap = await createImageBitmap(image.blob, { imageOrientation: 'none' });
  try {
    const source = canvasFor(bitmap.width, bitmap.height);
    const context = source.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas image processing is unavailable.');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const corrected = warpImage(pixels.data, bitmap.width, bitmap.height, corners, width, height);
    const output = canvasFor(width, height);
    const target = output.getContext('2d');
    if (!target) throw new Error('Canvas image processing is unavailable.');
    target.putImageData(new ImageData(new Uint8ClampedArray(corrected), width, height), 0, 0);
    const blob = await encode(output, 'image/png');
    return {
      blob,
      artifact: await createImageArtifact(
        blob,
        binding,
        parent.source,
        parent.capturedAt,
        parent.id,
      ),
    };
  } finally {
    bitmap.close();
  }
}
