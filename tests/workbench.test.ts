import { expect, it } from 'vitest';
import {
  createWorkbench,
  startWorkbenchBuild,
  workbenchBuild,
  completeWorkbenchStep,
  recordWorkbenchCheck,
  setWorkbenchAvailability,
  attachWorkbenchImage,
  importWorkbenchRecipe,
} from '../core/workbench.js';
import { reportWorkbench, renderWorkbenchReport } from '../core/report.js';
import { createImageArtifact } from '../core/evidence.js';
import { demoInventory } from '../core/fixtures.js';
import { recipes } from '../core/recipes.js';
import { pngBlob } from './image-fixture.js';

async function reportedFixture() {
  let workspace = startWorkbenchBuild(
    createWorkbench('Synthetic owner-report fixture', demoInventory()),
    'document-scanner',
    'recorded-build',
  );
  const { plan } = workbenchBuild(workspace, 'recorded-build');
  const blob = pngBlob();
  const artifact = await createImageArtifact(
    blob,
    {
      id: 'fixture-import',
      buildId: 'recorded-build',
      itemId: plan.allocations.find((entry) => entry.matchedCapabilities.includes('camera'))!
        .itemId,
      inventoryFingerprint: plan.inventoryFingerprint,
      recipeFingerprint: plan.recipeFingerprint,
    },
    'imported-image',
  );
  const image = { blob, artifact };
  workspace = await attachWorkbenchImage(workspace, 'recorded-build', image);
  for (const step of plan.recipe.steps)
    workspace = completeWorkbenchStep(workspace, 'recorded-build', step.id);
  for (const check of plan.recipe.checks)
    workspace = recordWorkbenchCheck(workspace, 'recorded-build', {
      checkId: check.id,
      outcome: 'passed',
      note: 'Synthetic owner claim for software testing; no physical trial occurred.',
      artifactIds: check.evidenceKind === 'capture' ? [artifact.id] : [],
      recordedAt: new Date().toISOString(),
    });
  return { workspace, image };
}

it('distinguishes owner-reported passes from missing, changed, unreadable and unchecked image bytes', async () => {
  const { workspace, image } = await reportedFixture();
  for (const [loader, integrity, checksum] of [
    [undefined, 'unchecked', 'unchecked'],
    [async () => image, 'verified', 'verified'],
    [async () => undefined, 'needs-evidence', 'missing'],
    [async () => ({ ...image, blob: new Blob(['corrupt']) }), 'needs-evidence', 'changed'],
    [
      async () => {
        throw new Error('unreadable');
      },
      'needs-evidence',
      'unreadable',
    ],
  ] as const) {
    const report = await reportWorkbench(workspace, loader);
    expect(report.builds[0].recordedStatus).toBe('reported-pass');
    expect(report.builds[0].mediaIntegrity).toBe(integrity);
    expect(report.builds[0].images[0].checksum).toBe(checksum);
  }
});

it('rejects stale mutations, preserves old results, and reports unavailable recipes honestly', async () => {
  const { workspace, image } = await reportedFixture();
  const changed = setWorkbenchAvailability(workspace, 'arm', false);
  expect((await reportWorkbench(changed, async () => image)).builds[0].recordedStatus).toBe(
    'stale',
  );
  expect(changed.builds[0].results).toEqual(workspace.builds[0].results);
  expect(() => completeWorkbenchStep(changed, 'recorded-build', recipes[0].steps[0].id)).toThrow(
    'plan changed',
  );
  const unavailable = {
    ...workspace,
    builds: [{ ...workspace.builds[0], recipeId: 'removed-recipe' }],
  };
  expect((await reportWorkbench(unavailable)).builds[0].recordedStatus).toBe('recipe-unavailable');
  expect(() => startWorkbenchBuild(workspace, 'document-scanner', 'recorded-build')).toThrow(
    'unique',
  );
});

it('requires explicit recipe replacement and invalidates results after a recipe change', async () => {
  const { workspace } = await reportedFixture();
  const recipe = { ...recipes[0], subtitle: 'An updated procedure requiring a new trial.' };
  expect(() => importWorkbenchRecipe(workspace, recipe)).toThrow('already exists');
  const changed = importWorkbenchRecipe(workspace, recipe, true);
  expect((await reportWorkbench(changed)).builds[0].recordedStatus).toBe('stale');
});

it('escapes owner text without embedding executable HTML, remote images or terminal controls', async () => {
  const { workspace } = await reportedFixture();
  workspace.name = '<script>alert(1)</script> ![image](https://example.com)\x1b[31m';
  const markdown = renderWorkbenchReport(await reportWorkbench(workspace));
  expect(markdown).not.toContain('<script>');
  expect(markdown).not.toContain('![image]');
  expect(markdown).not.toContain('\x1b');
  expect(markdown).toContain('owner-reported');
});
