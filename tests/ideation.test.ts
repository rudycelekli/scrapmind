import { expect, it } from 'vitest';
import { conceptSchema, compileConcept, ideate, resourceSignals } from '../core/ideation.js';
import { modelContent } from '../core/model.js';
import { demoInventory } from '../core/fixtures.js';
import {
  createWorkbench,
  saveWorkbenchIdeas,
  setWorkbenchAvailability,
  reviewWorkbenchRecipe,
  startWorkbenchBuild,
} from '../core/workbench.js';
import { importWorkspace, exportWorkspace } from '../core/workspace.js';
import { conceptFixture } from './ideation-fixture.js';

const config = { baseUrl: 'http://localhost:11434/v1', model: 'synthetic-test-model' };
function response(value: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  );
}
function sequence(
  values: unknown[],
  inspect?: (body: Record<string, unknown>, index: number) => void,
): typeof fetch {
  let index = 0;
  return async (_url, init) => {
    if (index >= values.length) throw new Error('Unexpected additional model request');
    inspect?.(JSON.parse(init!.body as string), index);
    return response(values[index++]);
  };
}
const request = () => ({ inventory: demoInventory(), goal: 'compare tabletop shadows', count: 1 });

it('guides a rejected physical action toward existing role capabilities without relaxing validation', async () => {
  const invalid = conceptFixture();
  invalid.steps[1].action = 'rotate';
  let inspectedRepair = false;
  const result = await ideate(
    request(),
    config,
    sequence(
      [{ concepts: [invalid] }, { concepts: [conceptFixture()] }, { issues: [] }],
      (body, index) => {
        if (index !== 1) return;
        const messages = body.messages as { role: string; content: string }[];
        const guidance = messages.at(-1)!.content;
        const hints = JSON.parse(
          guidance
            .split('Role action guidance derived only from your declared roles: ')[1]
            .split('. Correct the action/target')[0],
        );
        const lamp = hints[0].roles.find((role: { targetRole: number }) => role.targetRole === 1);
        expect(lamp.declaredCapabilities).toEqual(['light']);
        expect(lamp.allowedActions).toContain('illuminate');
        expect(lamp.allowedActions).not.toContain('rotate');
        expect(guidance).toContain('Do not add unsupported capabilities');
        inspectedRepair = true;
      },
    ),
  );
  expect(inspectedRepair).toBe(true);
  expect(result.attempts).toBe(2);
  expect(result.proposals[0].concept.steps[1].action).toBe('illuminate');
  expect(result.proposals[0].recipe.reviewed).toBe(false);
});

it('rejects invalid action targets, hidden references and unused roles before allocation', () => {
  const concept = conceptFixture();
  expect(() =>
    conceptSchema.parse({
      ...concept,
      steps: [{ ...concept.steps[0], action: 'project' }, ...concept.steps.slice(1)],
    }),
  ).toThrow();
  expect(() =>
    conceptSchema.parse({
      ...concept,
      steps: [{ ...concept.steps[0], action: 'measure', targetRole: 0 }, ...concept.steps.slice(1)],
    }),
  ).toThrow('measure requires');
  expect(() =>
    conceptSchema.parse({
      ...concept,
      steps: concept.steps.map((step) => ({
        ...step,
        roles: [0],
        targetRole: 0,
        action: 'arrange',
      })),
    }),
  ).toThrow('Every physical role');
  expect(() =>
    conceptSchema.parse({
      ...concept,
      steps: [{ ...concept.steps[0], targetRole: 5 }, ...concept.steps.slice(1)],
    }),
  ).toThrow('target role');
  expect(compileConcept(concept, 'test-concept').reviewed).toBe(false);
  expect(() =>
    conceptSchema.parse({
      ...concept,
      checks: concept.checks.filter((check) => check.evidenceKind !== 'capture'),
    }),
  ).toThrow('capture acceptance');
  expect(() =>
    conceptSchema.parse({
      ...concept,
      steps: [
        { ...concept.steps[0], instruction: 'Fasten targetRole 1 with roles [1,2].' },
        ...concept.steps.slice(1),
      ],
    }),
  ).toThrow('plain human-readable');
});

it('retains software-detected prose contradictions even when the model critic reports none', async () => {
  const unsafe = conceptFixture();
  unsafe.steps[0].instruction = 'Fasten the camera to the surface using a clamp.';
  unsafe.reasoning = 'The camera will project an image onto the panel.';
  const values = [{ concepts: [unsafe] }, { issues: [] }, { concepts: [unsafe] }, { issues: [] }];
  const result = await ideate(request(), config, sequence(values));
  expect(result.proposals[0].resourceReview.status).toBe('issues-found');
  expect(result.proposals[0].resourceReview.issues.map((issue) => issue.kind)).toEqual([
    'unsupported-function',
    'role-mismatch',
  ]);
  const ordinary = conceptFixture();
  ordinary.steps[0].instruction =
    'Arrange the camera on the existing desk without a clamp. No ruler is needed.';
  ordinary.reasoning = 'A camera records images; it is not a projector.';
  expect(resourceSignals([ordinary])).toEqual([]);
});

