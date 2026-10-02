import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  importWorkspace,
  exportWorkspace,
  workspaceSchema,
  type Workspace,
} from '../core/workspace.js';
import { verifyImageArtifact, imageArtifactSchema, type ImageArtifact } from '../core/evidence.js';
import { exportEvidenceBundle } from '../core/evidence-bundle.js';
import type { CapturedImage } from '../core/camera.js';

export async function readBounded(path: string, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error('File is not a regular file within the supported byte limit.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65536, limit - size + 1));
      const { bytesRead } = await handle.read(buffer);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > limit) throw new Error('File exceeds the supported byte limit.');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    await handle.close();
  }
}
export async function readText(path: string, limit = 5_000_000) {
  return new TextDecoder('utf-8', { fatal: true }).decode(await readBounded(path, limit));
}
function code(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code;
}
async function directory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Workspace directories must be real directories, not symbolic links.');
}
async function exclusiveWrite(path: string, bytes: string | Uint8Array) {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function writeNewOutput(path: string, content: string) {
  await exclusiveWrite(resolve(path), content);
}
async function atomicMetadata(root: string, text: string) {
  const temp = join(root, `.workspace-${crypto.randomUUID()}.tmp`);
  try {
    await exclusiveWrite(temp, text);
    // Refuse to replace a symbolic link even though rename would replace the link itself.
    try {
      const existing = await lstat(join(root, 'workspace.json'));
      if (!existing.isFile() || existing.isSymbolicLink())
        throw new Error('Workspace metadata must be a regular file.');
    } catch (error) {
      if (code(error) !== 'ENOENT') throw error;
    }
    await rename(temp, join(root, 'workspace.json'));
  } finally {
    await unlink(temp).catch((error) => {
      if (code(error) !== 'ENOENT') throw error;
    });
  }
}
function assetName(artifact: ImageArtifact) {
  artifact = imageArtifactSchema.parse(artifact);
  return `${artifact.sha256}.${artifact.mimeType === 'image/png' ? 'png' : 'jpg'}`;
}
async function putImage(root: string, image: CapturedImage) {
  if (!(await verifyImageArtifact(image.artifact, image.blob)))
    throw new Error('Image checksum does not match its evidence record.');
  const path = join(root, 'images', assetName(image.artifact));
  try {
    await exclusiveWrite(path, new Uint8Array(await image.blob.arrayBuffer()));
  } catch (error) {
    if (code(error) !== 'EEXIST') throw error;
    const existing = new Blob([await readBounded(path, 20_000_000)], {
      type: image.artifact.mimeType,
    });
    if (!(await verifyImageArtifact(image.artifact, existing)))
      throw new Error(
        'An existing image file is damaged. It was preserved; restore it from a valid bundle.',
      );
  }
}

export async function loadDiskWorkbench(root: string): Promise<Workspace> {
  root = resolve(root);
  await directory(root);
  return importWorkspace(await readText(join(root, 'workspace.json')));
}
export async function loadDiskImage(
  root: string,
  artifact: ImageArtifact,
): Promise<CapturedImage | undefined> {
  root = resolve(root);
  await directory(root);
  await directory(join(root, 'images'));
  try {
    return {
      artifact,
      blob: new Blob([await readBounded(join(root, 'images', assetName(artifact)), 20_000_000)], {
        type: artifact.mimeType,
      }),
    };
  } catch (error) {
    if (code(error) === 'ENOENT') return undefined;
    throw error;
  }
}

/** Refuse existing roots; fully validate a bundle and all bytes before creating its destination. */
export async function createDiskWorkbench(
  root: string,
  input: Workspace,
  images: CapturedImage[] = [],
): Promise<void> {
  root = resolve(root);
  const workspace = workspaceSchema.parse(input);
  const text = exportWorkspace(workspace);
  const byId = new Map(images.map((image) => [image.artifact.id, image]));
  if (byId.size !== images.length) throw new Error('Image IDs must be unique.');
  const referenced = [
    ...workspace.builds.flatMap((build) => build.artifacts),
    ...workspace.deviceTrials.flatMap((trial) => (trial.artifact ? [trial.artifact] : [])),
  ];
  if (
    referenced.length !== images.length ||
    images.some(
      (image) =>
        !referenced.some((artifact) => JSON.stringify(artifact) === JSON.stringify(image.artifact)),
    )
  )
    throw new Error('Initial images must exactly match the workspace evidence.');
  await exportEvidenceBundle(workspace, async (id) => byId.get(id));
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root, { mode: 0o700 });
  // If disk I/O fails, preserve this incomplete directory for inspection. Do not remove user files.
  await mkdir(join(root, 'images'), { mode: 0o700 });
  await mkdir(join(root, 'history'), { mode: 0o700 });
  for (const image of images) await putImage(root, image);
  await atomicMetadata(root, text);
}

/** Serialize writers; keep the previous valid ledger and write image bytes before committing new metadata. */
export async function mutateDiskWorkbench(
  root: string,
  update: (
    workspace: Workspace,
  ) =>
    | Promise<{ workspace: Workspace; images?: CapturedImage[] }>
    | { workspace: Workspace; images?: CapturedImage[] },
): Promise<Workspace> {
  root = resolve(root);
  await directory(root);
  const lockPath = join(root, 'workspace.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (code(error) === 'EEXIST')
      throw new Error(
        'Workspace is locked by another write or an interrupted process. Inspect workspace.lock before retrying; no lock was removed.',
      );
    throw error;
  }
  let lockIdentity: { ino: number; dev: number } | undefined;
  async function ownsLock() {
    if (!lockIdentity) return false;
    try {
      const current = await lstat(lockPath);
      return (
        current.isFile() &&
        !current.isSymbolicLink() &&
        current.ino === lockIdentity.ino &&
        current.dev === lockIdentity.dev
      );
    } catch (error) {
      if (code(error) === 'ENOENT') return false;
      throw error;
    }
  }
  async function requireLock() {
    if (!(await ownsLock()))
      throw new Error(
        'Workspace lock changed during this write. The ledger was not committed. Inspect the current lock before retrying.',
      );
  }
  try {
    lockIdentity = await lock.stat();
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    const previous = await loadDiskWorkbench(root);
    const result = await update(previous);
    const workspace = workspaceSchema.parse({
      ...result.workspace,
      exportedAt: new Date().toISOString(),
    });
    const text = exportWorkspace(workspace);
    await requireLock();
    await directory(join(root, 'images'));
    await directory(join(root, 'history'));
    const referenced = [
      ...workspace.builds.flatMap((build) => build.artifacts),
      ...workspace.deviceTrials.flatMap((trial) => (trial.artifact ? [trial.artifact] : [])),
    ];
    for (const image of result.images ?? []) {
      if (
        !referenced.some((artifact) => JSON.stringify(artifact) === JSON.stringify(image.artifact))
      )
        throw new Error('New image is not bound to the updated ledger.');
      await putImage(root, image);
    }
    await exclusiveWrite(
      join(root, 'history', `${Date.now()}-${crypto.randomUUID()}.json`),
      exportWorkspace(previous),
    );
    await requireLock();
    await atomicMetadata(root, text);
    return workspace;
  } finally {
    try {
      await lock.close();
    } finally {
      if (await ownsLock()) await unlink(lockPath);
    }
  }
}
