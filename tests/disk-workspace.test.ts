import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDiskWorkbench,
  loadDiskWorkbench,
  loadDiskImage,
  mutateDiskWorkbench,
  readText,
} from '../scripts/disk-workspace.js';
import { runWorkbench } from '../scripts/workbench-cli.js';
import { createWorkbench, setWorkbenchAvailability } from '../core/workbench.js';
import { demoInventory } from '../core/fixtures.js';
import { pngBlob } from './image-fixture.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scrapmind-test-'));
  roots.push(root);
  const workspacePath = join(root, 'private-workbench');
  await createDiskWorkbench(workspacePath, createWorkbench('Public demo fixture', demoInventory()));
  return { root, workspacePath };
}

it('persists updates with a previous valid ledger and refuses destructive initialization', async () => {
  const { workspacePath } = await fixture();
  await expect(
    createDiskWorkbench(workspacePath, createWorkbench('Replacement', [])),
  ).rejects.toThrow();
  await mutateDiskWorkbench(workspacePath, (workspace) => ({
    workspace: setWorkbenchAvailability(workspace, 'arm', false),
  }));
  expect(
    (await loadDiskWorkbench(workspacePath)).inventory.find((item) => item.id === 'arm')!.available,
  ).toBe(false);
  const history = await readdir(join(workspacePath, 'history'));
  expect(history).toHaveLength(1);
  expect(
    JSON.parse(await readText(join(workspacePath, 'history', history[0]))).inventory.find(
      (item: { id: string }) => item.id === 'arm',
    ).available,
  ).toBe(true);
  if (process.platform !== 'win32')
    expect((await lstat(join(workspacePath, 'workspace.json'))).mode & 0o777).toBe(0o600);
});

it('serializes concurrent writers and preserves the ledger when an update fails', async () => {
  const { workspacePath } = await fixture();
  let unlock!: () => void, entered!: () => void;
  const barrier = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const active = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const first = mutateDiskWorkbench(workspacePath, async (workspace) => {
    entered();
    await barrier;
    return { workspace: setWorkbenchAvailability(workspace, 'arm', false) };
  });
  await active;
  await expect(
    mutateDiskWorkbench(workspacePath, (workspace) => ({
      workspace: setWorkbenchAvailability(workspace, 'lamp', false),
    })),
  ).rejects.toThrow('locked');
  unlock();
  await first;
  const before = await readFile(join(workspacePath, 'workspace.json'), 'utf8');
  await expect(
    mutateDiskWorkbench(workspacePath, () => {
      throw new Error('invalid update');
    }),
  ).rejects.toThrow('invalid update');
  expect(await readFile(join(workspacePath, 'workspace.json'), 'utf8')).toBe(before);
  expect(await readdir(workspacePath)).not.toContain('workspace.lock');
  await writeFile(join(workspacePath, 'workspace.lock'), 'Interrupted process');
  await expect(mutateDiskWorkbench(workspacePath, (workspace) => ({ workspace }))).rejects.toThrow(
    'interrupted process',
  );
  expect(await readText(join(workspacePath, 'workspace.lock'))).toBe('Interrupted process');
});

it('rejects linked metadata and bounded input before touching unrelated files', async () => {
  const { root, workspacePath } = await fixture();
  await writeFile(join(root, 'external.json'), '{"preserve":"me"}');
  await rm(join(workspacePath, 'workspace.json'));
  await symlink(join(root, 'external.json'), join(workspacePath, 'workspace.json'));
  await expect(loadDiskWorkbench(workspacePath)).rejects.toThrow();
  expect(await readText(join(root, 'external.json'))).toBe('{"preserve":"me"}');
  await expect(readText(join(root, 'external.json'), 3)).rejects.toThrow('byte limit');
});

it('does not delete a replacement lock or commit a ledger after losing write ownership', async () => {
  const { workspacePath } = await fixture();
  const before = await readText(join(workspacePath, 'workspace.json'));
  let release!: () => void, entered!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const active = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const write = mutateDiskWorkbench(workspacePath, async (workspace) => {
    entered();
    await barrier;
    return { workspace: setWorkbenchAvailability(workspace, 'arm', false) };
  });
  await active;
  await rm(join(workspacePath, 'workspace.lock'));
  await writeFile(join(workspacePath, 'workspace.lock'), 'Replacement lock preserved');
  release();
  await expect(write).rejects.toThrow('lock changed');
  expect(await readText(join(workspacePath, 'workspace.lock'))).toBe('Replacement lock preserved');
  expect(await readText(join(workspacePath, 'workspace.json'))).toBe(before);
});

