import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessConcept,
  evaluateIdeas,
  evaluationCaseSchema,
  evaluationSuiteSchema,
} from '../core/evaluation.js';
import { ideaEvaluationCases } from '../core/evaluation-cases.js';
import { conceptFixture } from './ideation-fixture.js';
import { demoInventory } from '../core/fixtures.js';
import { runEvaluation } from '../scripts/evaluate.js';

const config = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'synthetic-evaluation-model' };
function entry() {
  return evaluationCaseSchema.parse({
    id: 'fixture',
    label: 'Synthetic evaluation',
    goal: 'Compare shadows',
    inventory: demoInventory(),
    requiredActions: ['illuminate', 'capture'],
    resourcePolicy: 'declared-only',
    removeItemIds: ['phone', 'webcam'],
  });
}
function response(value: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  );
}
function sequence(values: unknown[]): typeof fetch {
  let index = 0;
  return async () => {
    if (index >= values.length) throw new Error('Unexpected fixture request');
    return response(values[index++]);
  };
}

it('independently rechecks allocation, required actions, and loss of a camera while leaving human review pending', () => {
  const result = assessConcept(entry(), conceptFixture());
  expect(result.contract).toBe('pass');
  expect(result.humanReview).toBe('pending');
  expect(result.physicalValidation).toBe('not-performed');
  expect(result.removalChallenge?.missing[0].requirement.alternatives[0].capabilities).toContain(
    'camera',
  );
  expect(
    result.removalChallenge?.allocations.some((allocation) =>
      ['phone', 'webcam'].includes(allocation.itemId),
    ),
  ).toBe(false);
  const absent = assessConcept({ ...entry(), requiredActions: ['display'] }, conceptFixture());
  expect(absent.contract).toBe('fail');
  expect(absent.problems).toContain('Required display action is absent.');
  expect(
    assessConcept({ ...entry(), requiredAllocatedCapabilities: ['compute'] }, conceptFixture())
      .problems,
  ).toContain('Required compute capability has no allocated declared role.');
});

it('distinguishes excess resource demands from honestly required missing camera roles', () => {
  const inventory = demoInventory().filter((item) => ['lamp', 'panel'].includes(item.id));
  const strict = assessConcept({ ...entry(), inventory, removeItemIds: [] }, conceptFixture());
  expect(strict.contract).toBe('fail');
  expect(strict.coverage.coveredUnits).toBeLessThan(strict.coverage.totalUnits);
  const missing = assessConcept(
    {
      ...entry(),
      inventory,
      removeItemIds: [],
      resourcePolicy: 'missing-allowed',
      requiredMissingCapabilities: ['camera'],
    },
    conceptFixture(),
  );
  expect(missing.contract).toBe('pass');
  expect(missing.missing).toHaveLength(1);
  const unspecified = assessConcept(
    { ...entry(), requiredMissingCapabilities: ['microphone'], resourcePolicy: 'missing-allowed' },
    conceptFixture(),
  );
  expect(unspecified.contract).toBe('fail');
});

it('counts one phone once and rejects duplicate physical roles even with sequential claims', () => {
  const concept = conceptFixture();
  concept.roles = [
    {
      label: 'Phone',
      explanation: 'The single supplied phone.',
      quantity: 1,
      capabilities: ['camera', 'display'],
      kinds: ['device'],
    },
  ];
  concept.steps = [
    {
      title: 'Capture',
      instruction: 'Capture the scene with the phone.',
      action: 'capture',
      targetRole: 0,
      roles: [0],
      check: 'Inspect the image.',
    },
    {
      title: 'Display',
      instruction: 'Display the image on the same phone.',
      action: 'display',
      targetRole: 0,
      roles: [0],
      check: 'Inspect the screen.',
    },
  ];
  const phoneCase = ideaEvaluationCases().find((value) => value.id === 'single-phone')!;
  expect(assessConcept(phoneCase, concept).coverage).toEqual({ coveredUnits: 1, totalUnits: 1 });
  concept.roles.push({ ...concept.roles[0] });
  concept.steps[1].targetRole = 1;
  concept.steps[1].roles = [1];
  expect(assessConcept(phoneCase, concept).contract).toBe('fail');
});

it('retains text contradictions independently of clean model critiques and labels synthetic benchmarks', async () => {
  const concept = conceptFixture();
  concept.steps[0].instruction = 'Fasten the camera to the panel with a clamp.';
  const report = await evaluateIdeas(
    [entry()],
    { ...config, apiKey: 'fixture-secret-never-export' },
    {
      provenance: 'synthetic-protocol',
      fetcher: sequence([
        { concepts: [concept] },
        { issues: [] },
        { concepts: [concept] },
        { issues: [] },
      ]),
    },
  );
  expect(report.summary).toMatchObject({
    generatedCases: 1,
    contractPasses: 0,
    contractFailures: 1,
    pendingHumanReviews: 1,
    requests: 4,
  });
  expect(report.provenance).toBe('synthetic-protocol');
  expect(JSON.stringify(report)).not.toContain('fixture-secret-never-export');
  expect(JSON.stringify(report)).not.toContain(config.baseUrl);
  expect(report.results[0].assessments![0].signals).not.toHaveLength(0);
});

