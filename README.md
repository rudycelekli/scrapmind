# SCRAPMIND

**Invent with what you have.**

SCRAPMIND is an AI invention workbench for the materials and spare devices you already own. Its configured model engine proposes new uses, explains its reasoning, declares physical roles, and critiques resource mistakes before saving drafts. The planner assigns parts without double-booking them and exposes substitutions and missing resources. **Device Alchemy** is integrated: a spare camera, a host, and suitable materials can become a candidate scanner, inspection station, or capture rig.

**Status: early engineering alpha.** The saved CLI workbench, planning core, local API, AI portfolio protocol, and browser camera library are implemented. Drafts retain reasoning, assumptions, resource-review issues, and model provenance; builds retain steps, acceptance results, and image evidence. Device Alchemy can capture images, correct perspective, and store photos locally. The visual workbench is in development. Small local-model trials exposed unresolved generation and critique errors; dependable invention, arbitrary scrap recognition, mechanical compatibility, and actual physical success remain unestablished.

## Try the remove-a-part challenge

Node.js 22.12 or newer:

```sh
git clone https://github.com/rudycelekli/scrapmind.git
cd scrapmind
npm ci
npm run demo
```

The demo plans an overhead document scanner, removes its adjustable support, and searches again. A rigid box is a candidate substitute. The output names the changed role and provides the inspection steps needed to determine whether that substitution really fits.

The sample inventory is **declared demo data**, not hardware discovered on your machine or a claim that a physical scanner was built.

```text
your materials + devices + measurements
                   │
           constrained allocation ← optional model proposal
                   │                       │
       parts, substitutes, missing roles ← schema validation
                   │
            guided physical build
                   │
       observations + measurements + captures
                   │
           a user-reported trial
```

## Plan with your own inventory

Copy [the example inventory](examples/demo-inventory.json), replace it with your actual items, and run:

```sh
npm run plan -- --inventory examples/demo-inventory.json --goal "scan a document"
npm run plan -- --inventory examples/demo-inventory.json --goal "phone stand" --json
```

Each item has a quantity, availability, declared capabilities, optional measured dimensions in millimetres, and an evidence level. The planner reserves every assigned unit. It reports missing roles instead of inventing parts. Dimension-dependent roles require explicit measurements.

Six starter recipes are included:

| Configuration            | Workflow       | Actual trial needed                             |
| ------------------------ | -------------- | ----------------------------------------------- |
| Document scanner         | Device Alchemy | Mount fit, framing, stability, readable capture |
| Inspection station       | Device Alchemy | Focus and visible target detail                 |
| Phone stand              | Fabrication    | Contact geometry, sliding, tipping              |
| Photo light box          | Device Alchemy | Actual change in glare and shadows              |
| Time-lapse rig           | Device Alchemy | Timestamped frames and consistent framing       |
| Object capture turntable | Device Alchemy | Viewpoint coverage and alignment                |

These recipes are explicit starting procedures, not fabricated CAD models, certified structures, or finished hardware products.

## Propose something new

The catalog is not the proposal boundary. Initialize a saved workbench and explicitly request new drafts from a configured OpenAI-compatible model server:

```sh
cp .env.example .env
# Edit .env to use a model you already have available.
npm run workbench -- init --inventory examples/demo-inventory.json --name "My workbench"
npm run workbench -- ideate --goal "Make useful new inspection tools from my spare devices" --count 3
npm run workbench -- plan
```

