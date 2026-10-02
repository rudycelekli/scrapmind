import { expect, it } from 'vitest';
import {
  scanInventory,
  photoDataUrl,
  inventoryScanSchema,
  inventoryReviewSchema,
} from '../core/inventory-scan.js';
import {
  createWorkbench,
  saveWorkbenchScan,
  reviewWorkbenchScan,
  inventoryReviewTemplate,
  setWorkbenchAvailability,
  startWorkbenchBuild,
  workbenchBuild,
  attachWorkbenchImage,
} from '../core/workbench.js';
import { inventoryFingerprint } from '../core/schema.js';
import { importWorkspace, exportWorkspace, workspaceArtifacts } from '../core/workspace.js';
import { exportEvidenceBundle, importEvidenceBundle } from '../core/evidence-bundle.js';
import { reportWorkbench, renderWorkbenchReport } from '../core/report.js';
import { demoInventory } from '../core/fixtures.js';
import { photoObservationFixture } from './inventory-scan-fixture.js';
import { pngBlob } from './image-fixture.js';

const config = {
  baseUrl: 'http://localhost/v1',
  model: 'fixture-text',
  visionModel: 'fixture-vision',
};
function answer(value: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  );
}
async function fixture(context: 'owner-photo' | 'synthetic-test' = 'owner-photo') {
  const workspace = createWorkbench(
    'Synthetic policy fixture; no physical evidence',
    demoInventory(),
  );
  const result = await scanInventory(
    { inventory: workspace.inventory, image: await photoDataUrl(pngBlob()), context },
    config,
    async () => answer(photoObservationFixture()),
  );
  return { workspace: await saveWorkbenchScan(workspace, result), result };
}
function review(
  workspace: ReturnType<typeof createWorkbench>,
  scanId: string,
  decisions: unknown[],
) {
  return {
    format: 'scrapmind-inventory-review',
    version: 1,
    scanId,
    inventoryFingerprint: inventoryFingerprint(workspace.inventory),
    confirmedPhysicalInventory: true,
    decisions,
  };
}
function declaration(id = 'owner-clamp') {
  return {
    id,
    name: 'Owner-declared fixture clamp',
    kind: 'tool',
    quantity: 1,
    available: true,
    capabilities: ['clamp'],
    notes: 'Synthetic owner assertion for a policy test. No physical inspection occurred.',
  };
}

it('requires explicit vision configuration and rejects malformed image bytes before contacting a provider', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return answer(photoObservationFixture());
  };
  const request = { inventory: demoInventory(), image: await photoDataUrl(pngBlob()) };
  await expect(
    scanInventory(request, { ...config, visionModel: undefined }, fetcher),
  ).rejects.toThrow('VISION_MODEL');
  await expect(
    scanInventory(
      {
        ...request,
        image:
          'data:image/jpeg;base64,' + Buffer.from(await pngBlob().arrayBuffer()).toString('base64'),
      },
      config,
      fetcher,
    ),
  ).rejects.toThrow('MIME');
  await expect(
    scanInventory({ ...request, image: 'file:///private/photo' }, config, fetcher),
  ).rejects.toThrow();
  await expect(
    scanInventory({ ...request, image: 'data:image/png;base64,AA==' }, config, fetcher),
  ).rejects.toThrow('supported PNG');
  await expect(
    photoDataUrl(new Blob([new Uint8Array(6_000_001)], { type: 'image/png' })),
  ).rejects.toThrow('6 MB');
  expect(calls).toBe(0);
});

it('routes explicit photo inputs to the vision model and retains uncertainty without mutating inventory', async () => {
  const inventory = demoInventory();
  const image = await photoDataUrl(pngBlob());
  const result = await scanInventory({ inventory, image }, config, async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('fixture-vision');
    expect(body.messages[0].content).toContain('untrusted task data');
    expect(body.messages[1].content[1].image_url.url).toBe(image);
    return answer(photoObservationFixture());
  });
  expect(result.scan.resolutions).toEqual([]);
  expect(result.scan.proposals[1].kind).toBeNull();
  expect(result.scan.proposals[1].capabilitySuggestions).toEqual([]);
  expect(result.scan.artifact.capturedAt).toBeUndefined();
  expect(result.scan.artifact.width).toBe(2); // Encoded pixels, never physical millimetres.
  expect(inventory).toEqual(demoInventory());
});