it('generates a portfolio, passes allocation context to the critic, and preserves inspectable provenance', async () => {
  const result = await ideate(
    request(),
    config,
    sequence([{ concepts: [conceptFixture()] }, { issues: [] }], (body, index) => {
      const messages = body.messages as { content: string }[];
      if (index === 0) expect(messages[0].content).toContain('untrusted task data');
      if (index === 1) {
        const data = JSON.parse(messages[1].content);
        expect(data.proposals[0].allocations).toHaveLength(3);
        expect(data.inventory).toHaveLength(12);
      }
    }),
  );
  expect(result.calls).toBe(2);
  expect(result.proposals[0].plan.status).toBe('draft');
  expect(result.proposals[0].resourceReview.status).toBe('no-issues-reported');
  expect(result.proposals[0].physicalReview).toBe('pending');
  let workspace = saveWorkbenchIdeas(
    createWorkbench('Public demo fixture', demoInventory()),
    result,
  );
  workspace = importWorkspace(exportWorkspace(workspace));
  expect(workspace.recipes[0].ai?.assumptionsToTest).toEqual(conceptFixture().assumptionsToTest);
  expect(workspace.recipes[0].ai?.reasoning).toBe(conceptFixture().reasoning);
  expect(() => startWorkbenchBuild(workspace, workspace.recipes[0].id, 'draft-build')).toThrow(
    'Review',
  );
  workspace = reviewWorkbenchRecipe(workspace, workspace.recipes[0].id, true);
  expect(
    startWorkbenchBuild(workspace, workspace.recipes[0].id, 'reviewed-build').builds,
  ).toHaveLength(1);
  expect(() =>
    saveWorkbenchIdeas(setWorkbenchAvailability(workspace, 'lamp', false), result),
  ).toThrow('Inventory changed');
});

it('repairs schema errors before critique without relaxing action contracts', async () => {
  const invalid = conceptFixture();
  invalid.steps[1].targetRole = 0;
  const result = await ideate(
    request(),
    config,
    sequence(
      [{ concepts: [invalid] }, { concepts: [conceptFixture()] }, { issues: [] }],
      (body, index) => {
        if (index === 1) expect(JSON.stringify(body.messages)).toContain('illuminate requires');
      },
    ),
  );
  expect(result.attempts).toBe(2);
  expect(result.calls).toBe(3);
});

it('critiques again after a semantic repair and never carries forward the old review', async () => {
  const issue = {
    conceptIndex: 0,
    stepIndex: 2,
    kind: 'unsupported-function',
    detail: 'The camera cannot project an image. It must record a visible scene.',
  };
  const corrected = conceptFixture();
  corrected.title = 'Revised shadow station';
  const result = await ideate(
    request(),
    config,
    sequence([
      { concepts: [conceptFixture()] },
      { issues: [issue] },
      { concepts: [corrected] },
      { issues: [] },
    ]),
  );
  expect(result.calls).toBe(4);
  expect(result.repairAttempted).toBe(true);
  expect(result.repairApplied).toBe(true);
  expect(result.proposals[0].recipe.title).toBe(corrected.title);
  expect(result.proposals[0].resourceReview.status).toBe('no-issues-reported');
});

it('retains unresolved issues if a repair is malformed and requires a separate acknowledgement', async () => {
  const issue = {
    conceptIndex: 0,
    stepIndex: 0,
    kind: 'undeclared-resource',
    detail: 'The instruction requires an undeclared mount.',
  };
  const result = await ideate(
    request(),
    config,
    sequence([{ concepts: [conceptFixture()] }, { issues: [issue] }, { concepts: [] }]),
  );
  expect(result.repairApplied).toBe(false);
  expect(result.proposals[0].resourceReview.status).toBe('issues-found');
  const workspace = saveWorkbenchIdeas(createWorkbench('Demo', demoInventory()), result);
  expect(() => reviewWorkbenchRecipe(workspace, workspace.recipes[0].id, true)).toThrow(
    'unresolved',
  );
  expect(
    reviewWorkbenchRecipe(workspace, workspace.recipes[0].id, true, true).recipes[0].reviewed,
  ).toBe(true);
});

it('does not label malformed or incorrectly indexed critiques as clean', async () => {
  for (const review of [
    { wrong: 'shape' },
    {
      issues: [
        { conceptIndex: 1, stepIndex: null, kind: 'role-mismatch', detail: 'Wrong concept' },
      ],
    },
  ]) {
    const result = await ideate(
      request(),
      config,
      sequence([{ concepts: [conceptFixture()] }, review]),
    );
    expect(result.proposals[0].resourceReview.status).toBe('not-completed');
    expect(result.repairAttempted).toBe(false);
  }
});

