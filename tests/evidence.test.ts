import { expect, it } from 'vitest';
import { createImageArtifact, inspectImage, verifyImageArtifact } from '../core/evidence.js';
import {
  attachImage,
  buildSessionSchema,
  buildStatus,
  completeStep,
  recordCheck,
  startBuild,
} from '../core/build.js';
import { planRecipe } from '../core/planner.js';
import { recipes } from '../core/recipes.js';
import { demoInventory } from '../core/fixtures.js';
import { pngBlob } from './image-fixture.js';

const plan = planRecipe(recipes[0], demoInventory());
const binding = {
  id: 'photo',
  buildId: 'build',
  itemId: plan.allocations.find((entry) => entry.requirementId === 'camera')!.itemId,
  inventoryFingerprint: plan.inventoryFingerprint,
  recipeFingerprint: plan.recipeFingerprint,
};
const result = {
  checkId: 'frame',
  outcome: 'passed' as const,
  note: 'Synthetic image, used only to test software state.',
  recordedAt: new Date().toISOString(),
  artifactIds: ['photo'],
};

it('hashes encoded image bytes and rejects altered payloads or metadata', async () => {
  const blob = pngBlob();
  const artifact = await createImageArtifact(blob, binding, 'test-fixture');
  expect(artifact).toMatchObject({ width: 2, height: 2, mimeType: 'image/png' });
  expect(await verifyImageArtifact(artifact, blob)).toBe(true);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  bytes[bytes.length - 1] ^= 1;
  expect(await verifyImageArtifact(artifact, new Blob([bytes], { type: blob.type }))).toBe(false);
  expect(await verifyImageArtifact({ ...artifact, width: 3 }, blob)).toBe(false);
  expect(
    await verifyImageArtifact(
      artifact,
      new Blob([await blob.arrayBuffer()], { type: 'image/jpeg' }),
    ),
  ).toBe(false);
});

it('bounds image headers before decoding, including malicious dimensions and MIME mismatches', async () => {
  expect(() => inspectImage(new Uint8Array([1, 2, 3]))).toThrow('PNG or JPEG');
  const bytes = new Uint8Array(await pngBlob().arrayBuffer());
  new DataView(bytes.buffer).setUint32(16, 16000);
  new DataView(bytes.buffer).setUint32(20, 16000);
  expect(() => inspectImage(bytes)).toThrow('bounds');
  await expect(
    createImageArtifact(
      new Blob([await pngBlob().arrayBuffer()], { type: 'image/jpeg' }),
      binding,
      'test-fixture',
    ),
  ).rejects.toThrow('MIME');
});

it('rejects missing images, changed bytes, duplicate IDs, and a different build revision', async () => {
  const session = startBuild(plan, 'build');
  const blob = pngBlob();
  const artifact = await createImageArtifact(blob, binding, 'imported-image');
  expect(() => recordCheck(session, plan, result)).toThrow('attached images');
  await expect(attachImage(session, plan, artifact, new Blob(['wrong']))).rejects.toThrow(
    'checksum',
  );
  await expect(
    attachImage(session, plan, { ...artifact, buildId: 'another' }, blob),
  ).rejects.toThrow('another build');
  await expect(
    attachImage(session, plan, { ...artifact, recipeFingerprint: 'old' }, blob),
  ).rejects.toThrow('another build');
  await expect(
    attachImage(session, plan, { ...artifact, itemId: 'unallocated' }, blob),
  ).rejects.toThrow('not allocated');
  const attached = await attachImage(session, plan, artifact, blob);
  expect(recordCheck(attached, plan, result).results[0].artifactIds).toEqual(['photo']);
  await expect(attachImage(attached, plan, artifact, blob)).rejects.toThrow('immutable');
  expect(() => recordCheck(attached, plan, { ...result, artifactIds: ['missing'] })).toThrow();
});

it('never accepts a declared test fixture as passing capture evidence', async () => {
  const blob = pngBlob();
  const artifact = await createImageArtifact(blob, binding, 'test-fixture');
  const attached = await attachImage(startBuild(plan, 'build'), plan, artifact, blob);
  expect(() => recordCheck(attached, plan, result)).toThrow('attached images');
});

it('counts originals, not multiple crops, when a check requires two captures', async () => {
  const multiPlan = planRecipe(
    { ...recipes[0], checks: [{ ...recipes[0].checks[0], minArtifacts: 2 }] },
    demoInventory(),
  );
  let session = startBuild(multiPlan, 'build');
  const blob = pngBlob();
  const original = await createImageArtifact(
    blob,
    { ...binding, recipeFingerprint: multiPlan.recipeFingerprint },
    'imported-image',
  );
  session = await attachImage(session, multiPlan, original, blob);
  const crop = await createImageArtifact(
    blob,
    { ...binding, id: 'crop', recipeFingerprint: multiPlan.recipeFingerprint },
    'imported-image',
    original.capturedAt,
    original.id,
  );
  session = await attachImage(session, multiPlan, crop, blob);
  expect(() =>
    recordCheck(session, multiPlan, { ...result, artifactIds: ['photo', 'crop'] }),
  ).toThrow('distinct');
  const second = await createImageArtifact(
    blob,
    { ...binding, id: 'second', recipeFingerprint: multiPlan.recipeFingerprint },
    'imported-image',
  );
  session = await attachImage(session, multiPlan, second, blob);
  expect(
    recordCheck(session, multiPlan, { ...result, artifactIds: ['photo', 'second'] }).results,
  ).toHaveLength(1);
  expect(() => buildSessionSchema.parse({ ...session, artifacts: [crop, original] })).toThrow(
    'earlier matching parent',
  );
});

it('cannot report a pass from imported check metadata alone; step completion is validated', () => {
  let session = startBuild(plan, 'build');
  for (const step of plan.recipe.steps) session = completeStep(session, plan, step.id);
  session.results = plan.recipe.checks.map((check) => ({
    ...result,
    checkId: check.id,
    artifactIds: [],
  }));
  expect(buildStatus(session, plan)).toBe('in-progress');
  expect(() => completeStep(session, plan, 'made-up')).toThrow('Unknown build step');
  expect(completeStep(session, plan, plan.recipe.steps[0].id, false).completedSteps).not.toContain(
    plan.recipe.steps[0].id,
  );
});
