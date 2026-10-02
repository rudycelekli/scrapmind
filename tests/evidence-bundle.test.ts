import { expect, it } from 'vitest';
import { attachImage, startBuild } from '../core/build.js';
import { createImageArtifact } from '../core/evidence.js';
import { exportEvidenceBundle, importEvidenceBundle } from '../core/evidence-bundle.js';
import { demoInventory } from '../core/fixtures.js';
import { planRecipe } from '../core/planner.js';
import { recipes } from '../core/recipes.js';
import { importWorkspace, exportWorkspace } from '../core/workspace.js';
import { pngBlob } from './image-fixture.js';

async function fixture() {
  const inventory = demoInventory();
  const plan = planRecipe(recipes[0], inventory);
  const blob = pngBlob();
  const artifact = await createImageArtifact(
    blob,
    {
      id: 'photo',
      buildId: 'build',
      itemId: plan.allocations.find((entry) => entry.requirementId === 'camera')!.itemId,
      inventoryFingerprint: plan.inventoryFingerprint,
      recipeFingerprint: plan.recipeFingerprint,
    },
    'test-fixture',
  );
  const session = await attachImage(startBuild(plan, 'build'), plan, artifact, blob);
  const workspace = {
    format: 'scrapmind-workspace' as const,
    version: 1 as const,
    name: 'Synthetic fixture',
    inventory,
    recipes: [],
    builds: [session],
    deviceTrials: [],
    exportedAt: new Date().toISOString(),
  };
  return { workspace, image: { artifact, blob } };
}

it('round-trips complete images with their immutable build bindings', async () => {
  const { workspace, image } = await fixture();
  const json = await exportEvidenceBundle(workspace, async () => image);
  const imported = await importEvidenceBundle(json);
  expect(imported.workspace).toEqual(workspace);
  expect(imported.images[0].artifact).toEqual(image.artifact);
  expect(await imported.images[0].blob.arrayBuffer()).toEqual(await image.blob.arrayBuffer());
  expect(importWorkspace(exportWorkspace(workspace))).toEqual(workspace);
  expect(image.artifact.capturedAt).toBeUndefined();
});

it('refuses an incomplete or tampered export instead of silently dropping photos', async () => {
  const { workspace, image } = await fixture();
  await expect(exportEvidenceBundle(workspace, async () => undefined)).rejects.toThrow(
    'missing or changed',
  );
  await expect(
    exportEvidenceBundle(workspace, async () => ({ ...image, blob: new Blob(['wrong']) })),
  ).rejects.toThrow('missing or changed');
});

it('rejects mismatched, duplicate, corrupted and unbound imported images before returning a workspace', async () => {
  const { workspace, image } = await fixture();
  const json = await exportEvidenceBundle(workspace, async () => image);
  const bundle = JSON.parse(json);
  await expect(importEvidenceBundle(JSON.stringify({ ...bundle, images: [] }))).rejects.toThrow(
    'exactly',
  );
  await expect(
    importEvidenceBundle(
      JSON.stringify({ ...bundle, images: [...bundle.images, ...bundle.images] }),
    ),
  ).rejects.toThrow('exactly');
  const encoded = bundle.images[0];
  await expect(
    importEvidenceBundle(
      JSON.stringify({ ...bundle, images: [{ ...encoded, artifactId: 'unbound' }] }),
    ),
  ).rejects.toThrow('matching evidence');
  await expect(
    importEvidenceBundle(
      JSON.stringify({ ...bundle, images: [{ ...encoded, mimeType: 'image/jpeg' }] }),
    ),
  ).rejects.toThrow('matching evidence');
  // Alter the PNG's compressed pixels, keeping the image header and byte count.
  const bytes = new Uint8Array(await image.blob.arrayBuffer());
  bytes[45] ^= 1;
  await expect(
    importEvidenceBundle(
      JSON.stringify({
        ...bundle,
        images: [{ ...encoded, base64: Buffer.from(bytes).toString('base64') }],
      }),
    ),
  ).rejects.toThrow('checksum');
  await expect(
    importEvidenceBundle(JSON.stringify({ ...bundle, images: [{ ...encoded, base64: 'AA==' }] })),
  ).rejects.toThrow('length');
});

it('bounds imported data and rejects globally reused artifact IDs', async () => {
  await expect(importEvidenceBundle(' '.repeat(35_000_001))).rejects.toThrow('35 MB');
  const { workspace, image } = await fixture();
  const duplicate = {
    ...workspace.builds[0],
    id: 'another',
    artifacts: [{ ...image.artifact, buildId: 'another' }],
  };
  await expect(
    exportEvidenceBundle(
      { ...workspace, builds: [...workspace.builds, duplicate] },
      async () => image,
    ),
  ).rejects.toThrow('globally unique');
});
