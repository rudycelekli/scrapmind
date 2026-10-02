import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { demoInventory } from '../core/fixtures.js';
import { describeReplan, discoverPlans, planRecipe } from '../core/planner.js';
import { recipes } from '../core/recipes.js';
import { inventoryFingerprint, parseInventory, type Recipe } from '../core/schema.js';
import { buildIsStale, buildStatus, recordCheck, startBuild } from '../core/build.js';

describe('inventory-constrained planning', () => {
  it('labels an empty inventory as declared, with every role missing', () => {
    const plan = planRecipe(recipes[0], []);
    expect(plan.evidence).toBe('declared');
    expect(plan.coveredUnits).toBe(0);
    expect(plan.status).toBe('blocked');
  });
  it('plans each starter recipe without presenting demo declarations as tested capabilities', () => {
    const plans = discoverPlans(demoInventory());
    expect(plans).toHaveLength(recipes.length);
    expect(plans.every((plan) => plan.status === 'ready')).toBe(true);
    expect(plans.every((plan) => plan.evidence === 'declared')).toBe(true);
    expect(plans.every((plan) => plan.untestedCapabilities.length > 0)).toBe(true);
  });
  it('replaces a removed support and explains the substitution', () => {
    const inventory = demoInventory();
    const recipe = recipes[0];
    const before = planRecipe(recipe, inventory);
    expect(before.allocations.find((entry) => entry.requirementId === 'support')?.itemId).toBe(
      'arm',
    );
    const changed = inventory.map((item) =>
      item.id === 'arm' ? { ...item, available: false } : item,
    );
    const next = planRecipe(recipe, changed);
    expect(next.status).toBe('ready');
    expect(next.allocations.find((entry) => entry.requirementId === 'support')?.itemId).toBe(
      'boxes',
    );
    expect(describeReplan(before, next, changed).join(' ')).toContain('Rigid cardboard box');
  });
  it('blocks the build when no support is available', () => {
    const inventory = demoInventory().map((item) =>
      item.capabilities.includes('vertical-support') ? { ...item, available: false } : item,
    );
    const plan = planRecipe(recipes[0], inventory);
    expect(plan.status).toBe('blocked');
    expect(plan.missing.some((missing) => missing.requirement.id === 'support')).toBe(true);
    expect(() => startBuild(plan, 'build')).toThrow('missing inventory');
  });
  it('never double-books a versatile part', () => {
    const single = parseInventory([
      {
        id: 'one',
        name: 'One part',
        kind: 'material',
        quantity: 1,
        available: true,
        capabilities: ['flat-panel', 'vertical-support'],
        dimensions: { length: 300, width: 200 },
      },
    ]);
    const plan = planRecipe(recipes[0], single);
    expect(plan.allocations.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(1);
  });
  it('backtracks when a flexible item is needed for a constrained role', () => {
    const recipe: Recipe = {
      ...recipes[0],
      requirements: [
        {
          id: 'a',
          label: 'Generic support',
          quantity: 1,
          explanation: 'A support.',
          alternatives: [{ capabilities: ['vertical-support'] }],
        },
        {
          id: 'b',
          label: 'Clamp support',
          quantity: 1,
          explanation: 'A clamp support.',
          alternatives: [{ capabilities: ['clamp', 'vertical-support'] }],
        },
      ],
      steps: [
        {
          id: 'inspect',
          title: 'Inspect',
          instruction: 'Check the parts.',
          requirements: ['a', 'b'],
          check: 'Both parts fit.',
        },
      ],
    };
    const inventory = parseInventory([
      {
        id: 'a-versatile',
        name: 'Versatile',
        kind: 'material',
        quantity: 1,
        available: true,
        capabilities: ['vertical-support', 'clamp'],
      },
      {
        id: 'b-basic',
        name: 'Basic',
        kind: 'material',
        quantity: 1,
        available: true,
        capabilities: ['vertical-support'],
      },
    ]);
    const plan = planRecipe(recipe, inventory);
    expect(plan.status).toBe('ready');
    expect(plan.allocations.find((entry) => entry.requirementId === 'b')?.itemId).toBe(
      'a-versatile',
    );
  });
  it('does not infer missing measurements', () => {
    const inventory = demoInventory().map((item) => ({ ...item, dimensions: undefined }));
    expect(
      planRecipe(recipes[0], inventory).missing.some((entry) => entry.requirement.id === 'base'),
    ).toBe(true);
  });
  it('ranks relevant blocked goals above unrelated ready recipes', () => {
    const inventory = demoInventory().filter((item) => !item.capabilities.includes('camera'));
    expect(discoverPlans(inventory, 'document scanner')[0].recipe.id).toBe('document-scanner');
    expect(discoverPlans(inventory, 'document scanner')[0].status).toBe('blocked');
  });
  it('is independent of inventory input order', () => {
    const inventory = demoInventory();
    expect(planRecipe(recipes[0], inventory).allocations).toEqual(
      planRecipe(recipes[0], inventory.reverse()).allocations,
    );
  });
  it('preserves allocation limits under varied inventory quantities and availability', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ quantity: fc.integer({ min: 1, max: 4 }), available: fc.boolean() }), {
          minLength: 12,
          maxLength: 12,
        }),
        (state) => {
          const inventory = demoInventory().map((item, i) => ({ ...item, ...state[i] }));
          for (const recipe of recipes) {
            const plan = planRecipe(recipe, inventory);
            for (const item of inventory) {
              const allocated = plan.allocations
                .filter((entry) => entry.itemId === item.id)
                .reduce((sum, entry) => sum + entry.quantity, 0);
              expect(allocated).toBeLessThanOrEqual(item.available ? item.quantity : 0);
            }
            expect(
              plan.coveredUnits + plan.missing.reduce((sum, entry) => sum + entry.quantity, 0),
            ).toBe(plan.totalUnits);
          }
        },
      ),
      { numRuns: 100, seed: 20261002 },
    );
  });
  it('rejects ambiguous identifiers and unsupported verified capabilities', () => {
    const inventory = demoInventory();
    expect(() => parseInventory([inventory[0], inventory[0]])).toThrow('unique');
    expect(() => parseInventory([{ ...inventory[0], testedCapabilities: ['rotation'] }])).toThrow(
      'subset',
    );
  });
  it('only reports tested evidence for the capabilities actually used', () => {
    const inventory = demoInventory().map((item) => ({
      ...item,
      evidence: 'tested' as 'declared' | 'observed' | 'tested',
      testedCapabilities: item.capabilities,
    }));
    expect(planRecipe(recipes[0], inventory).evidence).toBe('tested');
    inventory.find((item) => item.id === 'webcam')!.testedCapabilities = [];
    inventory.find((item) => item.id === 'webcam')!.evidence = 'observed';
    const plan = planRecipe(recipes[0], inventory);
    expect(plan.evidence).not.toBe('tested');
    expect(plan.untestedCapabilities).toContainEqual({ itemId: 'webcam', capability: 'camera' });
  });
});