it('preserves explicit missing resource roles and rejects repeated invalid proposals', async () => {
  const result = await ideate(
    { ...request(), inventory: [] },
    config,
    sequence([{ concepts: [conceptFixture()] }, { issues: [] }]),
  );
  expect(result.proposals[0].inventoryFit).toBe(0);
  expect(result.proposals[0].plan.status).toBe('blocked');
  await expect(
    ideate(request(), config, sequence([{ concepts: [] }, { concepts: [] }])),
  ).rejects.toThrow('after two attempts');
});

it('bounds streamed provider bytes before parsing, without exposing error contents', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(modelContent(new Response(stream))).rejects.toThrow('exceeds 1 MB');
  expect(cancelled).toBe(true);
  await expect(
    modelContent(new Response('private provider body', { status: 401 })),
  ).rejects.toThrow('HTTP 401');
  await expect(modelContent(new Response('private provider body'))).rejects.toThrow(
    'invalid completion envelope',
  );
  await expect(
    modelContent(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }),
      ),
    ),
  ).rejects.toThrow('output token limit');
  await expect(
    modelContent(
      new Response(
        JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'length' }] }),
      ),
    ),
  ).rejects.toThrow('output token limit');
});

it('supports reasoning-compatible token parameters and a separately configured critic model', async () => {
  const result = await ideate(
    request(),
    {
      ...config,
      profile: 'reasoning',
      maxOutputTokens: 20000,
      reasoningEffort: 'high',
      reviewModel: 'synthetic-review-model',
    },
    sequence([{ concepts: [conceptFixture()] }, { issues: [] }], (body, index) => {
      expect(body.max_completion_tokens).toBe(20000);
      expect(body.reasoning_effort).toBe('high');
      expect(body.temperature).toBeUndefined();
      expect(body.max_tokens).toBeUndefined();
      expect(body.model).toBe(index === 0 ? config.model : 'synthetic-review-model');
    }),
  );
  expect(result.proposals[0].recipe.ai?.resourceReview.model).toBe('synthetic-review-model');
});

it('retains an undeclared required stand hidden in boundaries despite a clean critic', async () => {
  const concept = conceptFixture();
  concept.roles.forEach((role) => {
    role.capabilities = role.capabilities.filter((capability) => capability !== 'stable-base');
  });
  concept.boundaries = ['The phone must be used in a stand or similar support.'];
  const signals = resourceSignals([concept]);
  expect(
    signals.some((issue) => issue.kind === 'undeclared-resource' && issue.stepIndex === null),
  ).toBe(true);
  const result = await ideate(
    request(),
    config,
    sequence([{ concepts: [concept] }, { issues: [] }, { concepts: [concept] }, { issues: [] }]),
  );
  expect(result.proposals[0].resourceReview.status).toBe('issues-found');
  expect(
    result.proposals[0].resourceReview.issues.some((issue) => issue.kind === 'undeclared-resource'),
  ).toBe(true);
  concept.boundaries = ['Do not use a stand or a mount.'];
  expect(resourceSignals([concept]).some((issue) => issue.kind === 'undeclared-resource')).toBe(
    false,
  );
});

it('does not treat an explicitly declared missing support role as invented hardware', () => {
  const concept = conceptFixture();
  concept.boundaries = ['The camera must be positioned in a tripod mount.'];
  expect(resourceSignals([concept]).some((issue) => issue.kind === 'undeclared-resource')).toBe(
    true,
  );
  concept.roles.push({
    label: 'Missing tripod',
    explanation: 'An explicitly needed support.',
    quantity: 1,
    capabilities: ['vertical-support'],
    kinds: ['material'],
  });
  concept.steps[0].roles.push(3);
  expect(resourceSignals([concept]).some((issue) => issue.kind === 'undeclared-resource')).toBe(
    false,
  );
});

it('makes at most five calls across schema repair, critique, semantic repair and fresh critique', async () => {
  const invalid = conceptFixture();
  invalid.steps[1].targetRole = 0;
  const issue = {
    conceptIndex: 0,
    stepIndex: 0,
    kind: 'undeclared-resource',
    detail: 'An undeclared mount is required.',
  };
  const result = await ideate(
    request(),
    config,
    sequence([
      { concepts: [invalid] },
      { concepts: [conceptFixture()] },
      { issues: [issue] },
      { concepts: [conceptFixture()] },
      { issues: [issue] },
    ]),
  );
  expect(result.calls).toBe(5);
  expect(result.proposals[0].resourceReview.status).toBe('issues-found');
});
