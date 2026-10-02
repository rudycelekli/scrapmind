import { expect, it } from 'vitest';
import { invent, providerMode } from '../core/inventor.js';
import { demoInventory } from '../core/fixtures.js';
import { recipeSchema } from '../core/recipe-schema.js';
import { recipes } from '../core/recipes.js';
it('validates starter recipes against the extension contract', () => {
  for (const recipe of recipes) expect(recipeSchema.parse(recipe).id).toBe(recipe.id);
});
it('rejects invented capabilities and references', () => {
  expect(() =>
    recipeSchema.parse({
      ...recipes[0],
      requirements: [
        { ...recipes[0].requirements[0], alternatives: [{ capabilities: ['telepathy'] }] },
      ],
    }),
  ).toThrow();
  expect(() =>
    recipeSchema.parse({
      ...recipes[0],
      steps: [{ ...recipes[0].steps[0], requirements: ['imaginary'] }],
    }),
  ).toThrow('reference');
});
it('checks model proposals against inventory and leaves physical review pending', async () => {
  const inventory = demoInventory().filter((item) => !item.capabilities.includes('camera'));
  const fetcher: typeof fetch = async (_url, init) => {
    expect(JSON.parse(init!.body as string).messages[0].content).toContain('untrusted task data');
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ recipe: recipes[0] }) } }],
      }),
      { status: 200 },
    );
  };
  const result = await invent(
    { inventory, goal: 'Make a document scanner' },
    { baseUrl: 'http://localhost:11434/v1', model: 'test-model' },
    fetcher,
  );
  expect(result.plan.status).toBe('blocked');
  expect(result.recipe.source).toBe('generated');
  expect(result.reviewed).toBe(false);
});
it('distinguishes local and remote providers', () => {
  expect(providerMode({ baseUrl: 'http://127.0.0.1:11434/v1', model: 'test' })).toBe('local');
  expect(providerMode({ baseUrl: 'https://example.com/v1', model: 'test' })).toBe('remote');
});
it('rejects invalid image input and bounds provider errors', async () => {
  await expect(
    invent(
      { inventory: [], goal: 'a test', image: 'file:///secret' },
      { baseUrl: 'http://localhost/v1', model: 'test' },
    ),
  ).rejects.toThrow();
  await expect(
    invent(
      { inventory: [], goal: 'a test' },
      { baseUrl: 'http://localhost/v1', model: 'test' },
      async () => new Response('secret error contents', { status: 401 }),
    ),
  ).rejects.toThrow('HTTP 401');
});

it('repairs a malformed proposal once without relaxing the contract', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    expect(body.response_format.type).toBe('json_schema');
    if (calls === 2) expect(body.messages.at(-1).content).toContain('failed validation');
    const recipe =
      calls === 1
        ? { ...recipes[0], steps: [{ ...recipes[0].steps[0], requirements: ['wrong-role'] }] }
        : recipes[0];
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recipe }) } }] }),
    );
  };
  const result = await invent(
    { inventory: demoInventory(), goal: 'scan a document' },
    { baseUrl: 'http://localhost:11434/v1', model: 'test' },
    fetcher,
  );
  expect(result.attempts).toBe(2);
  expect(result.reviewed).toBe(false);
  expect(result.plan.status).toBe('draft');
});

it('stops after two invalid proposals', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"recipe":{}}' } }] }));
  };
  await expect(
    invent(
      { inventory: [], goal: 'a simple useful thing' },
      { baseUrl: 'http://localhost:11434/v1', model: 'test' },
      fetcher,
    ),
  ).rejects.toThrow('after two attempts');
  expect(calls).toBe(2);
});