describe('build verification', () => {
  it('does not allow an unreviewed generated recipe to start a build', () => {
    const draft = planRecipe(
      { ...recipes[0], source: 'generated', reviewed: false },
      demoInventory(),
    );
    expect(draft.status).toBe('draft');
    expect(() => startBuild(draft, 'build')).toThrow('Review');
    const reviewed = planRecipe({ ...draft.recipe, reviewed: true }, demoInventory());
    expect(reviewed.status).toBe('ready');
    expect(startBuild(reviewed, 'build').recipeId).toBe(recipes[0].id);
  });
  it('invalidates results when a recipe changes without changing its ID', () => {
    const inventory = demoInventory();
    const original = planRecipe(recipes[0], inventory);
    const session = startBuild(original, 'build');
    const revised = planRecipe(
      {
        ...recipes[0],
        checks: [
          ...recipes[0].checks,
          {
            id: 'new-check',
            label: 'New check',
            procedure: 'Inspect another feature.',
            evidenceKind: 'observation',
          },
        ],
      },
      inventory,
    );
    expect(buildStatus(session, revised)).toBe('stale');
    expect(() =>
      recordCheck(session, revised, {
        checkId: 'frame',
        outcome: 'passed',
        note: 'Old observation',
        recordedAt: new Date().toISOString(),
      }),
    ).toThrow('plan changed');
  });
  it('invalidates an old build when inventory changes', () => {
    const inventory = demoInventory();
    const plan = planRecipe(recipes[0], inventory);
    const session = startBuild(plan, 'build');
    expect(buildIsStale(session, inventory)).toBe(false);
    const changed = inventory.map((item) =>
      item.id === 'arm' ? { ...item, available: false } : item,
    );
    expect(buildIsStale(session, changed)).toBe(true);
    expect(buildStatus(session, planRecipe(recipes[0], changed))).toBe('stale');
  });
  it('requires all steps and checks, and preserves failures', () => {
    const plan = planRecipe(recipes[0], demoInventory());
    let session = startBuild(plan, 'build');
    session.completedSteps = plan.recipe.steps.map((step) => step.id);
    expect(buildStatus(session, plan)).toBe('in-progress');
    for (const check of plan.recipe.checks)
      session = recordCheck(session, plan, {
        checkId: check.id,
        outcome: 'passed',
        note: 'Observed in a user trial.',
        recordedAt: new Date().toISOString(),
      });
    expect(buildStatus(session, plan)).toBe('reported-pass');
    session = recordCheck(session, plan, {
      checkId: plan.recipe.checks[0].id,
      outcome: 'failed',
      note: 'One corner is missing.',
      recordedAt: new Date().toISOString(),
    });
    expect(buildStatus(session, plan)).toBe('needs-work');
  });
  it('rejects empty notes, invented checks, and checks recorded against stale plans', () => {
    const plan = planRecipe(recipes[0], demoInventory());
    const session = startBuild(plan, 'build');
    const result = {
      checkId: 'invented',
      outcome: 'passed' as const,
      note: 'Test note',
      recordedAt: new Date().toISOString(),
    };
    expect(() => recordCheck(session, plan, result)).toThrow('Unknown');
    expect(() => recordCheck(session, plan, { ...result, checkId: 'frame', note: '' })).toThrow();
    expect(() =>
      recordCheck(session, { ...plan, inventoryFingerprint: 'changed' }, result),
    ).toThrow('plan changed');
  });
  it('fingerprints are stable for reordered inventories and capture quantities', () => {
    const inventory = demoInventory();
    expect(inventoryFingerprint(inventory)).toBe(inventoryFingerprint([...inventory].reverse()));
    expect(inventoryFingerprint(inventory)).not.toBe(
      inventoryFingerprint(inventory.map((item) => ({ ...item, quantity: item.quantity + 1 }))),
    );
  });
});
