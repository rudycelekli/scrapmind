import { z } from 'zod';
import { inventoryFingerprint, type InventoryItem, type Plan } from './schema.js';
import { imageArtifactSchema, verifyImageArtifact, type ImageArtifact } from './evidence.js';

export const checkResultSchema = z
  .object({
    checkId: z.string().min(1).max(80),
    outcome: z.enum(['passed', 'failed', 'unknown']),
    note: z.string().trim().min(1).max(3000),
    recordedAt: z.string().datetime(),
    artifactId: z.string().min(1).max(100).optional(),
    artifactIds: z.array(z.string().min(1).max(100)).max(20).default([]),
  })
  .strict();
export const buildSessionSchema = z
  .object({
    id: z.string().min(1).max(100),
    recipeId: z.string().min(1).max(100),
    inventoryFingerprint: z.string(),
    recipeFingerprint: z.string(),
    completedSteps: z.array(z.string().min(1).max(80)).max(15),
    results: z.array(checkResultSchema).max(10),
    artifacts: z.array(imageArtifactSchema).max(100).default([]),
    startedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((session, ctx) => {
    if (new Set(session.completedSteps).size !== session.completedSteps.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Completed step IDs must be unique',
        path: ['completedSteps'],
      });
    for (const key of ['results', 'artifacts'] as const) {
      const ids = session[key].map((entry) => ('id' in entry ? entry.id : entry.checkId));
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: `${key} identifiers must be unique`, path: [key] });
    }
    for (const artifact of session.artifacts)
      if (
        artifact.buildId !== session.id ||
        artifact.inventoryFingerprint !== session.inventoryFingerprint ||
        artifact.recipeFingerprint !== session.recipeFingerprint
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Image belongs to another build revision',
          path: ['artifacts'],
        });
    for (const result of session.results)
      if (
        references(result).some((id) => !session.artifacts.some((artifact) => artifact.id === id))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Check references missing image evidence',
          path: ['results'],
        });
    for (const artifact of session.artifacts) {
      if (artifact.parentId) {
        const parentIndex = session.artifacts.findIndex((entry) => entry.id === artifact.parentId);
        const parent = session.artifacts[parentIndex];
        if (
          parentIndex < 0 ||
          parentIndex >= session.artifacts.indexOf(artifact) ||
          parent.itemId !== artifact.itemId ||
          parent.source !== artifact.source ||
          parent.capturedAt !== artifact.capturedAt
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Derived image requires an earlier matching parent',
            path: ['artifacts'],
          });
      }
    }
  });
export type BuildSession = z.infer<typeof buildSessionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type CheckResultInput = z.input<typeof checkResultSchema>;

function references(result: CheckResult): string[] {
  return [...new Set([...result.artifactIds, ...(result.artifactId ? [result.artifactId] : [])])];
}

function assertCurrent(session: BuildSession, plan: Plan): void {
  if (
    session.recipeId !== plan.recipe.id ||
    session.inventoryFingerprint !== plan.inventoryFingerprint ||
    session.recipeFingerprint !== plan.recipeFingerprint
  )
    throw new Error('The plan changed. Start a new build before recording results.');
}

function hasCaptureEvidence(session: BuildSession, plan: Plan, result: CheckResult): boolean {
  const check = plan.recipe.checks.find((entry) => entry.id === result.checkId);
  if (!check) return false;
  if (check.evidenceKind !== 'capture') return true;
  const roots = new Set<string>();
  for (const id of references(result)) {
    let artifact = session.artifacts.find((entry) => entry.id === id);
    if (!artifact || artifact.source === 'test-fixture') return false;
    if (
      !plan.allocations.some(
        (entry) =>
          entry.itemId === artifact?.itemId && entry.matchedCapabilities.includes('camera'),
      )
    )
      return false;
    while (artifact.parentId) {
      const parent = session.artifacts.find((entry) => entry.id === artifact?.parentId);
      if (!parent) return false;
      artifact = parent;
    }
    roots.add(artifact.id);
  }
  return roots.size >= (check.minArtifacts ?? 1);
}

