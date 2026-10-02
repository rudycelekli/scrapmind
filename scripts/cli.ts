import { readFile } from 'node:fs/promises';
import { demoInventory } from '../core/fixtures.js';
import { describeReplan, discoverPlans, planRecipe } from '../core/planner.js';
import { recipes } from '../core/recipes.js';
import { parseInventory, type Plan } from '../core/schema.js';
import { recipeSchema } from '../core/recipe-schema.js';
import { invent } from '../core/inventor.js';

function printPlan(plan: Plan) {
  console.log(
    `\n${plan.recipe.title} · ${plan.status.toUpperCase()} · ${plan.coveredUnits}/${plan.totalUnits} required units`,
  );
  console.log(
    `Evidence: ${plan.evidence}. Physical success is not implied by a matching inventory.`,
  );
  for (const missing of plan.missing)
    console.log(`Missing: ${missing.requirement.label} × ${missing.quantity}`);
  for (const step of plan.recipe.steps) console.log(`${step.title}: ${step.instruction}`);
}

async function main() {
  const [command = 'demo', ...args] = process.argv.slice(2);
  if (command === 'demo') {
    const inventory = demoInventory();
    const recipe = recipes.find((entry) => entry.id === 'document-scanner')!;
    const before = planRecipe(recipe, inventory);
    printPlan(before);
    const changed = inventory.map((item) =>
      item.id === 'arm' ? { ...item, available: false } : item,
    );
    const after = planRecipe(recipe, changed);
    console.log('\nCHALLENGE: remove the desk arm.');
    for (const change of describeReplan(before, after, changed)) console.log(change);
    console.log(
      `Replanned: ${after.status}. These are declared demo capabilities, not tested hardware.`,
    );
    return;
  }
  if (!['plan', 'invent'].includes(command))
    throw new Error(
      'Usage: npm run demo | npm run plan -- --inventory path.json [--goal "scan a document"] [--recipe recipe.json] [--json] | npm run invent -- --inventory path.json --goal "..."',
    );
  const pathIndex = args.indexOf('--inventory');
  const goalIndex = args.indexOf('--goal');
  if (pathIndex < 0 || !args[pathIndex + 1] || args[pathIndex + 1].startsWith('--'))
    throw new Error('Provide --inventory path.json.');
  if (goalIndex >= 0 && (!args[goalIndex + 1] || args[goalIndex + 1].startsWith('--')))
    throw new Error('Provide a value after --goal.');
  const inventory = parseInventory(JSON.parse(await readFile(args[pathIndex + 1], 'utf8')));
  const goal = goalIndex < 0 ? '' : args[goalIndex + 1];
  if (command === 'invent') {
    const baseUrl = process.env.SCRAPMIND_AI_BASE_URL,
      model = process.env.SCRAPMIND_AI_MODEL;
    if (!baseUrl || !model)
      throw new Error(
        'Configure SCRAPMIND_AI_BASE_URL and SCRAPMIND_AI_MODEL. Nothing has been sent to a provider.',
      );
    if (!goal) throw new Error('Provide --goal for a new invention proposal.');
    const proposal = await invent(
      { inventory, goal },
      {
        baseUrl,
        model,
        apiKey: process.env.SCRAPMIND_AI_KEY,
        format: process.env.SCRAPMIND_AI_FORMAT === 'json_object' ? 'json_object' : 'json_schema',
      },
    );
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }
  const recipeIndex = args.indexOf('--recipe');
  if (recipeIndex >= 0 && (!args[recipeIndex + 1] || args[recipeIndex + 1].startsWith('--')))
    throw new Error('Provide a path after --recipe.');
  const imported =
    recipeIndex < 0
      ? undefined
      : recipeSchema.parse(JSON.parse(await readFile(args[recipeIndex + 1], 'utf8')));
  const catalog = imported
    ? [
        {
          ...imported,
          source: imported.source === 'generated' ? ('generated' as const) : ('imported' as const),
        },
      ]
    : recipes;
  const plans = discoverPlans(inventory, goal, catalog);
  if (args.includes('--json')) console.log(JSON.stringify(plans, null, 2));
  else plans.forEach(printPlan);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Planning failed.');
  process.exitCode = 1;
});
