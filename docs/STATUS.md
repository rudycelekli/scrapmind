# Engineering status

Date: 2026-10-02. Release: 0.1.0-alpha.5.

## Executed software validation

93 core/API/model-protocol/persistence tests pass. The emitted CLI was also run through local initialization, readable procedures, inventory substitution, stale-build reporting, bundle audit, and restoration. An additional emitted-CLI smoke run exercised empty initialization, a synthetic HTTP vision response, owner review, declared inventory, photo checksums, bundle audit, and restoration. These smoke runs used public demo data or synthetic fixtures; no live vision inference or physical trial occurred.

- Strict TypeScript checking and emitted ESM build.
- Starter allocation and missing-resource checks.
- Remove-a-support demo: the adjustable arm is allocated first; removing it selects the declared rigid-box alternative.
- Seeded property testing across 100 varied inventory quantity/availability states for all six starter recipes. Allocations never exceed available quantities in those cases.
- Build results become stale after inventory or recipe changes.
- Imported schemas reject duplicate IDs, unsupported capability names, missing step references, and out-of-bound data.
- Generated proposals remain drafts until reviewed, and draft builds cannot start.
- Homography corner mapping and identity-warp checks.
- Actual loopback HTTP planning requests, disabled-model behavior, malformed JSON, and cross-origin rejection.
- Portable workspace round trips and format bounds.
- Image byte checksums, immutable artifact IDs, build/device bindings, and required evidence for passing capture checks.
- Perspective-corrected images retain their parent; multiple crops cannot count as multiple originals.
- Portable evidence bundles include all referenced image bytes and reject missing, altered, duplicate, or unrelated images.
- Actual Chromium media, canvas, JPEG decoding, IndexedDB, and cryptographic API execution with a **synthetic 1920 × 1080 camera**. The test corrects a frame to a decodable 160 × 120 PNG, reopens image storage, round-trips an image bundle, invalidates a changed inventory, handles permission denial, releases a late-granted stream, and stops tracks.
- Timed sequences: actual elapsed timestamps, skipped overdue slots, single-frame encoding, cancellation, and camera-ended cleanup. Fake-time tests establish behavior under a 250 ms encoder with 100 ms requested intervals; measured starts are 0, 300, and 600 ms rather than a catch-up burst.
- Actual Chromium execution of a three-frame synthetic sequence, with measured intervals, a standalone camera-frame trial, trial-photo bundling, and refusal to apply a declared synthetic trial to an owner-device capability. Stalled frame delivery times out and releases the source.
- Owner-confirmation, device-configuration invalidation, image-checksum requirements, and updating only a tested camera capability. These policy tests use explicitly synthetic inputs, not physical sensor trials.
- UTF-8 byte limits for workspace and evidence exports, including non-ASCII input.
- AI portfolio protocol with action-target contracts, capture-evidence checks, schema repair, critique, semantic repair, and fresh review of changed text. Success cases use synthetic responses.
- Conservative prose signals remain visible when a model critic reports none; malformed critiques are recorded as incomplete. Model response bytes are bounded before JSON parsing. Reasoning token-field compatibility and separate critic routing are covered by synthetic protocol tests.
- Saved CLI build workflow, image imports, recorded owner claims, full evidence export/import, checksum audits, missing-image reports, recipe and inventory invalidation, private file permissions, exclusive outputs, symlink rejection, and concurrent-write refusal.
- Reasoning and physical assumptions survive workspace round trips. Saving AI drafts refuses an inventory revision changed during inference.
- Photo-input protocol, canonical base64/MIME/size checks, bounded schema repair, uncertain candidates, valid existing-item references, and disabled vision behavior. Synthetic model responses supply protocol success cases.
- Owner photo review rejects unconfirmed, duplicate, unknown, stale, tested, or synthetic accepted declarations. Explicit replacements use owner counts and clear previous tested claims. Source photos are required for acceptance and retained in bundles; scan images cannot become build captures.
- A local HTTP vision fixture executes empty-workbench initialization, scan, owner review, declared inventory, report, photo bundle audit, and restore. These use synthetic images and responses, not real object recognition.
- Actual Chromium execution of photo-data-URL conversion, scan protocol simulation, IndexedDB storage, four-image bundle restoration, and refusal to apply a synthetic scan to owner inventory. The camera and model response remain explicitly synthetic.

The repository's CI runs checks on Node.js 22 and 24, plus a Chromium camera job. A successful workflow is evidence for software correctness under its tests, not physical performance. The browser library exists; a designed camera interface is still pending.

## Actual local-model exploration

The preinstalled `llama3.2:3b` model was exercised through a loopback Ollama endpoint using only the public demo inventory. Early attempts exposed malformed envelopes and invalid role references. Another schema-valid result omitted physical roles from its steps and invented a clamp-force limit. These observations prompted stronger reference validation, bounded repair, and a distinct draft state.

After tightening the contract to require nonempty step references, a subsequent trial failed role validation after two attempts and was rejected. This is not a successful physical plan or evidence of dependable model-based invention. The adapter's successful protocol cases are tested with explicit synthetic responses; robust generation needs stronger models and a broader evaluation set.

Portfolio exploration exposed a webcam used as a projector, undeclared parts, and incorrect step roles. After adding action-target checks, a subsequent trial was rejected. A tightly constrained prompt produced a draft whose model critic reported no issues, but manual inspection found undeclared fastening and role metadata in human instructions. Those observations prompted software text signals, rejection of role-index prose, and required capture evidence. A later two-role no-fastening request was rejected because its fastening action lacked a suitable role. These are recorded model failures, not validated inventions; see [the AI evaluation account](AI.md).

## Not demonstrated

- Physical assembly success, mounting compatibility, stability ratings, electrical suitability, or measured optical quality.
- Capture from an actual physical camera, phone pairing, dimensioned fabrication, or a finished visual workbench.
- Arbitrary object recognition, general invention intelligence, learned physical planning, or research novelty.
- Live vision-model recognition accuracy. Both installed local models report completion capabilities without vision; no images were sent to them and no vision model was downloaded.

## Next concrete work

Complete the product interview, integrate the camera library into the visual workbench, record a physical starter build, and evaluate generation on varied actual inventories. See [the roadmap](ROADMAP.md).
