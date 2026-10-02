import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  createWorkbench,
  workbenchCatalog,
  workbenchBuild,
  startWorkbenchBuild,
  setWorkbenchAvailability,
  updateWorkbenchInventory,
  importWorkbenchRecipe,
  reviewWorkbenchRecipe,
  completeWorkbenchStep,
  recordWorkbenchCheck,
  attachWorkbenchImage,
  saveWorkbenchIdeas,
} from '../core/workbench.js';
import { reportWorkbench, renderWorkbenchReport } from '../core/report.js';
import { ideate } from '../core/ideation.js';
import { discoverPlans } from '../core/planner.js';
import type { Plan, InventoryItem } from '../core/schema.js';
import { createImageArtifact, inspectImage } from '../core/evidence.js';
import { exportEvidenceBundle, importEvidenceBundle } from '../core/evidence-bundle.js';
import {
  createDiskWorkbench,
  loadDiskWorkbench,
  loadDiskImage,
  mutateDiskWorkbench,
  readBounded,
  readText,
  writeNewOutput,
} from './disk-workspace.js';
import { configuredProvider } from './provider-config.js';

const specifications: Record<string, { values: string[]; flags: string[] }> = {
  init: { values: ['inventory', 'name'], flags: [] },
  plan: { values: ['goal'], flags: ['json'] },
  inventory: { values: ['file'], flags: [] },
  availability: { values: ['item', 'available'], flags: [] },
  recipe: { values: ['file'], flags: ['replace'] },
  review: { values: ['recipe'], flags: ['acknowledge-review', 'acknowledge-resource-issues'] },
  start: { values: ['recipe', 'id'], flags: [] },
  show: { values: ['build'], flags: ['json'] },
  step: { values: ['build', 'step'], flags: ['undo'] },
  image: { values: ['build', 'device', 'file'], flags: [] },
  check: { values: ['build', 'check', 'outcome', 'note', 'artifact'], flags: [] },
  ideate: { values: ['goal', 'count'], flags: ['json'] },
  report: { values: ['output'], flags: ['json'] },
  bundle: { values: ['output'], flags: [] },
  import: { values: ['bundle'], flags: [] },
  audit: { values: ['bundle', 'output'], flags: ['json'] },
};
export const help = `SCRAPMIND saved workbench
Usage: npm run workbench -- COMMAND [--workspace .scrapmind] [options]
init --inventory path.json --name "My workbench"
plan [--goal "..."] [--json]
inventory --file path.json
availability --item ID --available true|false
recipe --file recipe.json [--replace]
ideate --goal "..." [--count 1|2|3] [--json]  (explicit configured model operation)
review --recipe ID --acknowledge-review [--acknowledge-resource-issues]
start --recipe ID [--id ID]
show --build ID [--json]
step --build ID --step ID [--undo]
image --build ID --device ID --file photo.png|jpg
check --build ID --check ID --outcome passed|failed|unknown --note "..." [--artifact ID ...]
report [--json] [--output new-file.md|json]
bundle --output new-file.json
import --bundle bundle.json --workspace NEW-DIRECTORY
audit --bundle bundle.json [--json] [--output new-file.md|json]
Workspace data and imported photos stay local. Model proposals remain drafts.
Outputs refuse existing files; imports refuse existing workspace directories.`;

function planText(plan: Plan, inventory: InventoryItem[], detailed = false): string {
  const lines = [
    `${plan.recipe.title} — ${plan.status.toUpperCase()}`,
    `Recipe: ${plan.recipe.id}`,
    `Inventory allocation: ${plan.coveredUnits}/${plan.totalUnits} units; evidence ${plan.evidence}. Physical fit remains unverified.`,
  ];
  for (const role of plan.recipe.requirements) {
    const assigned = plan.allocations
      .filter((entry) => entry.requirementId === role.id)
      .map(
        (entry) =>
          `${inventory.find((item) => item.id === entry.itemId)?.name ?? entry.itemId} [${entry.itemId}] × ${entry.quantity}`,
      );
    const missing = plan.missing.find((entry) => entry.requirement.id === role.id);
    lines.push(
      `  ${role.label}: ${assigned.join(' + ') || 'unallocated'}${missing ? `; missing ${missing.quantity}` : ''}`,
    );
  }
  if (plan.recipe.ai) {
    lines.push(
      '',
      `AI reasoning: ${plan.recipe.ai.reasoning}`,
      `Proposed new use: ${plan.recipe.ai.newUse}`,
      `Resource review: ${plan.recipe.ai.resourceReview.status}`,
    );
    for (const issue of plan.recipe.ai.resourceReview.issues)
      lines.push(`  ${issue.kind}: ${issue.detail}`);
    lines.push(plan.recipe.ai.resourceReview.boundary, 'Assumptions to inspect:');
    for (const assumption of plan.recipe.ai.assumptionsToTest) lines.push(`  ${assumption}`);
  }
  if (detailed) {
    lines.push('', 'Build procedure:');
    for (const step of plan.recipe.steps)
      lines.push(
        `  ${step.id}: ${step.title}`,
        `    ${step.instruction}`,
        `    Inspect: ${step.check}`,
      );
    lines.push('', 'Acceptance checks:');
    for (const check of plan.recipe.checks)
      lines.push(`  ${check.id}: ${check.label} (${check.evidenceKind})`, `    ${check.procedure}`);
    lines.push('', ...plan.recipe.boundaries);
  }
  return lines.join('\n');
}

