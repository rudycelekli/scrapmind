import { z } from 'zod';
import { inventorySchema, capabilitySchema } from './schema.js';
import { conceptSchema, compileConcept, ideate, resourceSignals } from './ideation.js';
import { planRecipe, describeReplan } from './planner.js';
import { inventionRequestSchema, providerMode, type ProviderConfig } from './inventor.js';
import { validateProvider } from './model.js';

export const evaluationCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    label: z.string().trim().min(1).max(200),
    goal: inventionRequestSchema.shape.goal,
    inventory: inventorySchema,
    count: z.number().int().min(1).max(3).default(1),
    requiredActions: z.array(conceptSchema.shape.steps.element.shape.action).min(1).max(8),
    requiredAllocatedCapabilities: z.array(capabilitySchema).max(18).default([]),
    resourcePolicy: z.enum(['declared-only', 'missing-allowed']),
    requiredMissingCapabilities: z.array(capabilitySchema).max(18).default([]),
    removeItemIds: z.array(z.string().min(1).max(100)).max(250).default([]),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.resourcePolicy === 'declared-only' && entry.requiredMissingCapabilities.length)
      ctx.addIssue({
        code: 'custom',
        message: 'A declared-only case cannot require missing resources.',
      });
    for (const name of [
      'requiredActions',
      'requiredAllocatedCapabilities',
      'requiredMissingCapabilities',
      'removeItemIds',
    ] as const)
      if (new Set(entry[name]).size !== entry[name].length)
        ctx.addIssue({
          code: 'custom',
          message: 'Evaluation requirements must be unique.',
          path: [name],
        });
    if (entry.removeItemIds.some((id) => !entry.inventory.some((item) => item.id === id)))
      ctx.addIssue({
        code: 'custom',
        message: 'Removal challenges must name supplied inventory items.',
      });
  });
export const evaluationSuiteSchema = z
  .array(evaluationCaseSchema)
  .min(1)
  .max(20)
  .superRefine((cases, ctx) => {
    if (new Set(cases.map((entry) => entry.id)).size !== cases.length)
      ctx.addIssue({ code: 'custom', message: 'Evaluation case IDs must be unique.' });
  });
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

/** Deterministic contract checks. Passing never establishes useful or correct physical behavior. */
export function assessConcept(rawCase: EvaluationCase, rawConcept: unknown) {
  const entry = evaluationCaseSchema.parse(rawCase);
  const concept = conceptSchema.parse(rawConcept);
  const recipe = compileConcept(concept, 'evaluation-draft');
  const plan = planRecipe(recipe, entry.inventory, entry.goal);
  const problems: string[] = [];
  for (const action of entry.requiredActions)
    if (!concept.steps.some((step) => step.action === action))
      problems.push(`Required ${action} action is absent.`);
  if (entry.resourcePolicy === 'declared-only' && plan.missing.length)
    problems.push('The procedure requires units outside the available declared inventory.');
  for (const capability of entry.requiredAllocatedCapabilities)
    if (!plan.allocations.some((allocation) => allocation.matchedCapabilities.includes(capability)))
      problems.push(`Required ${capability} capability has no allocated declared role.`);
  for (const capability of entry.requiredMissingCapabilities)
    if (
      !plan.missing.some((missing) =>
        missing.requirement.alternatives.some((rule) => rule.capabilities.includes(capability)),
      )
    )
      problems.push(
        `Required missing ${capability} resource is not explicitly represented by an unallocated role.`,
      );
  const signals = resourceSignals([concept]).map(({ kind, detail, stepIndex }) => ({
    kind,
    detail,
    stepIndex,
  }));
  if (signals.length)
    problems.push('Conservative instruction-resource text signals remain unresolved.');
  const changedInventory = entry.inventory.map((item) =>
    entry.removeItemIds.includes(item.id) ? { ...item, available: false } : item,
  );
  const after = entry.removeItemIds.length
    ? planRecipe(recipe, changedInventory, entry.goal)
    : undefined;
  return {
    contract: problems.length ? ('fail' as const) : ('pass' as const),
    problems,
    signals,
    coverage: { coveredUnits: plan.coveredUnits, totalUnits: plan.totalUnits },
    allocations: plan.allocations,
    missing: plan.missing,
    ...(after
      ? {
          removalChallenge: {
            removedItemIds: entry.removeItemIds,
            allocations: after.allocations,
            missing: after.missing,
            status: after.status,
            changes: describeReplan(plan, after, changedInventory),
          },
        }
      : {}),
    humanReview: 'pending' as const,
    physicalValidation: 'not-performed' as const,
  };
}

