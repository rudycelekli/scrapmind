import { z } from 'zod';

export const MAX_IMAGE_BYTES = 20_000_000;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const captureTimingSchema = z
  .object({
    sequenceId: z.string().min(1).max(100),
    frameIndex: z.number().int().min(0).max(59),
    elapsedMs: z.number().min(0).max(86400000),
    targetElapsedMs: z.number().min(0).max(86400000),
  })
  .strict();
export type CaptureTiming = z.infer<typeof captureTimingSchema>;
export const imageArtifactSchema = z
  .object({
    id: z.string().min(1).max(100),
    buildId: z.string().min(1).max(100),
    itemId: z.string().min(1).max(100),
    inventoryFingerprint: z.string(),
    recipeFingerprint: z.string(),
    source: z.enum(['browser-capture', 'imported-image', 'test-fixture']),
    recordedAt: z.string().datetime(),
    capturedAt: z.string().datetime().optional(),
    timing: captureTimingSchema.optional(),
    mimeType: z.enum(['image/png', 'image/jpeg']),
    width: z.number().int().min(2).max(16000),
    height: z.number().int().min(2).max(16000),
    byteLength: z.number().int().positive().max(MAX_IMAGE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    parentId: z.string().min(1).max(100).optional(),
    operation: z.enum(['original', 'perspective-correction']),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (artifact.width * artifact.height > MAX_IMAGE_PIXELS)
      ctx.addIssue({ code: 'custom', message: 'Image exceeds 24 megapixels', path: ['width'] });
    if ((artifact.operation === 'original') === Boolean(artifact.parentId))
      ctx.addIssue({ code: 'custom', message: 'Only derived images must reference a parent' });
    if (artifact.source === 'browser-capture' && !artifact.capturedAt)
      ctx.addIssue({ code: 'custom', message: 'Browser captures require a frame timestamp' });
    if (artifact.timing && !artifact.capturedAt)
      ctx.addIssue({ code: 'custom', message: 'Sequence timing requires a capture timestamp' });
  });
export type ImageArtifact = z.infer<typeof imageArtifactSchema>;
export type ImageBinding = Pick<
  ImageArtifact,
  'id' | 'buildId' | 'itemId' | 'inventoryFingerprint' | 'recipeFingerprint'
>;

// Read encoded dimensions before a browser decoder allocates a pixel buffer.
// This header inspection is not a full decoder or a claim about image authenticity.
export function inspectImage(bytes: Uint8Array): {
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
} {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds byte limit.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let result: ReturnType<typeof inspectImage> | undefined;
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    result = { mimeType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        result = {
          mimeType: 'image/jpeg',
          height: view.getUint16(offset + 3),
          width: view.getUint16(offset + 5),
        };
        break;
      }
      offset += length;
    }
  }
  if (!result) throw new Error('A supported PNG or JPEG image is required.');
  if (
    result.width < 2 ||
    result.height < 2 ||
    result.width > 16000 ||
    result.height > 16000 ||
    result.width * result.height > MAX_IMAGE_PIXELS
  )
    throw new Error('Image dimensions exceed supported bounds.');
  return result;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createImageArtifact(
  blob: Blob,
  binding: ImageBinding,
  source: ImageArtifact['source'],
  capturedAt?: string,
  parentId?: string,
  timing?: CaptureTiming,
): Promise<ImageArtifact> {
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds byte limit.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const image = inspectImage(bytes);
  if (blob.type !== image.mimeType) throw new Error('Image content and MIME type disagree.');
  return imageArtifactSchema.parse({
    ...binding,
    ...image,
    source,
    recordedAt: new Date().toISOString(),
    ...(capturedAt
      ? { capturedAt }
      : source === 'browser-capture'
        ? { capturedAt: new Date().toISOString() }
        : {}),
    byteLength: bytes.length,
    sha256: await digest(bytes),
    operation: parentId ? 'perspective-correction' : 'original',
    ...(parentId ? { parentId } : {}),
    ...(timing ? { timing } : {}),
  });
}

export async function verifyImageArtifact(artifact: ImageArtifact, blob: Blob): Promise<boolean> {
  const parsed = imageArtifactSchema.parse(artifact);
  if (blob.size !== parsed.byteLength || blob.type !== parsed.mimeType) return false;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = inspectImage(bytes);
    return (
      image.mimeType === parsed.mimeType &&
      image.width === parsed.width &&
      image.height === parsed.height &&
      (await digest(bytes)) === parsed.sha256
    );
  } catch {
    return false;
  }
}
