import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { open } from 'node:fs/promises';
import { evaluateIdeas, evaluationSuiteSchema } from '../core/evaluation.js';
import { ideaEvaluationCases } from '../core/evaluation-cases.js';
import { configuredProvider } from './provider-config.js';
import { readText } from './disk-workspace.js';

export const evaluationHelp = `SCRAPMIND live AI evaluation
Usage: npm run evaluate -- --list
       npm run evaluate -- --case lamp-panel --output new-report.json [--suite cases.json]
       npm run evaluate -- --case all --output new-report.json [--suite cases.json]
Each selected case explicitly contacts the configured generation and critic model.
At most 5 requests and 240 seconds per case. Runs are sequential. No physical trial.
Outputs preserve declared inventory and model drafts; use a private location for private cases.
Exit 0: all requested portfolios pass limited software contracts; human review is pending.
Exit 2: rejected generation or failed contract. Exit 130: interrupted, partial report saved.`;

export async function runEvaluation(
  args: string[],
  output: (text: string) => void = console.log,
  signal?: AbortSignal,
) {
  if (!args.length || args.includes('--help')) {
    output(evaluationHelp);
    return 0;
  }
  const values = new Map<string, string>();
  let list = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--list') {
      if (list) throw new Error('Duplicate --list.');
      list = true;
    } else {
      if (!['--case', '--output', '--suite'].includes(name) || values.has(name))
        throw new Error(`Unknown or duplicate option: ${name}`);
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Provide a value after ${name}.`);
      values.set(name, value);
    }
  }
  const cases = values.has('--suite')
    ? evaluationSuiteSchema.parse(JSON.parse(await readText(values.get('--suite')!)))
    : ideaEvaluationCases();
  if (list) {
    if (values.has('--case') || values.has('--output'))
      throw new Error('--list cannot run or save an evaluation.');
    output(
      cases
        .map((entry) => `${entry.id}: ${entry.label}`)
        .join('\n')
        .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ' '),
    );
    return 0;
  }
  const selected = values.get('--case'),
    path = values.get('--output');
  if (!selected || !path) throw new Error('Select --case ID|all and a new --output path.');
  const entries = selected === 'all' ? cases : cases.filter((entry) => entry.id === selected);
  if (!entries.length) throw new Error(`Unknown evaluation case: ${selected}`);
  const config = configuredProvider();
  if (!config)
    throw new Error(
      'Configure SCRAPMIND_AI_BASE_URL and SCRAPMIND_AI_MODEL. Nothing was sent to a provider.',
    );
  // Reserve a private new output before inference, so an existing/unwritable path
  // cannot waste paid model requests. A hard process kill may leave this file empty.
  const handle = await open(resolve(path), 'wx', 0o600);
  let report;
  try {
    report = await evaluateIdeas(entries, config, {
      signal,
      onCase: (entry, state) => output(`${state}: ${entry.id}`),
    });
    await handle.writeFile(JSON.stringify(report, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  const summary = report.summary;
  output(
    `${summary.generatedCases}/${summary.selectedCases} portfolios generated; ${summary.contractPasses}/${summary.generatedProposals} proposals pass limited contracts; ${summary.requests} request(s).`,
  );
  output(
    `${summary.criticIssues} critic issue(s); ${summary.incompleteCritiques} incomplete critique(s).`,
  );
  output(`Report: ${resolve(path)}. Human review and physical validation remain pending.`);
  return signal?.aborted
    ? 130
    : summary.failedCases ||
        summary.contractFailures ||
        summary.attemptedCases !== summary.selectedCases
      ? 2
      : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  runEvaluation(process.argv.slice(2), console.log, controller.signal)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(
        (error instanceof Error ? error.message : 'Evaluation could not run or save.').replace(
          /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,
          ' ',
        ),
      );
      process.exitCode = 1;
    })
    .finally(() => process.removeListener('SIGINT', cancel));
}
