import { expect, it } from 'vitest';
import { createImageArtifact } from '../core/evidence.js';
import {
  applyCameraTrial,
  CAMERA_FRAME_PROCEDURE,
  deviceFingerprint,
  deviceTrialIsCurrent,
  deviceTrialSchema,
  runCameraTrial,
} from '../core/device-trial.js';
import { demoInventory } from '../core/fixtures.js';
import { planRecipe } from '../core/planner.js';
import { recipes } from '../core/recipes.js';
import { startBuild, buildIsStale } from '../core/build.js';
import { exportEvidenceBundle, importEvidenceBundle } from '../core/evidence-bundle.js';
import { pngBlob } from './image-fixture.js';

async function fixture() {
  const inventory = demoInventory();
  const item = inventory.find((entry) => entry.capabilities.includes('camera'))!;
  const blob = pngBlob();
  const artifact = await createImageArtifact(
    blob,
    {
      id: 'trial-photo',
      buildId: 'trial',
      itemId: item.id,
      inventoryFingerprint: deviceFingerprint(item),
      recipeFingerprint: CAMERA_FRAME_PROCEDURE,
    },
    'browser-capture',
  );
  // Synthetic metadata used to exercise owner-claim handling. This is not a device trial.
  const trial = deviceTrialSchema.parse({
    id: 'trial',
    itemId: item.id,
    itemFingerprint: deviceFingerprint(item),
    procedure: CAMERA_FRAME_PROCEDURE,
    context: 'owner-device',
    outcome: 'frame-produced',
    recordedAt: new Date().toISOString(),
    note: 'Synthetic unit-test metadata; no actual physical device.',
    artifact,
  });
  return { inventory, item, trial, blob };
}

it('requires explicit association and matching media before updating only the tested camera capability', async () => {
  const { inventory, item, trial, blob } = await fixture();
  await expect(applyCameraTrial(inventory, trial, blob, false)).rejects.toThrow(
    'owner must confirm',
  );
  await expect(applyCameraTrial(inventory, trial, new Blob(['changed']), true)).rejects.toThrow(
    'checksum changed',
  );
  const updated = await applyCameraTrial(inventory, trial, blob, true);
  const camera = updated.find((entry) => entry.id === item.id)!;
  expect(camera.testedCapabilities).toEqual(['camera']);
  expect(camera.capabilities).toEqual(item.capabilities);
  expect(camera.evidence).toBe('tested');
  expect(deviceTrialIsCurrent(trial, camera)).toBe(true);
  expect(inventory.find((entry) => entry.id === item.id)!.testedCapabilities).toEqual([]);
  const oldBuild = startBuild(planRecipe(recipes[0], inventory), 'build');
  expect(buildIsStale(oldBuild, updated)).toBe(true);
});

it('never converts a failed or declared synthetic trial into an owner-device test', async () => {
  const { inventory, trial, blob } = await fixture();
  await expect(
    applyCameraTrial(inventory, { ...trial, context: 'synthetic-test' }, blob, true),
  ).rejects.toThrow('synthetic or failed');
  const failed = deviceTrialSchema.parse({ ...trial, outcome: 'failed', artifact: undefined });
  await expect(applyCameraTrial(inventory, failed, blob, true)).rejects.toThrow(
    'synthetic or failed',
  );
});

it('invalidates device results after configuration changes and validates trial-photo bindings', async () => {
  const { inventory, item, trial, blob } = await fixture();
  expect(deviceTrialIsCurrent(trial, { ...item, available: false })).toBe(false);
  expect(deviceTrialIsCurrent(trial, { ...item, name: 'A replacement phone' })).toBe(false);
  await expect(
    applyCameraTrial(
      inventory.map((entry) => (entry.id === item.id ? { ...entry, available: false } : entry)),
      trial,
      blob,
      true,
    ),
  ).rejects.toThrow('configuration changed');
  expect(() =>
    deviceTrialSchema.parse({ ...trial, artifact: { ...trial.artifact!, buildId: 'other' } }),
  ).toThrow('bound to this trial');
  expect(() => deviceTrialSchema.parse({ ...trial, outcome: 'failed' })).toThrow(
    'failed camera trial',
  );
});

it('includes standalone device trial photos in a complete portable evidence bundle', async () => {
  const { inventory, trial, blob } = await fixture();
  const workspace = {
    format: 'scrapmind-workspace' as const,
    version: 1 as const,
    name: 'Synthetic trial fixture',
    inventory,
    recipes: [],
    builds: [],
    deviceTrials: [{ ...trial, context: 'synthetic-test' as const }],
    exportedAt: new Date().toISOString(),
  };
  const json = await exportEvidenceBundle(workspace, async () => ({
    artifact: trial.artifact!,
    blob,
  }));
  const restored = await importEvidenceBundle(json);
  expect(restored.workspace.deviceTrials).toEqual(workspace.deviceTrials);
  expect(await restored.images[0].blob.arrayBuffer()).toEqual(await blob.arrayBuffer());
});

it('rejects invalid inventory and trial context before requesting browser camera access', async () => {
  const item = demoInventory()[0];
  await expect(
    runCameraTrial({ ...item, available: false }, { context: 'owner-device' }),
  ).rejects.toThrow('available');
  await expect(runCameraTrial(item, { context: 'not-valid' as 'owner-device' })).rejects.toThrow();
});
