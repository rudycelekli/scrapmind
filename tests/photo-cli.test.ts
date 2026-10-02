import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDiskWorkbench, loadDiskImage, readText } from '../scripts/disk-workspace.js';
import { runWorkbench } from '../scripts/workbench-cli.js';
import { photoObservationFixture } from './inventory-scan-fixture.js';
import { pngBlob } from './image-fixture.js';

const roots: string[] = [],
  servers: Server[] = [];
const envNames = [
  'SCRAPMIND_AI_BASE_URL',
  'SCRAPMIND_AI_MODEL',
  'SCRAPMIND_AI_VISION_MODEL',
  'SCRAPMIND_AI_KEY',
  'SCRAPMIND_AI_PROFILE',
  'SCRAPMIND_AI_REASONING_EFFORT',
  'SCRAPMIND_AI_FORMAT',
  'SCRAPMIND_AI_MAX_OUTPUT_TOKENS',
  'SCRAPMIND_AI_REVIEW_MODEL',
] as const;
let priorEnv: Partial<Record<(typeof envNames)[number], string | undefined>> | undefined;
afterEach(async () => {
  if (priorEnv)
    for (const name of envNames) {
      if (priorEnv[name] === undefined) delete process.env[name];
      else process.env[name] = priorEnv[name];
    }
  priorEnv = undefined;
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scrapmind-photo-cli-'));
  roots.push(root);
  const workspacePath = join(root, 'workbench');
  await runWorkbench(
    ['init', '--workspace', workspacePath, '--name', 'Synthetic photo CLI protocol fixture'],
    () => undefined,
  );
  await writeFile(join(root, 'synthetic.png'), new Uint8Array(await pngBlob().arrayBuffer()));
  priorEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) delete process.env[name];
  const requests: unknown[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    const observation = photoObservationFixture();
    observation.candidates[0].possibleExistingItemIds = [];
    response.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(observation) } }],
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  process.env.SCRAPMIND_AI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.SCRAPMIND_AI_MODEL = 'synthetic-generator';
  const outputs: string[] = [];
  const command = (args: string[]) =>
    runWorkbench([...args, '--workspace', workspacePath], (value) => outputs.push(value));
  return { root, workspacePath, outputs, command, requests };
}

it('executes explicit scan, owner review, changed inventory, report, bundle audit and restore through the saved CLI', async () => {
  const { root, workspacePath, outputs, command, requests } = await fixture();
  await expect(command(['scan', '--photo', join(root, 'synthetic.png')])).rejects.toThrow(
    'VISION_MODEL',
  );
  expect(requests).toHaveLength(0);
  process.env.SCRAPMIND_AI_VISION_MODEL = 'synthetic-vision-protocol';
  await command(['scan', '--photo', join(root, 'synthetic.png'), '--json']);
  const scan = JSON.parse(outputs.at(-1)!);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ model: 'synthetic-vision-protocol' });
  expect((await loadDiskWorkbench(workspacePath)).inventory).toHaveLength(0);
  await command(['scan-show', '--scan', scan.id]);
  expect(outputs.at(-1)).toContain('pending owner review');
  const reviewPath = join(root, 'owner-review.json');
  await command(['scan-template', '--scan', scan.id, '--output', reviewPath]);
  await expect(
    command(['scan-template', '--scan', scan.id, '--output', reviewPath]),
  ).rejects.toThrow();
  await expect(command(['scan-review', '--file', reviewPath])).rejects.toThrow();
  const review = JSON.parse(await readText(reviewPath));
  review.confirmedPhysicalInventory = true;
  review.decisions = [
    {
      proposalId: 'proposal-1',
      action: 'add',
      ownerNote: 'Synthetic test assertion; no real physical inspection.',
      item: {
        id: 'fixture-tool',
        name: 'Synthetic declared fixture tool',
        kind: 'tool',
        quantity: 1,
        available: true,
        capabilities: ['clamp'],
        notes: '',
      },
    },
    {
      proposalId: 'proposal-2',
      action: 'reject',
      ownerNote: 'The synthetic response does not establish identity.',
    },
  ];
  await writeFile(reviewPath, JSON.stringify(review));
  await command(['scan-review', '--file', reviewPath]);
  const workspace = await loadDiskWorkbench(workspacePath);
  expect(workspace.inventory).toHaveLength(1);
  expect(workspace.inventory.find((item) => item.id === 'fixture-tool')).toMatchObject({
    evidence: 'declared',
    testedCapabilities: [],
    quantity: 1,
  });
  expect(workspace.inventoryScans![0].resolutions).toHaveLength(2);
  expect((await loadDiskImage(workspacePath, scan.artifact))!.blob.size).toBe(
    scan.artifact.byteLength,
  );
  await command(['report', '--json']);
  expect(JSON.parse(outputs.at(-1)!).inventoryScans[0]).toMatchObject({
    pending: 0,
    image: { checksum: 'verified' },
  });
  const bundlePath = join(root, 'photo-bundle.json');
  await command(['bundle', '--output', bundlePath]);
  await runWorkbench(['audit', '--bundle', bundlePath, '--json'], (value) => outputs.push(value));
  expect(JSON.parse(outputs.at(-1)!).inventoryScans[0].image.checksum).toBe('verified');
  const restoredPath = join(root, 'restored');
  await runWorkbench(
    ['import', '--bundle', bundlePath, '--workspace', restoredPath],
    () => undefined,
  );
  expect((await loadDiskWorkbench(restoredPath)).inventoryScans![0].resolutions).toHaveLength(2);
  const files = await readdir(join(workspacePath, 'images'));
  await rm(join(workspacePath, 'images', files[0]));
  await command(['report', '--json']);
  expect(JSON.parse(outputs.at(-1)!).inventoryScans[0].image.checksum).toBe('missing');
  await expect(command(['bundle', '--output', join(root, 'missing.json')])).rejects.toThrow(
    'missing or changed',
  );
});
