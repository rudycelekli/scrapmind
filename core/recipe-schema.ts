import { z } from 'zod';
import { capabilitySchema } from './schema.js';

const text = z.string().trim().min(1).max(2000);
export const recipeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
    title: z.string().trim().min(1).max(100),
    subtitle: z.string().trim().min(1).max(240),
    category: z.enum(['fabrication', 'alchemy']),
    goalTerms: z.array(z.string().min(1).max(50)).min(1).max(30),
    minutes: z.number().int().min(1).max(1440),
    difficulty: z.enum(['Easy', 'Moderate']),
    visual: z.enum(['scanner', 'stand', 'lightbox', 'timelapse', 'turntable']),
    requirements: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
            label: z.string().trim().min(1).max(100),
            quantity: z.number().int().min(1).max(8),
            explanation: text,
            alternatives: z
              .array(
                z
                  .object({
                    capabilities: z.array(capabilitySchema).min(1).max(8),
                    kinds: z
                      .array(z.enum(['material', 'device', 'tool']))
                      .min(1)
                      .max(3)
                      .optional(),
                    minDimensions: z
                      .object({
                        length: z.number().positive().max(100000).optional(),
                        width: z.number().positive().max(100000).optional(),
                        height: z.number().positive().max(100000).optional(),
                      })
                      .strict()
                      .optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(4),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            title: z.string().trim().min(1).max(100),
            instruction: text,
            requirements: z.array(z.string().min(1).max(40)).min(1).max(10),
            check: text,
          })
          .strict(),
      )
      .min(1)
      .max(15),
    checks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().trim().min(1).max(150),
            procedure: text,
            evidenceKind: z.enum(['observation', 'measurement', 'capture']),
            minArtifacts: z.number().int().min(1).max(20).optional(),
            minCaptureSpanMs: z.number().int().min(1).max(86400000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    boundaries: z.array(text).min(1).max(10),
    source: z.enum(['starter', 'generated', 'imported']).optional(),
    reviewed: z.boolean().optional(),
    ai: z
      .object({
        goal: z.string().trim().min(3).max(1000),
        model: z.string().trim().min(1).max(200),
        mode: z.enum(['local', 'remote']),
        operationId: z.string().uuid(),
        inventoryFingerprint: z.string().min(1).max(1_000_000),
        reasoning: z.string().trim().min(1).max(1500),
        newUse: z.string().trim().min(1).max(1500),
        assumptionsToTest: z.array(z.string().trim().min(1).max(1500)).min(1).max(8),
        resourceReview: z
          .object({
            model: z.string().trim().min(1).max(200).optional(),
            status: z.enum(['no-issues-reported', 'issues-found', 'not-completed']),
            issues: z
              .array(
                z
                  .object({
                    kind: z.string().min(1).max(100),
                    detail: z.string().min(1).max(1500),
                    stepIndex: z.number().int().min(0).max(14).nullable(),
                  })
                  .strict(),
              )
              .max(12),
            boundary: z.string().min(1).max(2000),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((recipe, ctx) => {
    if (recipe.ai) {
      const review = recipe.ai.resourceReview;
      if (
        (review.status === 'no-issues-reported' && review.issues.length > 0) ||
        (review.status === 'issues-found' && review.issues.length === 0)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'AI resource review state must agree with its issue list',
          path: ['ai', 'resourceReview'],
        });
      review.issues.forEach((issue, index) => {
        if (issue.stepIndex !== null && issue.stepIndex >= recipe.steps.length)
          ctx.addIssue({
            code: 'custom',
            message: 'AI review references a nonexistent step',
            path: ['ai', 'resourceReview', 'issues', index, 'stepIndex'],
          });
      });
    }
    for (const collection of ['requirements', 'steps', 'checks'] as const) {
      const ids = recipe[collection].map((entry) => entry.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: 'custom',
          message: `${collection} IDs must be unique`,
          path: [collection],
        });
    }
    const ids = new Set(recipe.requirements.map((entry) => entry.id));
    recipe.checks.forEach((check, index) => {
      if (
        check.minCaptureSpanMs !== undefined &&
        (check.evidenceKind !== 'capture' || (check.minArtifacts ?? 1) < 2)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Timed capture checks require at least two images',
          path: ['checks', index, 'minCaptureSpanMs'],
        });
      if (check.minArtifacts !== undefined && check.evidenceKind !== 'capture')
        ctx.addIssue({
          code: 'custom',
          message: 'Only capture checks specify an image count',
          path: ['checks', index, 'minArtifacts'],
        });
    });
    recipe.steps.forEach((step, stepIndex) =>
      step.requirements.forEach((id, referenceIndex) => {
        if (!ids.has(id))
          ctx.addIssue({
            code: 'custom',
            message: `Every step requirement must reference a declared requirement. Unknown role: ${id}. Declared roles: ${[...ids].join(', ')}.`,
            path: ['steps', stepIndex, 'requirements', referenceIndex],
          });
      }),
    );
    if (recipe.requirements.reduce((sum, req) => sum + req.quantity, 0) > 20)
      ctx.addIssue({
        code: 'custom',
        message: 'A recipe may require at most 20 units',
        path: ['requirements'],
      });
  });