[Ollama](https://docs.ollama.com/api/openai-compatibility) is one supported protocol option. No model is downloaded or contacted by the default demo. A remote provider receives the supplied inventory when you explicitly invoke invention; a loopback provider stays on your machine. Provider keys remain in the ignored `.env` file.

The engine generates up to three ideas, checks action capabilities and conserved quantities, flags some prose contradictions, requests a resource critique, and attempts a bounded correction. It makes at most five model calls per explicit operation. Model critique cannot override software text signals. A generated recipe remains a **draft** even when its allocation is complete, and cannot start a build until reviewed. Its claimed new use is not proof of global novelty; model advice and physical assumptions still need inspection.

Reasoning-model compatibility and a separately configured critic are supported. No background inference, model downloads, or automatic upgrades occur. See [the AI engine and actual evaluation limits](docs/AI.md).

Measure a configured model with `npm run evaluate -- --list`, then explicitly run selected inventory challenges. Reports retain rejected generations, allocated/missing resources, model critique, and removal-challenge plans. A contract pass still requires human review and a physical trial. See [the evaluation guide](docs/EVALUATION.md) and [recorded local-model results](evaluations/README.md).

You can also start an empty workbench and request **photo inventory suggestions** from an explicitly configured vision model. Objects, counts, and functions remain tentative until owner review; accepted entries are declared, never automatically measured or tested. Source photos and decisions survive portable exports. The protocol and review flow are tested with synthetic responses; real recognition accuracy is not established. See [the photo workflow](docs/INVENTORY-PHOTOS.md).

You can also import your own [recipe](examples/document-scanner.json), or use the legacy `npm run invent` command for a simpler single-recipe schema/repair request:

```sh
npm run plan -- --inventory examples/demo-inventory.json --recipe examples/document-scanner.json
```

## Build and retain the evidence

```sh
npm run workbench -- start --recipe document-scanner --id first-scanner
npm run workbench -- show --build first-scanner
# Inspect the actual parts, follow the procedure, and record its steps/checks.
npm run workbench -- availability --item arm --available false
npm run workbench -- plan --goal "scan a document"
npm run workbench -- report
```

Inventory changes preserve earlier results as stale. Imported photos are bound to a build revision and an allocated camera. Reports distinguish recorded owner claims from missing or changed image bytes. Portable bundles include the ledger and original photos, with full validation before import. Local writes preserve previous ledgers and refuse concurrent updates. See [the saved-workbench guide](docs/WORKBENCH.md).

## Local API and library

```sh
npm run serve
# http://127.0.0.1:4317/api/status
```

The API binds to loopback, disables cross-origin requests, and provides catalog, plan, single-recipe invention, and AI portfolio endpoints. See [API documentation](docs/API.md).

The TypeScript core is importable from `core/index.ts`. `npm run build` emits runnable ESM, declarations, and source maps in `dist/`. The emitted CLI can run with `node dist/scripts/cli.js demo`.

## Device Alchemy camera library

The browser component opens a camera on an explicit user action, captures PNG or JPEG images, imports local photos, and straightens a selected four-corner region. Captures stay local. The build ledger verifies image checksums and requires an allocated camera and matching build revision. A corrected image retains its original image as evidence.

Timed sequences record actual intervals and skip overdue slots. A separate [camera capability trial](docs/DEVICE-TRIALS.md) produces a decodable image and releases the source. The owner must identify the corresponding inventory device before applying that result; it updates only the tested camera capability. Optical quality and assembly fit still need their own checks.

Photos can be saved in IndexedDB and exported with the workspace in a portable evidence bundle. A metadata-only workspace export is also available. See [camera usage and evidence rules](docs/CAMERA.md). These are developer-facing components awaiting the workbench, rather than a finished camera app.

## Evidence, not pretend confidence

- **Declared:** the inventory owner says a capability exists.
- **Observed:** the owner reports observing it.
- **Tested:** the required capability is included in the owner's tested-capability list.
- **Reported pass:** all recipe steps and acceptance checks were completed in a recorded user trial.

Those labels describe stored evidence claims. They are not independent certification, cryptographic attestation, or guarantees of physical success. Passing capture checks require attached images; a checksum detects changed image bytes without establishing scene authenticity. Inventory changes and recipe changes invalidate old build results.

## Development

```sh
npm run check
npm run format:check
```

Tests cover conserved allocation, substitutions, missing measurements, AI action contracts and critique/repair failures, retained provenance, stale builds, concurrent disk writes, saved CLI workflows, reports, portable evidence, API boundaries, and perspective correction. Property tests use a recorded seed. Model protocol success cases use **synthetic responses**. Chromium tests exercise capture, storage, image export, and permission cleanup with a **synthetic camera**. These are software tests, not evidence of a successful physical build or dependable model invention.

See [the roadmap](docs/ROADMAP.md), [engineering status](docs/STATUS.md), [contributing](CONTRIBUTING.md), and [the recipe contract](docs/RECIPES.md).

## Research position

AI-assisted CAD, material reuse, camera tools, and device repurposing have substantial prior art. SCRAPMIND's direction is to connect inventory constraints, adaptive planning, and actual build evidence in one usable workflow. This alpha does not establish a novel research result. Stronger claims require reproducible physical challenges, comparisons, and a dated prior-art review.

MIT licensed. Build something useful, record what happened, and share what others can reproduce.
