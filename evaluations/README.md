# Recorded AI evaluations

The JSON files in `results/` retain actual loopback Llama and Qwen text-model operations on public declared demo inventories. No private inventory, photo, API key, cloud operation, or physical trial was used. Successful protocol unit tests elsewhere use explicit synthetic responses; these report files are live endpoint records.

The preinstalled model's digest was `a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72`; its quantization was Q4_K_M. The server reported 4096-token allocated context. Generation used the compatible profile, JSON-schema output, an 8192 output-token maximum, and the same model for critique. The server's context bound and output limit are different settings. These records do not establish determinism across hardware, sampling, model revisions, or server versions.

## Initial development runs

- [Lamp/panel case](results/2026-10-02-llama32-lamp-panel.json): no validated portfolio after two requests.
- [Other three cases](results/2026-10-02-llama32-remaining-cases.json): no validated portfolio in any case, after six requests.

These are **four rejected generation operations**, not four failed physical builds. No concept survived the schema/resource contract, so there were no generated proposals to grade for semantic usefulness or physical feasibility. Zero contract failures among zero generated proposals is not a success rate.

The initial camera case omitted an explicit compute host. That corpus defect was corrected before release: the current case supplies a laptop, requires its compute capability to be allocated, and names it in the goal. Earlier reports keep their exact original snapshots. The initial reports also predate separate procedure/critic counters; absent fields must not be interpreted as an evaluated clean critique. Their aggregate cannot be treated as an A/B comparison with the revised suite.

An additional diagnostic lamp/panel operation returned a manual-positioning instruction marked `rotate` despite declaring only `light` on the target lamp. Its bounded retry repeated that contradiction. This motivated role-specific action guidance in validation-repair requests: manual repositioning is `arrange`, while `rotate` requires a declared mechanism. The engine still rejects an unsupported action; no capability is silently added and no instruction is automatically relabeled.

## Run with role-action repair guidance

[The revised four-case run](results/2026-10-02-llama32-role-action-hints.json) made nine attempted requests. The lamp/panel case returned one schema-valid draft after a repair and a critic call. The other three cases were rejected after two generation attempts each. There was **one generated portfolio out of four**, and **zero contract passes out of one generated proposal**.

The lamp/panel draft allocated both supplied parts without double booking and represented manual comparison. It still omitted the case's required `illuminate` action, so the deterministic assessment failed it even though the model critic reported no issues. Text inspection also found a stable-surface placement and height/angle adjustment instruction whose supporting geometry or mechanism was not established by inventory. This is an inspectable draft, not a useful-performance result. Removing its lamp produced an explicitly blocked plan with the light role missing.

The lamp/panel goal and inventory were unchanged from its initial run. One later output is not a statistically established improvement. The full suite's capture case changed to include the host, so the earlier and revised aggregate counts are not a controlled A/B result. All human and physical reviews remain pending.

## Qwen3 exploration and a corrected assessment

A selected `qwen3:1.7b` text model was explicitly downloaded for development evaluation (1,359,293,444 bytes, Q4_K_M). The existing models and global server configuration were preserved. A named `scrapmind-qwen3-16k:eval` variant reused the same weights with `num_ctx 16384`; the server reported that allocated context. [Sanitized server/model metadata](models/2026-10-02-local-models.json) records exact digests and reported capabilities. The models report no vision capability; no photos were sent to them.

Ollama 0.13.0 was used with the compatible token profile, JSON-schema output, an 8192 output-token maximum, and the same selected model for critique. `reasoning_effort: none` was explicit in the latter runs. A configured effort or reported thinking capability is not a measurement of reasoning quality.

| Retained live run                                                                           | Requests | Generated cases | Original contract passes | Incomplete critiques |
| ------------------------------------------------------------------------------------------- | -------: | --------------: | -----------------------: | -------------------: |
| [Qwen3 default effort, lamp/panel](results/2026-10-02-qwen3-default-lamp-panel.json)        |        2 |           0 / 1 |          0 / 0 proposals |                    0 |
| [Qwen3, effort none, four cases](results/2026-10-02-qwen3-effort-none.json)                 |        8 |           1 / 4 |           0 / 1 proposal |                    1 |
| [Named 16k variant, effort none, four cases](results/2026-10-02-qwen3-16k-effort-none.json) |        8 |           2 / 4 |          1 / 2 proposals |                    2 |

The 4k-context run's lamp draft omitted the required illumination action and had a software resource signal. In the 16k run, the webcam role demanded capabilities absent from its declared inventory and comparison was omitted. Its other generated draft used one phone role without double booking, but required an undeclared stand in its boundaries. It described built-in camera/display use rather than establishing a novel useful configuration; its acceptance procedure also did not establish the stated alignment behavior. These observations are developer text inspection, not independent human or physical validation. Both 16k drafts had incomplete model critiques, so zero returned critic issues must not be read as clean critiques.

The original v1 report retains its single-phone contract pass. [A separate v2 software rescore](reviews/2026-10-02-qwen3-16k-resource-review.json), using the retained concepts and exact case snapshots with **zero new model requests**, flags the hidden stand. Both generated drafts then fail the limited contract. This records a verifier gap and its bounded correction; it is not another model run or proof that the revised rules catch all undeclared resources.

One run per configuration, changed context/effort, and uncontrolled sampling cannot establish that either setting improves generation. Failures are preserved, and all human reviews and physical validation remain pending.

To explicitly install the selected model and create the named variant (optional; these commands download model weights and use local storage):

```sh
ollama pull qwen3:1.7b
ollama create scrapmind-qwen3-16k:eval -f evaluations/models/qwen3-16k.Modelfile
mkdir -p .scrapmind/evaluations
SCRAPMIND_AI_BASE_URL=http://127.0.0.1:11434/v1 \
SCRAPMIND_AI_MODEL=scrapmind-qwen3-16k:eval \
SCRAPMIND_AI_PROFILE=compatible \
SCRAPMIND_AI_REASONING_EFFORT=none \
npm run evaluate -- --case all --output .scrapmind/evaluations/qwen3-16k.json
```

These commands request the recorded configuration; tags, server versions, sampling, and hardware can change the output. Current code applies v2 assessment. It does not recreate the original v1 result or guarantee usable drafts. Unsupported reasoning-effort settings fail; the application does not automatically change them.

## Reproduce and inspect

Use [the evaluation guide](../docs/EVALUATION.md) to run individual cases or a complete suite and inspect the retained drafts. An actual model may fail; the command saves the failure record and returns exit code 2. There is no fallback synthetic invention presented as live inference.

Ollama's [OpenAI compatibility guide](https://docs.ollama.com/api/openai-compatibility#setting-the-local-context-size) explains how to configure a named local model's context size. Its [context-length documentation](https://docs.ollama.com/context-length) describes inspecting the allocated context. The Llama evaluations used the preinstalled model without reconfiguring the server or downloading a model. They did not establish context truncation as the cause of the observed action error. The later explicitly installed Qwen model and named context variant are described below.

Four small engineering cases are not representative evidence of general invention intelligence. Keep semantic reviews, physical trials, and novelty evaluation separate from contract metrics.

During later interface development, the task-owned Qwen3 download and its named evaluation variant were removed to recover disk space. The preinstalled models were preserved. The metadata snapshot and reports above retain their original historical state; reproducing Qwen runs requires the explicit installation commands.
