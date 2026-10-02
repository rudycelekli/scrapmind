import { z } from 'zod';
import type { CapturedImage } from './camera.js';
import { verifyImageArtifact } from './evidence.js';
import { workspaceSchema, type Workspace } from './workspace.js';

const MAX_BUNDLE_IMAGE_BYTES = 20_000_000;
const MAX_BUNDLE_JSON_CHARS = 35_000_000;
const bundleSchema = z
  .object({
    format: z.literal('scrapmind-evidence-bundle'),
    version: z.literal(1),
    workspace: workspaceSchema,
    images: z
      .array(
        z
          .object({
            artifactId: z.string().min(1).max(100),
            mimeType: z.enum(['image/png', 'image/jpeg']),
            base64: z
              .string()
              .max(27_000_000)
              .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();

function artifactsFor(workspace: Workspace) {
  const artifacts = workspace.builds.flatMap((build) => build.artifacts);
  if (artifacts.length > 1000) throw new Error('Evidence bundle is limited to 1000 images.');
  if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length)
    throw new Error('Evidence bundle requires globally unique artifact IDs.');
  if (artifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0) > MAX_BUNDLE_IMAGE_BYTES)
    throw new Error('Evidence bundle images exceed 20 MB. Export a smaller workspace.');
  return artifacts;
}

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16384)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  return btoa(chunks.join(''));
}

/** JSON workspace export contains metadata only. This explicit bundle also contains the photos. */
export async function exportEvidenceBundle(
  workspace: Workspace,
  load: (artifactId: string) => Promise<CapturedImage | undefined>,
): Promise<string> {
  const parsed = workspaceSchema.parse(workspace);
  const artifacts = artifactsFor(parsed);
  const images: z.infer<typeof bundleSchema>['images'] = [];
  for (const artifact of artifacts) {
    const image = await load(artifact.id);
    if (!image || !(await verifyImageArtifact(artifact, image.blob)))
      throw new Error(`Image ${artifact.id} is missing or changed. The bundle was not exported.`);
    images.push({
      artifactId: artifact.id,
      mimeType: artifact.mimeType,
      base64: toBase64(new Uint8Array(await image.blob.arrayBuffer())),
    });
  }
  const json = JSON.stringify({
    format: 'scrapmind-evidence-bundle',
    version: 1,
    workspace: parsed,
    images,
  });
  if (json.length > MAX_BUNDLE_JSON_CHARS) throw new Error('Evidence bundle exceeds 35 MB.');
  return json;
}

/** Fully validate before the caller mutates its workspace or saves any local image. */
export async function importEvidenceBundle(
  json: string,
): Promise<{ workspace: Workspace; images: CapturedImage[] }> {
  if (json.length > MAX_BUNDLE_JSON_CHARS) throw new Error('Evidence bundle exceeds 35 MB.');
  const bundle = bundleSchema.parse(JSON.parse(json));
  const artifacts = artifactsFor(bundle.workspace);
  if (
    bundle.images.length !== artifacts.length ||
    new Set(bundle.images.map((image) => image.artifactId)).size !== bundle.images.length
  )
    throw new Error('Bundle images must correspond exactly to the workspace evidence.');
  const images: CapturedImage[] = [];
  let totalBytes = 0;
  for (const encoded of bundle.images) {
    const artifact = artifacts.find((entry) => entry.id === encoded.artifactId);
    if (!artifact || encoded.mimeType !== artifact.mimeType)
      throw new Error('Bundle image has no matching evidence record.');
    if (encoded.base64.length !== 4 * Math.ceil(artifact.byteLength / 3))
      throw new Error('Bundle image length does not match evidence.');
    const decoded = atob(encoded.base64);
    totalBytes += decoded.length;
    if (totalBytes > MAX_BUNDLE_IMAGE_BYTES)
      throw new Error('Evidence bundle images exceed 20 MB.');
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: encoded.mimeType });
    if (!(await verifyImageArtifact(artifact, blob)))
      throw new Error('Bundle image checksum does not match.');
    images.push({ artifact, blob });
  }
  return { workspace: bundle.workspace, images };
}