it('repairs invalid regions and nonexistent existing matches once without accepting measured or tested model fields', async () => {
  let calls = 0;
  const invalid = photoObservationFixture();
  invalid.candidates[0].possibleExistingItemIds = ['nonexistent'];
  const result = await scanInventory(
    { inventory: demoInventory(), image: await photoDataUrl(pngBlob()) },
    config,
    async (_url, init) => {
      calls++;
      if (calls === 2)
        expect(JSON.stringify(JSON.parse(init!.body as string).messages.at(-1))).toContain(
          'provided inventory IDs',
        );
      return answer(calls === 1 ? invalid : photoObservationFixture());
    },
  );
  expect(result.scan.attempts).toBe(2);
  for (const extra of [{ dimensions: { width: 100 } }, { testedCapabilities: ['clamp'] }]) {
    calls = 0;
    const unsafe = photoObservationFixture();
    Object.assign(unsafe.candidates[0], extra);
    await expect(
      scanInventory(
        { inventory: demoInventory(), image: await photoDataUrl(pngBlob()) },
        config,
        async () => {
          calls++;
          return answer(unsafe);
        },
      ),
    ).rejects.toThrow('after two attempts');
    expect(calls).toBe(2);
  }
  const badRegion = photoObservationFixture();
  badRegion.candidates[0].region!.right = 0.01;
  await expect(
    scanInventory(
      { inventory: demoInventory(), image: await photoDataUrl(pngBlob()) },
      config,
      async () => answer(badRegion),
    ),
  ).rejects.toThrow('positive width');
});

it('preserves old metadata-only workspaces and bundles the original scan photo with pending suggestions', async () => {
  const { workspace, result } = await fixture();
  const roundTrip = importWorkspace(exportWorkspace(workspace));
  expect(roundTrip.inventoryScans![0]).toEqual(result.scan);
  expect(workspaceArtifacts(roundTrip)).toHaveLength(1);
  const bundle = await exportEvidenceBundle(roundTrip, async () => result.image);
  const restored = await importEvidenceBundle(bundle);
  expect(restored.workspace.inventoryScans![0].proposals).toEqual(result.scan.proposals);
  expect(await restored.images[0].blob.arrayBuffer()).toEqual(
    await result.image.blob.arrayBuffer(),
  );
  const legacy = { ...workspace };
  delete legacy.inventoryScans;
  expect(importWorkspace(exportWorkspace(legacy)).inventoryScans).toBeUndefined();
  await expect(exportEvidenceBundle(workspace, async () => undefined)).rejects.toThrow(
    'missing or changed',
  );
});

it('refuses stale, altered, already-saved or incorrectly bound scan results', async () => {
  const { workspace, result } = await fixture();
  await expect(saveWorkbenchScan(workspace, result)).rejects.toThrow('immutable');
  const empty = createWorkbench('Fixture', demoInventory());
  await expect(
    saveWorkbenchScan(setWorkbenchAvailability(empty, 'arm', false), result),
  ).rejects.toThrow('Inventory changed');
  await expect(
    saveWorkbenchScan(empty, {
      ...result,
      image: { ...result.image, blob: new Blob(['changed']) },
    }),
  ).rejects.toThrow('missing, changed');
  expect(() =>
    inventoryScanSchema.parse({
      ...result.scan,
      artifact: { ...result.scan.artifact, buildId: 'another-scan' },
    }),
  ).toThrow('bound');
});

it('requires an owner decision and matching source photo; accepted declarations use owner counts and stay untested', async () => {
  const { workspace, result } = await fixture();
  const template = inventoryReviewTemplate(workspace, result.scan.id);
  expect(template.confirmedPhysicalInventory).toBe(false);
  expect(() => inventoryReviewSchema.parse(template)).toThrow();
  const input = review(workspace, result.scan.id, [
    {
      proposalId: 'proposal-1',
      action: 'add',
      ownerNote: 'Synthetic owner policy assertion, not a physical inspection.',
      item: declaration(),
    },
  ]);
  await expect(
    reviewWorkbenchScan(
      workspace,
      { ...input, confirmedPhysicalInventory: false },
      result.image.blob,
    ),
  ).rejects.toThrow('owner must confirm');
  await expect(reviewWorkbenchScan(workspace, input)).rejects.toThrow('matching scan photo');
  await expect(reviewWorkbenchScan(workspace, input, new Blob(['altered']))).rejects.toThrow(
    'matching scan photo',
  );
  const updated = await reviewWorkbenchScan(workspace, input, result.image.blob);
  const item = updated.inventory.find((entry) => entry.id === 'owner-clamp')!;
  expect(item.quantity).toBe(1); // The model guessed two; the owner supplied one.
  expect(item.evidence).toBe('declared');
  expect(item.testedCapabilities).toEqual([]);
  expect(item.dimensions).toBeUndefined();
  expect(updated.inventoryScans![0].resolutions[0].item).toEqual(item);
  await expect(
    reviewWorkbenchScan(
      updated,
      { ...input, inventoryFingerprint: inventoryFingerprint(updated.inventory) },
      result.image.blob,
    ),
  ).rejects.toThrow('already resolved');
});