export function startBuild(plan: Plan, id: string, now = new Date().toISOString()): BuildSession {
  if (plan.status === 'draft' || (plan.recipe.source === 'generated' && !plan.recipe.reviewed))
    throw new Error('Review the generated proposal before starting a build.');
  if (plan.status !== 'ready')
    throw new Error('Resolve the missing inventory before starting this build.');
  return buildSessionSchema.parse({
    id,
    recipeId: plan.recipe.id,
    inventoryFingerprint: plan.inventoryFingerprint,
    recipeFingerprint: plan.recipeFingerprint,
    completedSteps: [],
    results: [],
    artifacts: [],
    startedAt: now,
  });
}

export function buildIsStale(session: BuildSession, items: InventoryItem[]): boolean {
  return session.inventoryFingerprint !== inventoryFingerprint(items);
}

export function recordCheck(
  session: BuildSession,
  plan: Plan,
  result: CheckResultInput,
): BuildSession {
  session = buildSessionSchema.parse(session);
  assertCurrent(session, plan);
  const parsed = checkResultSchema.parse(result);
  if (!plan.recipe.checks.some((check) => check.id === parsed.checkId))
    throw new Error('Unknown acceptance check.');
  if (parsed.outcome === 'passed' && !hasCaptureEvidence(session, plan, parsed))
    throw new Error(
      'A passed capture check requires distinct attached images from an allocated camera.',
    );
  return buildSessionSchema.parse({
    ...session,
    results: [...session.results.filter((entry) => entry.checkId !== parsed.checkId), parsed],
  });
}

export async function attachImage(
  session: BuildSession,
  plan: Plan,
  artifact: ImageArtifact,
  blob: Blob,
): Promise<BuildSession> {
  session = buildSessionSchema.parse(session);
  assertCurrent(session, plan);
  const parsed = imageArtifactSchema.parse(artifact);
  if (!plan.allocations.some((entry) => entry.itemId === parsed.itemId))
    throw new Error('Image device is not allocated to this plan.');
  if (session.artifacts.some((entry) => entry.id === parsed.id))
    throw new Error('Image artifact IDs are immutable. Use a new ID.');
  if (!(await verifyImageArtifact(parsed, blob)))
    throw new Error('Image bytes do not match the evidence checksum.');
  return buildSessionSchema.parse({ ...session, artifacts: [...session.artifacts, parsed] });
}

export function completeStep(
  session: BuildSession,
  plan: Plan,
  stepId: string,
  completed = true,
): BuildSession {
  session = buildSessionSchema.parse(session);
  assertCurrent(session, plan);
  if (!plan.recipe.steps.some((step) => step.id === stepId)) throw new Error('Unknown build step.');
  return {
    ...session,
    completedSteps: [
      ...session.completedSteps.filter((id) => id !== stepId),
      ...(completed ? [stepId] : []),
    ],
  };
}

export function buildStatus(
  session: BuildSession,
  plan: Plan,
): 'in-progress' | 'reported-pass' | 'needs-work' | 'stale' {
  session = buildSessionSchema.parse(session);
  if (
    session.recipeId !== plan.recipe.id ||
    session.inventoryFingerprint !== plan.inventoryFingerprint ||
    session.recipeFingerprint !== plan.recipeFingerprint
  )
    return 'stale';
  if (session.results.some((result) => result.outcome === 'failed')) return 'needs-work';
  const stepsComplete = plan.recipe.steps.every((step) => session.completedSteps.includes(step.id));
  const checksPass = plan.recipe.checks.every((check) =>
    session.results.some(
      (result) =>
        result.checkId === check.id &&
        result.outcome === 'passed' &&
        hasCaptureEvidence(session, plan, result),
    ),
  );
  return stepsComplete && checksPass ? 'reported-pass' : 'in-progress';
}
