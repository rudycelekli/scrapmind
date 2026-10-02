# Evaluate the AI engine

`npm run evaluate` runs declared inventory challenges against your explicitly configured generation and critic models. It retains full case inputs, returned drafts, model critique, software contract checks, measured elapsed time, attempted request counts, and removal-challenge plans. Failed generation stays in the denominator instead of disappearing from a showcase.

This is a bounded engineering evaluation, not proof of useful invention, general intelligence, physical feasibility, or novelty. Every returned draft keeps `humanReview: pending` and `physicalValidation: not-performed`. A software contract can pass while prose omits a part, the model critic is incomplete, or the proposed physical behavior is wrong.

## Run a selected challenge

Node.js 22.12 or newer, after `npm ci`:

```sh
npm run evaluate -- --list
cp .env.example .env
# Configure the generation endpoint/model and, optionally, a separate critic.
mkdir -p .scrapmind/evaluations
npm run evaluate -- --case lamp-panel --output .scrapmind/evaluations/lamp-panel.json
npm run evaluate -- --case all --output .scrapmind/evaluations/suite.json
```

The first command only lists cases. Inference requires both an explicit `--case` selection and a new `--output` path. No provider is contacted by help, listing, unit tests, initialization, or normal planning. A selected run sends its declared inventories and goals to the configured endpoint; cloud providers may bill for these requests. No images or physical device operations are part of this suite.

Default challenges:

| Case                 | Question checked by the software contract                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `lamp-panel`         | Are illumination and manual comparison declared, with every required unit covered by the two supplied parts?                              |
| `camera-light-panel` | Are webcam, compute host, lamp, and panel capabilities allocated, with capture, illumination, comparison, and image evidence represented? |
| `missing-camera`     | Does a capture proposal declare an explicitly unallocated camera role instead of hiding the missing resource?                             |
| `single-phone`       | Can sequential capture and display use one physical phone role without allocating the same unit twice?                                    |

Each case makes at most five attempted requests and runs for at most 240 seconds under the engine's model-operation budget, with 90 seconds per model request. Cases execute sequentially. The default four-case suite can therefore take about sixteen minutes. Request counts include attempted dispatches that may fail or be cancelled; they are not billing measurements. Runtime timings depend on provider, load, hardware, and model configuration.

Exit codes: `0` means all selected portfolios were generated and all returned proposals passed the limited software contracts; it never means independent physical success. `2` records a generation or contract failure. `130` records Ctrl+C cancellation, saves completed results and the interrupted case, and leaves later cases unattempted. Setup or output errors return `1`. The output file is exclusively reserved with private permissions before inference; existing files are refused. A hard process kill or storage failure can leave an empty or incomplete file. Choose a fresh path for a new run.

## Read the result without inflating it

- `generatedCases / selectedCases` measures returned schema-valid portfolios. Failed or cancelled cases are separately counted. A missing portfolio is not a passing contract.
- `contractPasses / generatedProposals` checks explicit required actions, allocated capabilities, inventory coverage, expected missing roles, and conservative English instruction-resource signals. It uses freshly compiled concepts and plans rather than trusting an exported coverage claim.
- `criticIssues` and `incompleteCritiques` retain the model review's limitations separately. A clean model critic never establishes correctness. A deterministic contract pass does not erase an incomplete critique.
- `removalChallenge` reruns allocation after the listed items become unavailable. It records changed roles and missing parts; it does not manufacture substitutes, generate a fresh invention, or simulate assembly.
- `humanReview` and `physicalValidation` remain pending/not performed regardless of software outcomes. Global novelty is never scored.

The artifact records model names, routing mode, output format, token limit, case inputs, and operation timestamps. It omits the provider URL and API key. Successful drafts may reproduce private inventory names or notes, so store private evaluations in the ignored `.scrapmind` directory. Arbitrary network exception text is not saved because it can contain credentials or URLs; failures receive bounded category labels. There is no automatic publication or upload of the resulting report.

`live-model` means the runner used the configured endpoint rather than an injected test response. It is not an attestation that the endpoint really ran the named model; verify the server and model revision separately. Injected protocol responses must be labeled `synthetic-protocol` and cannot be presented as live benchmarks. Sampling and provider changes mean identical inputs may yield different outputs.

## Independent review rubric

Before calling a draft useful, a person must read the retained concept, procedure, allocations, assumptions, checks, and any model issues. Record evidence for each of these questions:

1. Does the procedure actually satisfy the goal, beyond containing the required action labels?
2. Does every named physical part, host, connection, fastening operation, measuring tool, and test object have an allocated role or an explicit missing role? Does the instruction use the intended allocated item?
3. Are functions supported by the actual item, with no camera-as-projector, hidden drive mechanism, invented rating, or assumed compatibility?
4. Are instructions understandable, complete enough to follow, and internally consistent? Do comparison and capture procedures assess the claimed purpose?
5. Which geometry, stability, framing, focus, lighting, connectivity, and repeatability assumptions require direct inspection or a recorded trial?

Text review can identify contradictions. It cannot establish mounting fit, optical performance, measured accuracy, successful assembly, or novelty. Those require a separate physical evaluation and the appropriate [build evidence](WORKBENCH.md).

## Bring your own cases

```sh
npm run evaluate -- --suite my-cases.json --list
npm run evaluate -- --suite my-cases.json --case my-case --output .scrapmind/evaluations/my-case.json
```

A suite is a JSON array of 1–20 unique cases, read within the 5 MB file bound. Each case has `id`, `label`, `goal`, validated `inventory`, `requiredActions`, and `resourcePolicy` (`declared-only` or `missing-allowed`). Optional fields are `count` (1–3, default 1), `requiredAllocatedCapabilities`, `requiredMissingCapabilities`, and `removeItemIds`. A declared-only case cannot require missing resources. Removal IDs must exist in that case's inventory. Case IDs use lowercase letters, digits, and hyphens, beginning with a letter.

The built-in cases are in [`core/evaluation-cases.ts`](../core/evaluation-cases.ts). Retained case snapshots can be extracted from a report's `results[].case` array and reused as a suite. Hold case snapshots and model revisions fixed before making any comparison claim. Use multiple independent runs, varied inventories, and actual human/physical review before estimating broader quality.

See [the recorded local-model evaluations](../evaluations/README.md). Unit tests exercise assessment, failed generation, clean/incomplete critiques, private output reservation, and cancellation with synthetic fixtures. CI never invokes live inference.