export async function evaluateIdeas(
  rawCases: unknown,
  config: ProviderConfig,
  options: {
    provenance?: 'live-model' | 'synthetic-protocol';
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    onCase?: (entry: EvaluationCase, state: 'started' | 'finished') => void;
  } = {},
) {
  const cases = evaluationSuiteSchema.parse(rawCases);
  validateProvider(config);
  const provenance = options.provenance ?? 'live-model';
  if (options.fetcher && provenance !== 'synthetic-protocol')
    throw new Error('Injected evaluation responses must be labeled synthetic-protocol.');
  const startedAt = new Date().toISOString();
  const results = [];
  for (const entry of cases) {
    if (options.signal?.aborted) break;
    options.onCase?.(entry, 'started');
    const started = performance.now();
    let requests = 0;
    const fetcher: typeof fetch = async (input, init) => {
      requests++;
      const signals = [init?.signal, options.signal].filter((signal): signal is AbortSignal =>
        Boolean(signal),
      );
      return (options.fetcher ?? fetch)(input, {
        ...init,
        ...(signals.length ? { signal: AbortSignal.any(signals) } : {}),
      });
    };
    let result;
    try {
      const portfolio = await ideate(
        { goal: entry.goal, inventory: entry.inventory, count: entry.count },
        config,
        fetcher,
      );
      options.signal?.throwIfAborted();
      result = {
        case: entry,
        outcome: 'generated' as const,
        requests,
        elapsedMs: Math.round(performance.now() - started),
        portfolio,
        assessments: portfolio.proposals.map((proposal) => assessConcept(entry, proposal.concept)),
      };
    } catch (error) {
      result = {
        case: entry,
        outcome: options.signal?.aborted ? ('cancelled' as const) : ('failed' as const),
        requests,
        elapsedMs: Math.round(performance.now() - started),
        // Never persist arbitrary network exceptions: they can contain URLs or credentials.
        error: options.signal?.aborted
          ? 'Evaluation was cancelled.'
          : 'The model operation failed; no validated portfolio was returned.',
        failureKind: options.signal?.aborted
          ? ('cancelled' as const)
          : error instanceof Error &&
              error.message.startsWith('The model did not produce valid invention concepts')
            ? ('invalid-concepts' as const)
            : error instanceof Error && error.message.includes('output token limit')
              ? ('output-limit' as const)
              : ('provider-or-operation' as const),
      };
    }
    results.push(result);
    options.onCase?.(entry, 'finished');
    if (options.signal?.aborted) break;
  }
  const assessments = results.flatMap((result) => result.assessments ?? []);
  const critiques = results.flatMap(
    (result) => result.portfolio?.proposals.map((proposal) => proposal.resourceReview) ?? [],
  );
  return {
    format: 'scrapmind-ai-evaluation' as const,
    version: 1 as const,
    procedure: 'inventory-idea-contracts-v1' as const,
    id: crypto.randomUUID(),
    provenance,
    startedAt,
    finishedAt: new Date().toISOString(),
    provider: {
      model: config.model,
      reviewModel: config.reviewModel ?? config.model,
      mode: providerMode(config),
      profile: config.profile ?? 'compatible',
      format: config.format ?? 'json_schema',
      maxOutputTokens: config.maxOutputTokens ?? (config.profile === 'reasoning' ? 16384 : 8192),
    },
    summary: {
      selectedCases: cases.length,
      attemptedCases: results.length,
      generatedCases: results.filter((result) => result.outcome === 'generated').length,
      failedCases: results.filter((result) => result.outcome === 'failed').length,
      cancelledCases: results.filter((result) => result.outcome === 'cancelled').length,
      generatedProposals: assessments.length,
      contractPasses: assessments.filter((assessment) => assessment.contract === 'pass').length,
      contractFailures: assessments.filter((assessment) => assessment.contract === 'fail').length,
      pendingHumanReviews: assessments.length,
      criticIssues: critiques.reduce((sum, critique) => sum + critique.issues.length, 0),
      incompleteCritiques: critiques.filter((critique) => critique.status === 'not-completed')
        .length,
      requests: results.reduce((sum, result) => sum + result.requests, 0),
    },
    results,
    boundary:
      'Contract checks and model critiques do not establish instruction completeness, usefulness, physical feasibility, recognition accuracy, or research novelty. Every generated proposal still requires independent human review and physical validation. Synthetic protocol runs are not model benchmarks.',
  };
}
export type IdeaEvaluation = Awaited<ReturnType<typeof evaluateIdeas>>;
