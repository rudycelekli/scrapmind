import { z } from 'zod';
import {
  startBuild,
  completeStep,
  recordCheck,
  attachImage,
  type CheckResultInput,
} from './build.js';
import { recipeSchema } from './recipe-schema.js';
import { recipes } from './recipes.js';
import { planRecipe } from './planner.js';
import { inventorySchema, inventoryFingerprint, type Plan, type Recipe } from './schema.js';
import { workspaceSchema, type Workspace } from './workspace.js';
import type { CapturedImage } from './camera.js';
import type { IdeationResult } from './ideation.js';

export function createWorkbench(name: string, inventory: unknown): Workspace {
  return workspaceSchema.parse({
    format: 'scrapmind-workspace',
    version: 1,
    name,
    inventory: inventorySchema.parse(inventory),
    exportedAt: new Date().toISOString(),
  });
}

export function workbenchCatalog(workspace: Workspace): Recipe[] {
  workspace = workspaceSchema.parse(workspace);
  const catalog = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  workspace.recipes.forEach((recipe) => catalog.set(recipe.id, recipe));
  return [...catalog.values()];
}

export function workbenchPlan(workspace: Workspace, recipeId: string): Plan {
  const recipe = workbenchCatalog(workspace).find((entry) => entry.id === recipeId);
  if (!recipe) throw new Error(`Unknown recipe: ${recipeId}`);
  return planRecipe(recipe, workspace.inventory);
}

export function workbenchBuild(workspace: Workspace, buildId: string) {
  workspace = workspaceSchema.parse(workspace);
  const session = workspace.builds.find((entry) => entry.id === buildId);
  if (!session) throw new Error(`Unknown build: ${buildId}`);
  return { session, plan: workbenchPlan(workspace, session.recipeId) };
}

function replaceBuild(workspace: Workspace, session: Workspace['builds'][number]): Workspace {
  return workspaceSchema.parse({
    ...workspace,
    builds: workspace.builds.map((entry) => (entry.id === session.id ? session : entry)),
  });
}

export function startWorkbenchBuild(
  workspace: Workspace,
  recipeId: string,
  id: string = crypto.randomUUID(),
): Workspace {
  workspace = workspaceSchema.parse(workspace);
  if (workspace.builds.some((entry) => entry.id === id))
    throw new Error('Build IDs must be unique. Use a new ID.');
  const session = startBuild(workbenchPlan(workspace, recipeId), id);
  return workspaceSchema.parse({ ...workspace, builds: [...workspace.builds, session] });
}

export function updateWorkbenchInventory(workspace: Workspace, inventory: unknown): Workspace {
  return workspaceSchema.parse({
    ...workspaceSchema.parse(workspace),
    inventory: inventorySchema.parse(inventory),
  });
}

export function setWorkbenchAvailability(
  workspace: Workspace,
  itemId: string,
  available: boolean,
): Workspace {
  workspace = workspaceSchema.parse(workspace);
  available = z.boolean().parse(available);
  if (!workspace.inventory.some((item) => item.id === itemId))
    throw new Error(`Unknown inventory item: ${itemId}`);
  return updateWorkbenchInventory(
    workspace,
    workspace.inventory.map((item) => (item.id === itemId ? { ...item, available } : item)),
  );
}

export function importWorkbenchRecipe(
  workspace: Workspace,
  input: unknown,
  replace = false,
): Workspace {
  workspace = workspaceSchema.parse(workspace);
  const recipe = recipeSchema.parse(input);
  if (workbenchCatalog(workspace).some((entry) => entry.id === recipe.id) && replace !== true)
    throw new Error(
      'Recipe ID already exists. Explicitly request replacement after reviewing the change.',
    );
  return workspaceSchema.parse({
    ...workspace,
    recipes: [
      ...workspace.recipes.filter((entry) => entry.id !== recipe.id),
      {
        ...recipe,
        source: recipe.source === 'generated' ? 'generated' : 'imported',
      },
    ],
  });
}

export function reviewWorkbenchRecipe(
  workspace: Workspace,
  recipeId: string,
  acknowledged: boolean,
  acknowledgeResourceIssues = false,
): Workspace {
  workspace = workspaceSchema.parse(workspace);
  if (acknowledged !== true)
    throw new Error('Acknowledge that you reviewed the physical procedure and declared roles.');
  const recipe = workspace.recipes.find((entry) => entry.id === recipeId);
  if (!recipe) throw new Error('Review applies to an imported or generated workspace recipe.');
  if (
    recipe.ai &&
    recipe.ai.resourceReview.status !== 'no-issues-reported' &&
    acknowledgeResourceIssues !== true
  )
    throw new Error(
      'Read the unresolved or incomplete AI resource review and explicitly acknowledge its issues before reviewing this draft.',
    );
  return workspaceSchema.parse({
    ...workspace,
    recipes: workspace.recipes.map((entry) =>
      entry.id === recipeId ? { ...entry, reviewed: true } : entry,
    ),
  });
}

/** A model request runs outside storage locks; reject saving it against changed inputs. */
export function saveWorkbenchIdeas(workspace: Workspace, result: IdeationResult): Workspace {
  workspace = workspaceSchema.parse(workspace);
  const fingerprint = inventoryFingerprint(workspace.inventory);
  if (!result.proposals.length || result.proposals.length > 3)
    throw new Error('Save one through three invention drafts.');
  for (const proposal of result.proposals) {
    const recipe = recipeSchema.parse(proposal.recipe);
    if (recipe.source !== 'generated' || !recipe.ai || recipe.ai.operationId !== result.operationId)
      throw new Error('Only attributed AI invention drafts can be saved through this operation.');
    if (recipe.ai.inventoryFingerprint !== fingerprint)
      throw new Error(
        'Inventory changed while the model was working. Re-run invention with the current inventory.',
      );
    workspace = importWorkbenchRecipe(workspace, { ...recipe, reviewed: false });
  }
  return workspace;
}

export function completeWorkbenchStep(
  workspace: Workspace,
  buildId: string,
  stepId: string,
  completed = true,
): Workspace {
  const { session, plan } = workbenchBuild(workspace, buildId);
  return replaceBuild(workspace, completeStep(session, plan, stepId, z.boolean().parse(completed)));
}

export function recordWorkbenchCheck(
  workspace: Workspace,
  buildId: string,
  result: CheckResultInput,
): Workspace {
  const { session, plan } = workbenchBuild(workspace, buildId);
  return replaceBuild(workspace, recordCheck(session, plan, result));
}

export async function attachWorkbenchImage(
  workspace: Workspace,
  buildId: string,
  image: CapturedImage,
): Promise<Workspace> {
  const { session, plan } = workbenchBuild(workspace, buildId);
  return replaceBuild(workspace, await attachImage(session, plan, image.artifact, image.blob));
}
