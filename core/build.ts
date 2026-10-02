import { z } from 'zod';
import { inventoryFingerprint, type InventoryItem, type Plan } from './schema.js';

export const checkResultSchema = z
  .object({
    checkId: z.string().min(1),
    outcome: z.enum(['passed', 'failed', 'unknown']),
    note: z.string().trim().min(1).max(3000),
    recordedAt: z.string().datetime(),
    artifactId: z.string().max(100).optional(),
  })
  .strict();
export const buildSessionSchema = z
  .object({
    id: z.string().min(1),
    recipeId: z.string().min(1),
    inventoryFingerprint: z.string(),
    recipeFingerprint: z.string(),
    completedSteps: z.array(z.string()),
    results: z.array(checkResultSchema),
    startedAt: z.string().datetime(),
  })
  .strict();
export type BuildSession = z.infer<typeof buildSessionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export function startBuild(plan: Plan, id: string, now = new Date().toISOString()): BuildSession {
  if (plan.status === 'draft' || (plan.recipe.source === 'generated' && !plan.recipe.reviewed))
    throw new Error('Review the generated proposal before starting a build.');
  if (plan.status !== 'ready')
    throw new Error('Resolve the missing inventory before starting this build.');
  return {
    id,
    recipeId: plan.recipe.id,
    inventoryFingerprint: plan.inventoryFingerprint,
    recipeFingerprint: plan.recipeFingerprint,
    completedSteps: [],
    results: [],
    startedAt: now,
  };
}

export function buildIsStale(session: BuildSession, items: InventoryItem[]): boolean {
  return session.inventoryFingerprint !== inventoryFingerprint(items);
}

export function recordCheck(session: BuildSession, plan: Plan, result: CheckResult): BuildSession {
  if (
    session.recipeId !== plan.recipe.id ||
    session.inventoryFingerprint !== plan.inventoryFingerprint ||
    session.recipeFingerprint !== plan.recipeFingerprint
  )
    throw new Error('The plan changed. Start a new build before recording results.');
  const parsed = checkResultSchema.parse(result);
  if (!plan.recipe.checks.some((check) => check.id === parsed.checkId))
    throw new Error('Unknown acceptance check.');
  return {
    ...session,
    results: [...session.results.filter((entry) => entry.checkId !== parsed.checkId), parsed],
  };
}

export function buildStatus(
  session: BuildSession,
  plan: Plan,
): 'in-progress' | 'reported-pass' | 'needs-work' | 'stale' {
  if (
    session.recipeId !== plan.recipe.id ||
    session.inventoryFingerprint !== plan.inventoryFingerprint ||
    session.recipeFingerprint !== plan.recipeFingerprint
  )
    return 'stale';
  if (session.results.some((result) => result.outcome === 'failed')) return 'needs-work';
  const stepsComplete = plan.recipe.steps.every((step) => session.completedSteps.includes(step.id));
  const checksPass = plan.recipe.checks.every((check) =>
    session.results.some((result) => result.checkId === check.id && result.outcome === 'passed'),
  );
  return stepsComplete && checksPass ? 'reported-pass' : 'in-progress';
}
