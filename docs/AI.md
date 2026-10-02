# AI invention engine

SCRAPMIND's portfolio engine proposes new uses for the owner's materials and devices. Device Alchemy is included: the same engine can propose device-reuse configurations alongside material assemblies. It is a constrained proposal workflow, not a demonstrated general physical invention system.

## Generate and retain ideas

Create a local workbench first, configure an OpenAI-compatible model endpoint in the ignored `.env` file, and explicitly invoke:

```sh
npm run workbench -- ideate --goal "Find useful new ways to inspect small objects with my spare devices" --count 3
```

The command sends the current inventory and goal to the configured provider. It stores up to three generated recipes as **unreviewed drafts**, including reasoning, proposed new use, assumptions to test, input inventory fingerprint, model names, and resource-review issues. It never stores the API key or an uploaded image in recipe provenance. Local providers stay on loopback; remote providers receive the supplied task data. Provider retention policies are outside SCRAPMIND's control.

Nothing calls a model in the background. `plan`, build recording, image storage, and bundle audits work without a model.

## The pipeline

1. **Propose:** the model generates one through three compact concepts with explicit physical roles, quantities, build actions, and acceptance procedures. Avoided catalog titles are supplied as task data; this does not prove novelty.
2. **Check resource contracts:** software checks role references, quantity bounds, every role's inclusion in a step, and action targets. A capture action requires a camera role; illumination requires light; measurement requires measure; display requires display; rotation requires rotation; fastening requires clamp, fastener, or adhesive. Capturing requires a capture acceptance check. Internal role-index syntax is rejected in human instructions.
3. **Allocate:** the planner reserves inventory units and exposes missing roles. Declared capability matching does not establish mounting geometry, connections, or actual performance.
4. **Flag text contradictions:** conservative English text rules flag projection claims and certain fastening, measurement, and illumination instructions lacking referenced capability roles. These rules cover a few known failures; they are not a language-complete semantic or physical verifier and may produce false positives.
5. **Critique:** the configured critic receives the goal, actual inventory, proposed instructions, software text signals, allocations, and missing roles. It looks for undeclared resources, wrong references, unsupported functions, invented specifications, and inadequate acceptance checks. Software signals remain present even if the model reports no issues.
6. **Repair:** one correction can address resource-review issues. Corrected text is checked and critiqued again. An invalid repair preserves the original draft and issues.
7. **Retain for owner review:** proposals are ordered by resource-review state, then declared inventory coverage. They remain drafts regardless of coverage. If inventory changes during inference, saving refuses the outdated proposals.

There are at most **five model calls per explicit portfolio operation**: two generation attempts, a critique, one semantic repair, and a fresh critique. Individual calls have a 90-second timeout; the operation has a 240-second timeout. Responses are bounded to 1 MB before JSON parsing, and textual completions to 100,000 characters. An unavailable or invalid critic produces `not-completed`, never a clean review.

A model can still invent bad advice, omit dependencies, contradict prose, misidentify capabilities, or propose an unhelpful configuration. `no-issues-reported` means the critic reported none; it is **not verified physics**. Dimensions, fit, stability, hardware identity, software connections, actual image detail, and useful results still need owner inspection and real trials.

## Review states

| Resource-review state | Meaning                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `no-issues-reported`  | The software rules and model critic reported no issues within their checks. Errors may remain.              |
| `issues-found`        | Inspect the stored issue descriptions; a repair did not resolve all reported contradictions.                |
| `not-completed`       | The critic failed, timed out, or returned invalid references/data. Software signals may still be available. |

Use `show` or `plan` to inspect saved reasoning and issues. Reviewing any generated recipe requires `--acknowledge-review`. An unresolved or incomplete resource review also requires `--acknowledge-resource-issues`. These flags are owner statements after reading the procedure, not independent certification. Edit a draft through recipe import if you need to correct it; recipe changes invalidate earlier builds.

## Provider configuration

```dotenv
SCRAPMIND_AI_BASE_URL=http://127.0.0.1:11434/v1
SCRAPMIND_AI_MODEL=your-installed-model
# Optional critic model at the same endpoint:
# SCRAPMIND_AI_REVIEW_MODEL=your-review-model
# Optional plain JSON fallback:
# SCRAPMIND_AI_FORMAT=json_object
# Optional reasoning-model request profile:
# SCRAPMIND_AI_PROFILE=reasoning
# Optional per-call output limit, 1024–32768:
# SCRAPMIND_AI_MAX_OUTPUT_TOKENS=16384
# Optional provider authentication:
# SCRAPMIND_AI_KEY=
```

The default `compatible` profile sends `max_tokens` and temperature. The `reasoning` profile sends `max_completion_tokens` and omits optional sampling controls. OpenAI documents that the newer limit includes reasoning tokens and that the legacy limit is incompatible with o-series models. See [the Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Check your provider's support; this compatibility profile is covered by protocol tests, not a live cloud-model benchmark. [Ollama's compatibility documentation](https://docs.ollama.com/api/openai-compatibility) describes its supported subset.

If a completion reaches its token limit, use fewer ideas or an explicitly configured supported output limit. No model downloads, paid subscriptions, or automatic model upgrades are performed.

A separately configured critic is still another model opinion, not independent physical validation. The legacy `invent` command and `/api/invent` retain the simpler one-recipe schema/repair protocol; use `workbench ideate` or `/api/ideate` for the portfolio and resource-critique flow.

## Actual model exploration

The preinstalled local `llama3.2:3b` was exercised using only the public demo inventory. A schema-valid shadow-comparison proposal confused a webcam with a projector, used undeclared lamps and rulers, and mismatched step roles. Adding action-target contracts caused the next trial to be rejected after two attempts.

A tightly constrained three-role prompt then returned a schema-valid draft, and its model critic reported no issues. Manual inspection still found undeclared fastening and role-index syntax inside human instructions. That observation prompted the software text signals, rejection of leaked role metadata, and a capture-evidence requirement. Regression tests exercise those failure classes with explicitly synthetic inputs. A subsequent two-role, no-fastening prompt was rejected because a fastening action had no fastening role.

These are failure explorations, not successful inventions or a benchmark. They show why schema validity, inventory coverage, and model self-critique cannot establish reliable planning. Stronger model evaluations and a varied, reproducible physical challenge set remain required. No cloud model or physical assembly was evaluated in this release.