function parseArgs(command: string, args: string[]) {
  const specification = specifications[command];
  if (!specification) throw new Error(`Unknown workbench command: ${command}. Use --help.`);
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (specification.flags.includes(name)) {
      if (flags.has(name)) throw new Error(`Duplicate --${name}.`);
      flags.add(name);
      continue;
    }
    if (name !== 'workspace' && !specification.values.includes(name))
      throw new Error(`Unknown option: ${token}`);
    const value = args[++index];
    if (value === undefined || value.startsWith('--'))
      throw new Error(`Provide a value after ${token}.`);
    if (values.has(name) && name !== 'artifact') throw new Error(`Duplicate ${token}.`);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  const optional = (name: string) => values.get(name)?.[0];
  const required = (name: string) => {
    const value = optional(name);
    if (!value?.trim()) throw new Error(`Provide --${name}.`);
    return value;
  };
  return { root: optional('workspace') ?? '.scrapmind', optional, required, flags, values };
}

/** Exported for CLI integration tests; importing this module never runs a command. */
export async function runWorkbench(
  args: string[],
  output: (value: string) => void = console.log,
): Promise<void> {
  const [command = '--help', ...options] = args;
  if (command === '--help' || command === 'help') {
    output(help);
    return;
  }
  const { root, optional, required, flags, values } = parseArgs(command, options);
  const print = (value: unknown) => output(JSON.stringify(value, null, 2));
  const printText = (value: string) => output(value.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ' '));
  const readJson = async (path: string) => JSON.parse(await readText(path));
  if (command === 'init') {
    const workspace = createWorkbench(required('name'), await readJson(required('inventory')));
    await createDiskWorkbench(root, workspace);
    print({
      workspace: resolve(root),
      name: workspace.name,
      inventoryItems: workspace.inventory.length,
    });
    return;
  }
  if (command === 'import' || command === 'audit') {
    const bundle = await importEvidenceBundle(await readText(required('bundle'), 35_000_000));
    if (command === 'import') {
      await createDiskWorkbench(root, bundle.workspace, bundle.images);
      print({ workspace: resolve(root), images: bundle.images.length });
      return;
    }
    const report = await reportWorkbench(bundle.workspace, async (artifact) =>
      bundle.images.find((image) => image.artifact.id === artifact.id),
    );
    const content = flags.has('json')
      ? JSON.stringify(report, null, 2)
      : renderWorkbenchReport(report);
    if (optional('output')) await writeNewOutput(required('output'), content);
    else output(content);
    return;
  }
  if (command === 'ideate') {
    const workspace = await loadDiskWorkbench(root);
    const count = z.coerce
      .number()
      .int()
      .min(1)
      .max(3)
      .parse(optional('count') ?? 3);
    if (workspace.recipes.length + count > 30)
      throw new Error('The workspace cannot fit these drafts. Use fewer ideas or a new workspace.');
    const goal = required('goal');
    const config = configuredProvider();
    if (!config)
      throw new Error(
        'Configure SCRAPMIND_AI_BASE_URL and SCRAPMIND_AI_MODEL. Nothing was sent to a provider.',
      );
    // Do not lock the workspace during network inference; saving checks the exact input revision.
    const result = await ideate(
      {
        inventory: workspace.inventory,
        goal,
        count,
        avoid: workbenchCatalog(workspace)
          .map((recipe) => recipe.title)
          .slice(-30),
      },
      config,
    );
    await mutateDiskWorkbench(root, (current) => ({
      workspace: saveWorkbenchIdeas(current, result),
    }));
    if (flags.has('json')) print(result);
    else
      printText(
        `Saved ${result.proposals.length} AI draft(s); ${result.calls} model calls.\n\n${result.proposals.map((proposal) => planText(proposal.plan, workspace.inventory, true)).join('\n\n')}\n\nInspect each draft before using the review command.`,
      );
    return;
  }
  if (['plan', 'show', 'report', 'bundle'].includes(command)) {
    const workspace = await loadDiskWorkbench(root);
    if (command === 'plan') {
      const plans = discoverPlans(
        workspace.inventory,
        optional('goal') ?? '',
        workbenchCatalog(workspace),
      );
      if (flags.has('json')) print(plans);
      else printText(plans.map((plan) => planText(plan, workspace.inventory)).join('\n\n'));
      return;
    }
    if (command === 'show') {
      const state = workbenchBuild(workspace, required('build'));
      if (flags.has('json'))
        print({
          ...state,
          boundary: 'This is a recorded owner trial, not independent physical validation.',
        });
      else
        printText(
          `${planText(state.plan, workspace.inventory, true)}\n\nBuild: ${state.session.id}\nSteps recorded: ${state.session.completedSteps.join(', ') || 'none'}\n${state.session.results.map((result) => `${result.checkId}: ${result.outcome} — ${result.note}`).join('\n')}\nThis is a recorded owner trial, not independent physical validation.`,
        );
      return;
    }
    if (command === 'report') {
      const report = await reportWorkbench(workspace, (artifact) => loadDiskImage(root, artifact));
      const content = flags.has('json')
        ? JSON.stringify(report, null, 2)
        : renderWorkbenchReport(report);
      if (optional('output')) await writeNewOutput(required('output'), content);
      else output(content.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ' '));
      return;
    }
    const artifacts = [
      ...workspace.builds.flatMap((build) => build.artifacts),
      ...workspace.deviceTrials.flatMap((trial) => (trial.artifact ? [trial.artifact] : [])),
    ];
    const json = await exportEvidenceBundle(workspace, async (id) => {
      const artifact = artifacts.find((entry) => entry.id === id);
      return artifact ? loadDiskImage(root, artifact) : undefined;
    });
    await writeNewOutput(required('output'), json);
    print({ output: resolve(required('output')), images: artifacts.length });
    return;
  }
  // Parse input files before taking a write lock.
  const input = ['inventory', 'recipe'].includes(command)
    ? await readJson(required('file'))
    : undefined;
  const bytes = command === 'image' ? await readBounded(required('file'), 20_000_000) : undefined;
  let attachedId: string | undefined;
  let newBuildId: string | undefined;
  const workspace = await mutateDiskWorkbench(root, async (current) => {
    if (command === 'inventory') return { workspace: updateWorkbenchInventory(current, input) };
    if (command === 'availability') {
      const available = required('available');
      if (!['true', 'false'].includes(available))
        throw new Error('--available must be true or false.');
      return {
        workspace: setWorkbenchAvailability(current, required('item'), available === 'true'),
      };
    }
    if (command === 'recipe')
      return { workspace: importWorkbenchRecipe(current, input, flags.has('replace')) };
    if (command === 'review')
      return {
        workspace: reviewWorkbenchRecipe(
          current,
          required('recipe'),
          flags.has('acknowledge-review'),
          flags.has('acknowledge-resource-issues'),
        ),
      };
    if (command === 'start') {
      newBuildId = optional('id') ?? crypto.randomUUID();
      return { workspace: startWorkbenchBuild(current, required('recipe'), newBuildId) };
    }
    if (command === 'step')
      return {
        workspace: completeWorkbenchStep(
          current,
          required('build'),
          required('step'),
          !flags.has('undo'),
        ),
      };
    if (command === 'check')
      return {
        workspace: recordWorkbenchCheck(current, required('build'), {
          checkId: required('check'),
          outcome: z.enum(['passed', 'failed', 'unknown']).parse(required('outcome')),
          note: required('note'),
          artifactIds: values.get('artifact') ?? [],
          recordedAt: new Date().toISOString(),
        }),
      };
    if (command === 'image' && bytes) {
      const buildId = required('build'),
        itemId = required('device');
      const { plan } = workbenchBuild(current, buildId);
      if (
        !plan.allocations.some(
          (entry) => entry.itemId === itemId && entry.matchedCapabilities.includes('camera'),
        )
      )
        throw new Error('Select a camera allocated to this build.');
      const { mimeType } = inspectImage(bytes);
      const blob = new Blob([bytes], { type: mimeType });
      const artifact = await createImageArtifact(
        blob,
        {
          id: crypto.randomUUID(),
          buildId,
          itemId,
          inventoryFingerprint: plan.inventoryFingerprint,
          recipeFingerprint: plan.recipeFingerprint,
        },
        'imported-image',
      );
      const image = { artifact, blob };
      attachedId = artifact.id;
      return { workspace: await attachWorkbenchImage(current, buildId, image), images: [image] };
    }
    throw new Error('Unknown mutation.');
  });
  print({
    name: workspace.name,
    ...(newBuildId ? { buildId: newBuildId } : {}),
    ...(attachedId ? { artifactId: attachedId } : {}),
    recipes: workspace.recipes.length,
    builds: workspace.builds.length,
    boundary: 'Recorded claims remain subject to physical inspection and trial.',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWorkbench(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Workbench command failed.';
    console.error(message.replace(/[\x00-\x1f\x7f-\x9f]/g, ' '));
    process.exitCode = 1;
  });
}
