import { z } from 'zod';
import { buildSessionSchema } from './build.js';
import { recipeSchema } from './recipe-schema.js';
import { inventorySchema } from './schema.js';

export const workspaceSchema = z
  .object({
    format: z.literal('scrapmind-workspace'),
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    inventory: inventorySchema,
    recipes: z.array(recipeSchema).max(30).default([]),
    builds: z.array(buildSessionSchema).max(100).default([]),
    exportedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((workspace, ctx) => {
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

export function importWorkspace(json: string): Workspace {
  if (json.length > 5_000_000) throw new Error('Workspace file exceeds 5 MB.');
  return workspaceSchema.parse(JSON.parse(json));
}
export function exportWorkspace(workspace: Workspace): string {
  return JSON.stringify(workspaceSchema.parse(workspace), null, 2);
}
