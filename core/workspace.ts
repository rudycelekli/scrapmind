import { z } from 'zod';
import { buildSessionSchema } from './build.js';
import { recipeSchema } from './recipe-schema.js';
import { inventorySchema } from './schema.js';
import { deviceTrialSchema } from './device-trial.js';
import { inventoryScanSchema } from './inventory-scan.js';

export const workspaceSchema = z
  .object({
    format: z.literal('scrapmind-workspace'),
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    inventory: inventorySchema,
    recipes: z.array(recipeSchema).max(30).default([]),
    builds: z.array(buildSessionSchema).max(100).default([]),
    deviceTrials: z.array(deviceTrialSchema).max(100).default([]),
    inventoryScans: z.array(inventoryScanSchema).max(100).optional(),
    exportedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((workspace, ctx) => {
    const scans = workspace.inventoryScans ?? [];
    if (new Set(scans.map((scan) => scan.id)).size !== scans.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Inventory scan IDs must be unique',
        path: ['inventoryScans'],
      });
    const artifacts = [
      ...workspace.builds.flatMap((build) => build.artifacts),
      ...workspace.deviceTrials.flatMap((trial) => (trial.artifact ? [trial.artifact] : [])),
      ...scans.map((scan) => scan.artifact),
    ];
    if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Image evidence IDs must be globally unique',
        path: ['inventoryScans'],
      });
    if (
      new Set(workspace.deviceTrials.map((trial) => trial.id)).size !==
      workspace.deviceTrials.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Device trial IDs must be unique',
        path: ['deviceTrials'],
      });
    if (new Set(workspace.recipes.map((recipe) => recipe.id)).size !== workspace.recipes.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Custom recipe IDs must be unique',
        path: ['recipes'],
      });
    if (new Set(workspace.builds.map((build) => build.id)).size !== workspace.builds.length)
      ctx.addIssue({ code: 'custom', message: 'Build IDs must be unique', path: ['builds'] });
  });
export type Workspace = z.infer<typeof workspaceSchema>;

/** One source of image references for storage, exports, and audits. */
export function workspaceArtifacts(input: Workspace) {
  const workspace = workspaceSchema.parse(input);
  return [
    ...workspace.builds.flatMap((build) => build.artifacts),
    ...workspace.deviceTrials.flatMap((trial) => (trial.artifact ? [trial.artifact] : [])),
    ...(workspace.inventoryScans ?? []).map((scan) => scan.artifact),
  ];
}

export function importWorkspace(json: string): Workspace {
  if (json.length > 5_000_000 || new TextEncoder().encode(json).byteLength > 5_000_000)
    throw new Error('Workspace file exceeds 5 MB.');
  return workspaceSchema.parse(JSON.parse(json));
}
export function exportWorkspace(workspace: Workspace): string {
  const json = JSON.stringify(workspaceSchema.parse(workspace), null, 2);
  if (new TextEncoder().encode(json).byteLength > 5_000_000)
    throw new Error('Workspace file exceeds 5 MB.');
  return json;
}
