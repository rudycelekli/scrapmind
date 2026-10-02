# Engineering status

Date: 2026-10-02. Release: 0.1.0-alpha.2.

## Executed software validation

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

The repository's CI runs checks on Node.js 22 and 24, plus a Chromium camera job. A successful workflow is evidence for software correctness under its tests, not physical performance. The browser library exists; a designed camera interface is still pending.

## Actual local-model exploration

The preinstalled `llama3.2:3b` model was exercised through a loopback Ollama endpoint using only the public demo inventory. Early attempts exposed malformed envelopes and invalid role references. Another schema-valid result omitted physical roles from its steps and invented a clamp-force limit. These observations prompted stronger reference validation, bounded repair, and a distinct draft state.

After tightening the contract to require nonempty step references, a subsequent trial failed role validation after two attempts and was rejected. This is not a successful physical plan or evidence of dependable model-based invention. The adapter's successful protocol cases are tested with explicit synthetic responses; robust generation needs stronger models and a broader evaluation set.

## Not demonstrated

- Physical assembly success, mounting compatibility, stability ratings, electrical suitability, or measured optical quality.
- Capture from an actual physical camera, phone pairing, dimensioned fabrication, or a finished visual workbench.
- Arbitrary object recognition, general invention intelligence, learned physical planning, or research novelty.

## Next concrete work

Complete the product interview, integrate the camera library into the visual workbench, record a physical starter build, and evaluate generation on varied actual inventories. See [the roadmap](ROADMAP.md).