it('runs a saved CLI build, imports a photo, audits its portable bundle, and reports removed image bytes', async () => {
  const { root, workspacePath } = await fixture();
  const outputs: string[] = [];
  const command = (args: string[]) =>
    runWorkbench([...args, '--workspace', workspacePath], (value) => outputs.push(value));
  await command(['start', '--recipe', 'document-scanner', '--id', 'cli-build']);
  await command(['show', '--build', 'cli-build', '--json']);
  const state = JSON.parse(outputs.at(-1)!);
  await writeFile(join(root, 'synthetic.png'), new Uint8Array(await pngBlob().arrayBuffer()));
  await command([
    'image',
    '--build',
    'cli-build',
    '--device',
    state.plan.allocations.find((entry: { matchedCapabilities: string[] }) =>
      entry.matchedCapabilities.includes('camera'),
    ).itemId,
    '--file',
    join(root, 'synthetic.png'),
  ]);
  const imageId = JSON.parse(outputs.at(-1)!).artifactId;
  for (const step of state.plan.recipe.steps)
    await command(['step', '--build', 'cli-build', '--step', step.id]);
  for (const check of state.plan.recipe.checks)
    await command([
      'check',
      '--build',
      'cli-build',
      '--check',
      check.id,
      '--outcome',
      'passed',
      '--note',
      'Synthetic software-test owner claim. No physical trial.',
      ...(check.evidenceKind === 'capture' ? ['--artifact', imageId] : []),
    ]);
  await command(['report', '--json']);
  expect(JSON.parse(outputs.at(-1)!).builds[0]).toMatchObject({
    recordedStatus: 'reported-pass',
    mediaIntegrity: 'verified',
  });
  await command(['bundle', '--output', join(root, 'bundle.json')]);
  await expect(command(['bundle', '--output', join(root, 'bundle.json')])).rejects.toThrow();
  await runWorkbench(['audit', '--bundle', join(root, 'bundle.json'), '--json'], (value) =>
    outputs.push(value),
  );
  expect(JSON.parse(outputs.at(-1)!).builds[0].mediaIntegrity).toBe('verified');
  const restored = join(root, 'restored');
  await runWorkbench(
    ['import', '--bundle', join(root, 'bundle.json'), '--workspace', restored],
    () => undefined,
  );
  const workspace = await loadDiskWorkbench(restored);
  expect(workspace.builds[0].results).toHaveLength(state.plan.recipe.checks.length);
  const artifact = workspace.builds[0].artifacts[0];
  expect((await loadDiskImage(restored, artifact))?.blob.size).toBe(artifact.byteLength);
  const imageFiles = await readdir(join(workspacePath, 'images'));
  await rm(join(workspacePath, 'images', imageFiles[0]));
  await command(['report', '--json']);
  expect(JSON.parse(outputs.at(-1)!).builds[0]).toMatchObject({
    recordedStatus: 'reported-pass',
    mediaIntegrity: 'needs-evidence',
  });
  await expect(command(['bundle', '--output', join(root, 'missing.json')])).rejects.toThrow(
    'missing or changed',
  );
});

it('rejects corrupt bundle imports before creating their destination and strict CLI argument mistakes', async () => {
  const { root, workspacePath } = await fixture();
  const path = join(root, 'invalid.json');
  await writeFile(path, '{}');
  const target = join(root, 'never-created');
  await expect(
    runWorkbench(['import', '--bundle', path, '--workspace', target], () => undefined),
  ).rejects.toThrow();
  expect(await readdir(root)).not.toContain('never-created');
  await expect(
    runWorkbench(
      ['availability', '--item', 'arm', '--available', 'maybe', '--workspace', workspacePath],
      () => undefined,
    ),
  ).rejects.toThrow('true or false');
  await expect(
    runWorkbench(['plan', '--invent', '--workspace', workspacePath], () => undefined),
  ).rejects.toThrow('Unknown option');
  await expect(runWorkbench(['plan', '--goal'], () => undefined)).rejects.toThrow(
    'Provide a value',
  );
  await expect(
    runWorkbench(
      ['plan', '--workspace', workspacePath, '--workspace', workspacePath],
      () => undefined,
    ),
  ).rejects.toThrow('Duplicate');
});
