import { expect, it } from 'vitest';
import { requestTuning, validateProvider } from '../core/model.js';
import { ideate } from '../core/ideation.js';
import { ideaEvaluationCases } from '../core/evaluation-cases.js';
import { evaluateIdeas } from '../core/evaluation.js';
import { conceptFixture } from './ideation-fixture.js';
import { demoInventory } from '../core/fixtures.js';

const config = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'synthetic-test-model' };

it('keeps provider effort untouched by default and makes effort independent of token-field compatibility', () => {
  expect(requestTuning(config, 0.3, 8192)).not.toHaveProperty('reasoning_effort');
  expect(requestTuning({ ...config, reasoningEffort: 'none' }, 0.3, 8192)).toMatchObject({
    reasoning_effort: 'none',
    max_tokens: 8192,
    temperature: 0.3,
  });
  expect(
    requestTuning({ ...config, profile: 'reasoning', reasoningEffort: 'high' }, 0, 8192),
  ).toEqual({ reasoning_effort: 'high', max_completion_tokens: 16384 });
  expect(() => validateProvider({ ...config, reasoningEffort: 'unexpected' as 'high' })).toThrow();
});

it('rejects an invalid effort before inference and retains the explicitly configured effort in evaluation metadata', async () => {
  const entry = {
    ...ideaEvaluationCases()[0],
    inventory: demoInventory(),
    requiredActions: ['capture' as const, 'illuminate' as const],
  };
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    expect(body.reasoning_effort).toBe('none');
    calls++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(
                calls === 1 ? { concepts: [conceptFixture()] } : { issues: [] },
              ),
            },
          },
        ],
      }),
    );
  };
  await expect(
    ideate(
      { inventory: entry.inventory, goal: entry.goal, count: 1 },
      { ...config, reasoningEffort: 'unexpected' as 'high' },
      fetcher,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  const report = await evaluateIdeas(
    [entry],
    { ...config, reasoningEffort: 'none' },
    { provenance: 'synthetic-protocol', fetcher },
  );
  expect(calls).toBe(2);
  expect(report.provider.reasoningEffort).toBe('none');
  expect(report.provenance).toBe('synthetic-protocol');
});
