import { z } from 'zod';
import type { CameraSession, CapturedImage } from './camera.js';
import { imageArtifactSchema, type ImageBinding } from './evidence.js';

const sequenceOptionsSchema = z
  .object({
    id: z.string().min(1).max(100),
    count: z.number().int().min(2).max(60),
    intervalMs: z.number().int().min(100).max(60000),
    mimeType: z.enum(['image/png', 'image/jpeg']).default('image/jpeg'),
  })
  .strict();
export type SequenceOptions = z.input<typeof sequenceOptionsSchema>;

function abortError(): Error {
  return new DOMException('Capture sequence was cancelled.', 'AbortError');
}
function waitUntil(target: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(abortError());
    const timer = setTimeout(() => finish(), Math.max(0, target - performance.now()));
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/** One frame in flight. Consumers persist each yielded image rather than buffering a movie. */
export async function* captureSequence(
  camera: Pick<CameraSession, 'capture' | 'active'> & { endedSignal?: AbortSignal },
  binding: Omit<ImageBinding, 'id'>,
  options: SequenceOptions,
  signal?: AbortSignal,
): AsyncGenerator<CapturedImage> {
  const parsed = sequenceOptionsSchema.parse(options);
  const effectiveSignal =
    camera.endedSignal && signal
      ? AbortSignal.any([camera.endedSignal, signal])
      : (camera.endedSignal ?? signal);
  const originMs = performance.now();
  let targetElapsedMs = 0;
  let bytes = 0;
  for (let frameIndex = 0; frameIndex < parsed.count; frameIndex++) {
    if (frameIndex > 0) {
      // Skip elapsed schedule slots after a slow encoder or consumer. Never
      // synthesize missing frames or burst through a backlog of overdue slots.
      targetElapsedMs = Math.max(
        targetElapsedMs + parsed.intervalMs,
        Math.ceil((performance.now() - originMs) / parsed.intervalMs) * parsed.intervalMs,
      );
    }
    try {
      await waitUntil(originMs + targetElapsedMs, effectiveSignal);
    } catch (error) {
      if (!camera.active) throw new Error('The camera ended during the capture sequence.');
      throw error;
    }
    if (!camera.active) throw new Error('The camera ended during the capture sequence.');
    const image = await camera.capture({ ...binding, id: crypto.randomUUID() }, parsed.mimeType, {
      sequenceId: parsed.id,
      frameIndex,
      originMs,
      targetElapsedMs,
    });
    if (!camera.active) throw new Error('The camera ended during the capture sequence.');
    if (effectiveSignal?.aborted) throw abortError();
    bytes += image.blob.size;
    if (bytes > 20_000_000)
      throw new Error('Capture sequence exceeds 20 MB. Start a smaller sequence.');
    yield image;
  }
}

export function describeSequence(images: Pick<CapturedImage, 'artifact'>[]) {
  if (images.length < 2) throw new Error('At least two captured frames are required.');
  const frames = images.map((image) => imageArtifactSchema.parse(image.artifact));
  const first = frames[0];
  if (!first.timing) throw new Error('Sequence timing is missing.');
  if (
    frames.some(
      (frame, index) =>
        !frame.timing ||
        frame.operation !== 'original' ||
        frame.timing.sequenceId !== first.timing!.sequenceId ||
        frame.buildId !== first.buildId ||
        frame.itemId !== first.itemId ||
        frame.source !== first.source ||
        frame.inventoryFingerprint !== first.inventoryFingerprint ||
        frame.recipeFingerprint !== first.recipeFingerprint ||
        (index > 0 &&
          (frame.timing.frameIndex <= frames[index - 1].timing!.frameIndex ||
            frame.timing.elapsedMs <= frames[index - 1].timing!.elapsedMs)),
    )
  )
    throw new Error('Sequence requires ordered originals from one device and build revision.');
  return {
    id: first.timing.sequenceId,
    frameCount: frames.length,
    elapsedMs: frames[frames.length - 1].timing!.elapsedMs - first.timing.elapsedMs,
    intervalsMs: frames
      .slice(1)
      .map((frame, index) => frame.timing!.elapsedMs - frames[index].timing!.elapsedMs),
    latenessMs: frames.map((frame) => frame.timing!.elapsedMs - frame.timing!.targetElapsedMs),
  };
}
