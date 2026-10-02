import { z } from 'zod';
import { CameraSession, type CapturedImage } from './camera.js';
import { imageArtifactSchema, verifyImageArtifact } from './evidence.js';
import { inventoryFingerprint, inventorySchema, itemSchema, type InventoryItem } from './schema.js';

export const CAMERA_FRAME_PROCEDURE = 'browser-camera-frame-v1';
export const deviceTrialSchema = z
  .object({
    id: z.string().min(1).max(100),
    itemId: z.string().min(1).max(100),
    itemFingerprint: z.string(),
    procedure: z.literal(CAMERA_FRAME_PROCEDURE),
    context: z.enum(['owner-device', 'synthetic-test']),
    outcome: z.enum(['frame-produced', 'failed']),
    recordedAt: z.string().datetime(),
    note: z.string().trim().min(1).max(3000),
    artifact: imageArtifactSchema.optional(),
  })
  .strict()
  .superRefine((trial, ctx) => {
    if (trial.outcome === 'frame-produced') {
      const image = trial.artifact;
      if (
        !image ||
        image.buildId !== trial.id ||
        image.itemId !== trial.itemId ||
        image.inventoryFingerprint !== trial.itemFingerprint ||
        image.recipeFingerprint !== CAMERA_FRAME_PROCEDURE ||
        image.operation !== 'original' ||
        image.source !== 'browser-capture'
      )
        ctx.addIssue({
          code: 'custom',
          message: 'A camera trial requires an original browser capture bound to this trial',
          path: ['artifact'],
        });
    } else if (trial.artifact) {
      ctx.addIssue({
        code: 'custom',
        message: 'A failed camera trial cannot contain passing image evidence',
        path: ['artifact'],
      });
    }
  });
export type DeviceTrial = z.infer<typeof deviceTrialSchema>;

/** Observation labels may change after a trial without changing the device's declared configuration. */
export function deviceFingerprint(item: InventoryItem): string {
  const parsed = itemSchema.parse(item);
  return inventoryFingerprint([{ ...parsed, evidence: 'declared', testedCapabilities: [] }]);
}

export function deviceTrialIsCurrent(trial: DeviceTrial, item: InventoryItem): boolean {
  const parsed = deviceTrialSchema.parse(trial);
  return parsed.itemId === item.id && parsed.itemFingerprint === deviceFingerprint(item);
}

/** Explicit camera operation. The owner still has to identify which physical device it represents. */
export async function runCameraTrial(
  item: InventoryItem,
  options: { context: DeviceTrial['context']; deviceId?: string; timeoutMs?: number },
): Promise<{ trial: DeviceTrial; image?: CapturedImage }> {
  options = z
    .object({
      context: z.enum(['owner-device', 'synthetic-test']),
      deviceId: z.string().min(1).max(1000).optional(),
      timeoutMs: z.number().min(100).max(60000).optional(),
    })
    .strict()
    .parse(options);
  item = itemSchema.parse(item);
  if (item.kind !== 'device' || !item.available || !item.capabilities.includes('camera'))
    throw new Error('Choose an available inventory device with a declared camera capability.');
  const id = crypto.randomUUID();
  const base = {
    id,
    itemId: item.id,
    itemFingerprint: deviceFingerprint(item),
    procedure: CAMERA_FRAME_PROCEDURE,
    context: options.context,
  };
  let camera: CameraSession | undefined;
  try {
    camera = await CameraSession.open({ deviceId: options.deviceId, timeoutMs: options.timeoutMs });
    const image = await camera.capture({
      id: crypto.randomUUID(),
      buildId: id,
      itemId: item.id,
      inventoryFingerprint: base.itemFingerprint,
      recipeFingerprint: CAMERA_FRAME_PROCEDURE,
    });
    const bitmap = await createImageBitmap(image.blob);
    try {
      if (bitmap.width !== image.artifact.width || bitmap.height !== image.artifact.height)
        throw new Error('Decoded camera frame dimensions do not match the image evidence.');
    } finally {
      bitmap.close();
    }
    return {
      trial: deviceTrialSchema.parse({
        ...base,
        outcome: 'frame-produced',
        recordedAt: new Date().toISOString(),
        note: 'The selected browser camera produced a decodable image. Device identity, focus, scene content, mounting, and optical quality were not established.',
        artifact: image.artifact,
      }),
      image,
    };
  } catch (error) {
    return {
      trial: deviceTrialSchema.parse({
        ...base,
        outcome: 'failed',
        recordedAt: new Date().toISOString(),
        note:
          (error instanceof Error ? error.message : 'Camera frame trial failed.').slice(0, 3000) ||
          'Camera frame trial failed.',
      }),
    };
  } finally {
    camera?.stop();
  }
}

/** A deliberate owner confirmation, never an automatic side effect of opening a camera. */
export async function applyCameraTrial(
  inventory: InventoryItem[],
  trial: DeviceTrial,
  blob: Blob,
  confirmedDeviceAssociation: boolean,
): Promise<InventoryItem[]> {
  inventory = inventorySchema.parse(inventory);
  trial = deviceTrialSchema.parse(trial);
  if (confirmedDeviceAssociation !== true)
    throw new Error('The owner must confirm which inventory device produced this frame.');
  if (trial.context !== 'owner-device' || trial.outcome !== 'frame-produced')
    throw new Error('A synthetic or failed trial cannot establish an owner-device capability.');
  if (!trial.artifact || !(await verifyImageArtifact(trial.artifact, blob)))
    throw new Error('The trial image is missing or its checksum changed.');
  const item = inventory.find((entry) => entry.id === trial.itemId);
  if (!item || !deviceTrialIsCurrent(trial, item))
    throw new Error('The device configuration changed. Run a new trial.');
  if (!item.available || item.kind !== 'device' || !item.capabilities.includes('camera'))
    throw new Error('This inventory item is not an available declared camera.');
  return inventorySchema.parse(
    inventory.map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            evidence: 'tested',
            testedCapabilities: [...new Set([...entry.testedCapabilities, 'camera'])],
          }
        : entry,
    ),
  );
}
