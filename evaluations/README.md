# Recorded AI evaluations

The JSON files in `results/` retain actual loopback `llama3.2:3b` operations on public declared demo inventories. No private inventory, photo, API key, cloud operation, or physical trial was used. Successful protocol unit tests elsewhere use explicit synthetic responses; these report files are live endpoint records.

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

## Reproduce and inspect

Use [the evaluation guide](../docs/EVALUATION.md) to run individual cases or a complete suite and inspect the retained drafts. An actual model may fail; the command saves the failure record and returns exit code 2. There is no fallback synthetic invention presented as live inference.

Ollama's [OpenAI compatibility guide](https://docs.ollama.com/api/openai-compatibility#setting-the-local-context-size) explains how to configure a named local model's context size. Its [context-length documentation](https://docs.ollama.com/context-length) describes inspecting the allocated context. This evaluation did not reconfigure the user's server, create a replacement model, download a model, or establish context truncation as the cause of the observed action error.

Four small engineering cases are not representative evidence of general invention intelligence. Keep semantic reviews, physical trials, and novelty evaluation separate from contract metrics.
