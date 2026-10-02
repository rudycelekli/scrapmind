# Changes

## 0.1.0-alpha.6 — Live AI evaluation and action-aware repair guidance

The explicit evaluation command runs declared inventory challenges against configured generation/critic models and retains inputs, failures, returned drafts, independent software contracts, removal plans, timings, attempted request counts, and pending human/physical review. Reports separate required actions, allocated capabilities, expected missing resources, text signals, and incomplete critiques. Existing output files are refused before inference; Ctrl+C retains partial results. Injected responses cannot be labeled live benchmarks.

A real local-model diagnostic exposed manual lamp positioning marked as hardware rotation. Validation-repair requests now list permitted actions for the model's declared roles, explain manual positioning versus mechanisms, and prohibit inventing capabilities to make a rejected action validate. The original resource contract stays enforced.

Validation: 103 tests, strict TypeScript, emitted ESM, formatting, and the existing Chromium protocol check. Actual `llama3.2:3b` evaluations are retained: after repair guidance, one of four revised cases produced a draft, which still failed the requested-action contract despite a clean critic. This is not dependable invention, demonstrated physical performance, or a controlled A/B improvement. See [the evaluation guide](EVALUATION.md) and [recorded results](../evaluations/README.md).

## 0.1.0-alpha.5 — Photo inventory suggestions and owner review

An explicitly configured vision model can propose objects, approximate counts, image regions, possible functions, and existing-inventory matches from a selected photo. Uncertain kinds and empty capability suggestions are retained. Software validates input bytes, proposal bounds, and references; one syntax/schema repair is allowed. Photos never establish measured dimensions, hidden properties, tested capabilities, or compatibility.

The workbench can start empty and retain scan observations, original photos, and owner resolutions. Accepted inventory requires explicit owner declarations and matching source bytes. Existing quantities are not merged automatically; replacement clears previous tested claims. Inventory changes during review reject stale decision files, and new declarations invalidate old builds. Photo evidence participates in global image-ID checks, reports, storage, and portable bundles.

Validation: 93 tests, strict TypeScript, emitted ESM, and actual Chromium execution with a synthetic camera and synthetic vision response. A local HTTP fixture exercises scan through owner review, inventory, report, bundle audit, and restoration. No installed local model reports vision capability, so recognition accuracy and physical workshop results remain unevaluated. The visual workbench is still pending. See [photo workflow and limits](INVENTORY-PHOTOS.md).

## 0.1.0-alpha.4 — AI portfolios and a saved workbench

The portfolio engine proposes up to three ideas with reasoning, physical roles, action-capability contracts, allocations, and explicit assumptions. Conservative text signals and a configurable model critic expose resource issues; one semantic repair is rechecked and critiqued. Drafts retain model provenance and review state. Generated plans require owner review, and unresolved/incomplete resource review requires a separate acknowledgement. Inference stays explicit and bounded to five calls per operation. Reasoning-model token parameters and a separate critic model are configurable.

The local CLI now retains inventory, custom/AI recipes, builds, imported photos, step progress, and acceptance results. Reads validate schemas and byte bounds; writers use exclusive locks, previous ledgers, content-addressed image files, and atomic metadata replacement. Full evidence bundles import only after all bytes and references validate. Reports separate owner-reported status from image-byte integrity and retain AI assumptions. Existing files and workspace roots are preserved instead of silently overwritten.

Actual small local-model trials exposed invalid references, unsupported functions, undeclared fastening, and false-clean model critique. Those failures informed contracts and regression coverage. They do not establish dependable invention or physical success. The visual workbench and physical starter trials remain pending. See [AI limits](AI.md) and [the saved workbench](WORKBENCH.md).

Validation: 81 core, API, model-protocol, disk-persistence, and CLI integration tests; strict TypeScript; emitted ESM; formatting; and actual Chromium execution with a synthetic camera. Local-model exploration is reported separately from synthetic protocol success cases.

## 0.1.0-alpha.3 — Timed sequences and device trials

Device Alchemy can now capture foreground still sequences with actual elapsed-time metadata, measured intervals, cancellation, and camera-ended cleanup. Slow encoding or consumers skip overdue schedule slots. Captures wait for an arriving video frame; stalled delivery times out and releases the source. Timed acceptance checks require a coherent sequence and measured span, including the starter time-lapse recipe.

A standalone camera-frame trial opens a selected browser source, produces and decodes a still image, records its evidence, and releases the camera. Applying it requires the actual image bytes, an unchanged device configuration, and explicit owner confirmation of the device association. It updates only the tested camera capability. Declared synthetic or failed trials cannot establish an owner-device result. Trial images are included in portable evidence bundles.

Validation: 57 core/API tests, strict TypeScript, emitted ESM, formatting, and the expanded Chromium synthetic-camera suite. The suite records a three-frame sequence, measured intervals, and a standalone trial; it exercises cancellation, stopping, denied trials, stalled-frame cleanup, persistence, and portable trial-image exports. File limits now count UTF-8 bytes accurately.

Limits: the visual workbench and actual physical trials are still pending. Sequences are bounded foreground still capture, not unattended multi-day recording. A frame-producing source does not establish optical quality, mounting fit, scene authenticity, or independent hardware identity.

## 0.1.0-alpha.2 — Device Alchemy image evidence

Device Alchemy now has a browser camera library: explicit permission-based capture, local photo import, manual perspective correction, and IndexedDB image storage. PNG and JPEG images can be attached to an allocated device and the exact build revision. SHA-256 checks detect changed image bytes, and corrected images retain their original lineage.

Passing capture checks now require attached evidence. Checks can require multiple original images; multiple crops of one original count once. Declared test fixtures cannot satisfy a passing capture check. A portable evidence bundle includes the workspace and all referenced photos, refusing missing or altered files.

Validation: 45 core/API tests, strict TypeScript, emitted ESM, formatting checks, and a real Chromium API run with a synthetic 1920 × 1080 camera. Browser checks cover capture, correction, image import, persistence, bundles, stale builds, denial, late permission grants, disconnection, and stopping tracks. GitHub CI adds a dedicated Chromium job alongside Node.js 22 and 24.

Compatibility: older metadata-only builds remain readable when they have no dangling artifact references. A capture pass without an attached image no longer yields a complete reported pass. Changed recipe definitions make older build revisions stale.

Limits: this is a developer-facing camera component. The visual workbench, physical camera trials, actual assembly demonstrations, secure phone pairing, and dimensioned fabrication remain unfinished. A checksum and an owner-reported pass do not prove physical success or independently authenticate a scene.