it('requires explicit replacement instead of quantity merging and clears prior tested claims', async () => {
  const { workspace, result } = await fixture();
  workspace.inventory = workspace.inventory.map((item) =>
    item.id === 'clamp'
      ? { ...item, evidence: 'tested' as const, testedCapabilities: ['clamp' as const] }
      : item,
  );
  const decisions = [
    {
      proposalId: 'proposal-1',
      action: 'add',
      ownerNote: 'Synthetic replacement policy test.',
      item: declaration('clamp'),
    },
  ];
  await expect(
    reviewWorkbenchScan(workspace, review(workspace, result.scan.id, decisions), result.image.blob),
  ).rejects.toThrow('explicit replacement');
  decisions[0].action = 'replace';
  const updated = await reviewWorkbenchScan(
    workspace,
    review(workspace, result.scan.id, decisions),
    result.image.blob,
  );
  expect(updated.inventory.find((item) => item.id === 'clamp')).toMatchObject({
    quantity: 1,
    evidence: 'declared',
    testedCapabilities: [],
  });
  expect(updated.inventoryScans![0].resolutions[0].action).toBe('replaced');
  decisions[0].item.id = 'not-existing';
  await expect(
    reviewWorkbenchScan(workspace, review(workspace, result.scan.id, decisions), result.image.blob),
  ).rejects.toThrow('existing inventory item');
});

it('rejects duplicate, unknown, tested and stale owner declarations atomically', async () => {
  const { workspace, result } = await fixture();
  const accepted = {
    proposalId: 'proposal-1',
    action: 'add',
    ownerNote: 'Synthetic owner assertion.',
    item: declaration(),
  };
  for (const decisions of [
    [accepted, accepted],
    [accepted, { ...accepted, proposalId: 'proposal-2' }],
    [{ ...accepted, proposalId: 'missing' }],
    [{ ...accepted, item: { ...accepted.item, testedCapabilities: ['clamp'] } }],
  ])
    await expect(
      reviewWorkbenchScan(
        workspace,
        review(workspace, result.scan.id, decisions),
        result.image.blob,
      ),
    ).rejects.toThrow();
  await expect(
    reviewWorkbenchScan(
      setWorkbenchAvailability(workspace, 'arm', false),
      review(workspace, result.scan.id, [accepted]),
      result.image.blob,
    ),
  ).rejects.toThrow('Inventory changed during');
  expect(workspace.inventory).toHaveLength(12);
  expect(workspace.inventoryScans![0].resolutions).toEqual([]);
});

it('lets the owner reject uncertain or synthetic observations without promoting them into inventory', async () => {
  const { workspace, result } = await fixture('synthetic-test');
  await expect(
    reviewWorkbenchScan(
      workspace,
      review(workspace, result.scan.id, [
        {
          proposalId: 'proposal-1',
          action: 'add',
          ownerNote: 'Synthetic rejection test.',
          item: declaration(),
        },
      ]),
      result.image.blob,
    ),
  ).rejects.toThrow('synthetic scan');
  const rejected = await reviewWorkbenchScan(workspace, {
    ...review(workspace, result.scan.id, [
      {
        proposalId: 'proposal-1',
        action: 'reject',
        ownerNote: 'This is synthetic protocol data, not an actual item.',
      },
    ]),
    confirmedPhysicalInventory: false,
  });
  expect(rejected.inventory).toEqual(workspace.inventory);
  expect(rejected.inventoryScans![0].resolutions[0].action).toBe('rejected');
});

it('invalidates previous builds after accepted inventory changes and refuses using scan photos as build captures', async () => {
  const { workspace, result } = await fixture();
  const started = startWorkbenchBuild(workspace, 'document-scanner', 'prior-build');
  const { plan } = workbenchBuild(started, 'prior-build');
  await expect(attachWorkbenchImage(started, 'prior-build', result.image)).rejects.toThrow();
  expect(plan.status).toBe('ready');
  const updated = await reviewWorkbenchScan(
    started,
    review(started, result.scan.id, [
      {
        proposalId: 'proposal-1',
        action: 'add',
        ownerNote: 'Synthetic policy assertion.',
        item: declaration(),
      },
    ]),
    result.image.blob,
  );
  const report = await reportWorkbench(updated, async () => result.image);
  expect(report.builds[0].recordedStatus).toBe('stale');
  expect(report.inventoryScans[0]).toMatchObject({
    pending: 1,
    inputContextCurrent: false,
    image: { checksum: 'verified' },
  });
  const missing = await reportWorkbench(updated, async () => undefined);
  expect(missing.inventoryScans[0].image.checksum).toBe('missing');
  expect(renderWorkbenchReport(report)).toContain('capabilities owner-declared');
});