it('refuses misleading provenance and records rejected generation without persisting network exceptions', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return response({ concepts: [] });
  };
  await expect(evaluateIdeas([entry()], config, { fetcher })).rejects.toThrow('synthetic-protocol');
  expect(calls).toBe(0);
  const invalid = await evaluateIdeas([entry()], config, {
    fetcher,
    provenance: 'synthetic-protocol',
  });
  expect(invalid.summary).toMatchObject({ failedCases: 1, requests: 2, generatedProposals: 0 });
  expect(invalid.results[0].failureKind).toBe('invalid-concepts');
  const broken = await evaluateIdeas([entry()], config, {
    provenance: 'synthetic-protocol',
    fetcher: async () => {
      throw new Error('https://fixture-secret@example.invalid/private');
    },
  });
  expect(broken.results[0].failureKind).toBe('provider-or-operation');
  expect(JSON.stringify(broken)).not.toContain('fixture-secret');
});

it('reports a broken model critique separately from passing deterministic contracts', async () => {
  const report = await evaluateIdeas([entry()], config, {
    provenance: 'synthetic-protocol',
    fetcher: sequence([{ concepts: [conceptFixture()] }, { unexpected: true }]),
  });
  expect(report.summary).toMatchObject({
    contractPasses: 1,
    incompleteCritiques: 1,
    pendingHumanReviews: 1,
  });
  expect(report.results[0].portfolio!.proposals[0].resourceReview.status).toBe('not-completed');
});

it('retains cancelled case accounting and stops before starting another request', async () => {
  const controller = new AbortController();
  const report = await evaluateIdeas([entry(), { ...entry(), id: 'second' }], config, {
    provenance: 'synthetic-protocol',
    signal: controller.signal,
    fetcher: async (_input, init) => {
      controller.abort();
      init!.signal!.throwIfAborted();
      return response({});
    },
  });
  expect(report.summary).toMatchObject({
    selectedCases: 2,
    attemptedCases: 1,
    cancelledCases: 1,
    requests: 1,
  });
  expect(report.results[0].outcome).toBe('cancelled');
});

it('validates cases and lists the public suite without provider calls or output files', async () => {
  const cases = ideaEvaluationCases();
  expect(cases).toHaveLength(4);
  expect(() => evaluationSuiteSchema.parse([entry(), entry()])).toThrow('unique');
  expect(() => evaluationCaseSchema.parse({ ...entry(), removeItemIds: ['unknown'] })).toThrow(
    'supplied',
  );
  expect(() =>
    evaluationCaseSchema.parse({ ...entry(), requiredActions: ['capture', 'capture'] }),
  ).toThrow('unique');
  const outputs: string[] = [];
  expect(await runEvaluation(['--list'], (text) => outputs.push(text))).toBe(0);
  expect(outputs[0]).toContain('missing-camera');
  await expect(runEvaluation(['--case', 'unknown', '--output', 'unused.json'])).rejects.toThrow(
    'Unknown evaluation case',
  );
});

it('reserves a private new report before inference and refuses an existing output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scrapmind-evaluation-cli-'));
  const prior = { ...process.env };
  try {
    for (const key of Object.keys(process.env))
      if (key.startsWith('SCRAPMIND_AI_')) delete process.env[key];
    process.env.SCRAPMIND_AI_BASE_URL = 'http://127.0.0.1:1/v1';
    process.env.SCRAPMIND_AI_MODEL = 'unreachable-fixture';
    const path = join(root, 'report.json');
    await writeFile(path, 'keep existing');
    await expect(
      runEvaluation(['--case', 'lamp-panel', '--output', path], () => {
        throw new Error('Inference must not start');
      }),
    ).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('keep existing');
    const cancelled = new AbortController();
    cancelled.abort();
    const fresh = join(root, 'cancelled.json');
    expect(
      await runEvaluation(['--case', 'all', '--output', fresh], () => undefined, cancelled.signal),
    ).toBe(130);
    expect(JSON.parse(await readFile(fresh, 'utf8')).summary).toMatchObject({
      selectedCases: 4,
      attemptedCases: 0,
      requests: 0,
    });
    expect((await stat(fresh)).mode & 0o777).toBe(0o600);
  } finally {
    for (const key of Object.keys(process.env))
      if (key.startsWith('SCRAPMIND_AI_')) delete process.env[key];
    for (const [key, value] of Object.entries(prior))
      if (key.startsWith('SCRAPMIND_AI_')) process.env[key] = value;
    await rm(root, { recursive: true, force: true });
  }
});
