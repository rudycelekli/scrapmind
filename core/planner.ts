import {
  inventoryFingerprint,
  parseInventory,
  type Allocation,
  type InventoryItem,
  type MatchRule,
  type Plan,
  type Recipe,
  type Requirement,
} from './schema.js';
import { recipes } from './recipes.js';
import { recipeSchema } from './recipe-schema.js';

function matchingRule(item: InventoryItem, requirement: Requirement): MatchRule | undefined {
  if (!item.available) return;
  return requirement.alternatives.find((rule) => {
    if (rule.kinds && !rule.kinds.includes(item.kind)) return false;
    if (!rule.capabilities.every((cap) => item.capabilities.includes(cap))) return false;
    return Object.entries(rule.minDimensions ?? {}).every(([key, minimum]) => {
      const dimension = item.dimensions?.[key as keyof NonNullable<InventoryItem['dimensions']>];
      return dimension !== undefined && dimension >= minimum;
    });
  });
}

export function planRecipe(rawRecipe: Recipe, rawInventory: unknown, goal = ''): Plan {
  const recipe = recipeSchema.parse(rawRecipe);
  const inventory = parseInventory(rawInventory);
  const items = [...inventory].sort((a, b) => a.id.localeCompare(b.id));
  const units = recipe.requirements.flatMap((req) =>
    Array.from({ length: req.quantity }, () => req),
  );
  const candidates = new Map(
    recipe.requirements.map((req) => [
      req.id,
      items
        .filter((item) => matchingRule(item, req))
        .sort((a, b) => a.capabilities.length - b.capabilities.length || a.id.localeCompare(b.id)),
    ]),
  );
  // Most constrained roles first prevents a versatile item stealing the only
  // feasible assignment for a more specific role. Memoized search still explores
  // alternatives: the heuristic is not a substitute for constraint solving.
  units.sort(
    (a, b) =>
      candidates.get(a.id)!.length - candidates.get(b.id)!.length || a.id.localeCompare(b.id),
  );
  const remaining = items.map((item) => item.quantity);
  const itemIndexes = new Map(items.map((item, index) => [item.id, index]));
  const memo = new Map<string, Allocation[]>();
  let visits = 0;
  const search = (index: number): Allocation[] => {
    if (index === units.length) return [];
    const key = `${index}:${remaining.join(',')}`;
    const cached = memo.get(key);
    if (cached) return cached;
    // Public recipes are bounded. Fail explicitly rather than return a partial
    // search as though it had proved an optimum for arbitrary imported recipes.
    if (++visits > 100000)
      throw new Error('Planning search limit exceeded. Reduce the inventory or recipe complexity.');
    const req = units[index];
    let best: Allocation[] = [];
    for (const item of candidates.get(req.id)!) {
      const i = itemIndexes.get(item.id)!;
      if (remaining[i] === 0) continue;
      remaining[i]--;
      const rule = matchingRule(item, req)!;
      const next: Allocation[] = [
        {
          requirementId: req.id,
          itemId: item.id,
          quantity: 1,
          matchedCapabilities: rule.capabilities,
        },
        ...search(index + 1),
      ];
      remaining[i]++;
      if (next.length > best.length) best = next;
      if (best.length === units.length - index) break;
    }
    // Leaving a role unsatisfied may produce a better partial plan for the rest.
    if (best.length < units.length - index) {
      const skip = search(index + 1);
      if (skip.length > best.length) best = skip;
    }
    memo.set(key, best);
    return best;
  };
  const rawAllocations = search(0);
  const allocations: Allocation[] = [];
  rawAllocations.forEach((allocation) => {
    const existing = allocations.find(
      (entry) =>
        entry.itemId === allocation.itemId && entry.requirementId === allocation.requirementId,
    );
    if (existing) existing.quantity += allocation.quantity;
    else allocations.push({ ...allocation });
  });
  const missing = recipe.requirements.flatMap((requirement) => {
    const allocated = allocations
      .filter((entry) => entry.requirementId === requirement.id)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    return allocated < requirement.quantity
      ? [{ requirement, quantity: requirement.quantity - allocated }]
      : [];
  });
  const untestedCapabilities = allocations.flatMap((entry) => {
    const item = items[itemIndexes.get(entry.itemId)!];
    return entry.matchedCapabilities
      .filter((capability) => !item.testedCapabilities.includes(capability))
      .map((capability) => ({ itemId: item.id, capability }));
  });
  const evidence =
    allocations.length > 0 && untestedCapabilities.length === 0
      ? 'tested'
      : allocations.length === 0 ||
          allocations.some((entry) => items[itemIndexes.get(entry.itemId)!].evidence === 'declared')
        ? 'declared'
        : 'observed';
  return {
    recipe,
    allocations,
    missing,
    status: missing.length
      ? 'blocked'
      : recipe.source === 'generated' && !recipe.reviewed
        ? 'draft'
        : 'ready',
    coveredUnits: rawAllocations.length,
    totalUnits: units.length,
    relevance: goalRelevance(recipe, goal),
    evidence,
    untestedCapabilities,
    inventoryFingerprint: inventoryFingerprint(inventory),
    recipeFingerprint: JSON.stringify(recipe),
  };
}

export function goalRelevance(recipe: Recipe, goal: string): number {
  const tokens = goal.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!tokens.length) return 0;
  const terms = new Set(
    `${recipe.title} ${recipe.goalTerms.join(' ')}`.toLowerCase().match(/[a-z0-9]+/g),
  );
  return tokens.filter((token) => terms.has(token)).length;
}

export function discoverPlans(inventory: unknown, goal = '', catalog: Recipe[] = recipes): Plan[] {
  return catalog
    .map((recipe) => planRecipe(recipe, inventory, goal))
    .sort((a, b) => {
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;
      if (a.status !== b.status)
        return (
          { ready: 0, draft: 1, blocked: 2 }[a.status] -
          { ready: 0, draft: 1, blocked: 2 }[b.status]
        );
      return (
        b.coveredUnits / b.totalUnits - a.coveredUnits / a.totalUnits ||
        a.recipe.minutes - b.recipe.minutes ||
        a.recipe.id.localeCompare(b.recipe.id)
      );
    });
}

export function describeReplan(previous: Plan, next: Plan, inventory: InventoryItem[]): string[] {
  const changes: string[] = [];
  for (const req of next.recipe.requirements) {
    const before = previous.allocations
      .filter((a) => a.requirementId === req.id)
      .map((a) => a.itemId)
      .sort()
      .join(',');
    const after = next.allocations
      .filter((a) => a.requirementId === req.id)
      .map((a) => a.itemId)
      .sort()
      .join(',');
    if (before !== after) {
      const replacements = next.allocations
        .filter((a) => a.requirementId === req.id)
        .map((a) => inventory.find((item) => item.id === a.itemId)?.name ?? a.itemId);
      changes.push(
        replacements.length
          ? `${req.label}: now uses ${replacements.join(' + ')}.`
          : `${req.label}: no available substitute. Build is blocked.`,
      );
    }
  }
  return changes;
}
