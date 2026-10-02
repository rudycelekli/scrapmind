import { expect, it } from 'vitest';
import { demoInventory } from '../core/fixtures.js';
import { importWorkspace, exportWorkspace } from '../core/workspace.js';
import { recipes } from '../core/recipes.js';
it('round-trips inventory and custom recipes without losing their evidence', () => {
  const workspace = {
    format: 'scrapmind-workspace' as const,
    version: 1 as const,
    name: 'My workbench',
    inventory: demoInventory(),
    recipes: [recipes[0]],
    builds: [],
    deviceTrials: [],
    exportedAt: '2026-10-02T19:00:00.000Z',
  };
  expect(importWorkspace(exportWorkspace(workspace))).toEqual(workspace);
});
it('rejects future formats, invalid inventories, and oversized files', () => {
  expect(() => importWorkspace('{"format":"something else"}')).toThrow();
  expect(() => importWorkspace(' '.repeat(5_000_001))).toThrow('5 MB');
  expect(() => importWorkspace('é'.repeat(3_000_000))).toThrow('5 MB');
  expect(() =>
    importWorkspace(
      JSON.stringify({
        format: 'scrapmind-workspace',
        version: 1,
        name: 'Invalid',
        inventory: [{ id: 'a' }],
        recipes: [],
        builds: [],
        exportedAt: '2026-10-02T19:00:00.000Z',
      }),
    ),
  ).toThrow();
});
