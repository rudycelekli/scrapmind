# SCRAPMIND

**Invent with what you have.**

Materials, spare devices, useful new configurations. SCRAPMIND searches your inventory, assigns parts without double-booking them, explains substitutions, and gives you build steps with acceptance checks. **Device Alchemy** is its device-reuse workflow: a spare camera, a host, and suitable materials can become a candidate scanner, inspection station, or capture rig.

**Status: early engineering alpha.** The planning core, CLI, local API, optional model proposals, and browser camera library work. Device Alchemy can capture images, correct perspective, store photos locally, and attach them to a build revision. The visual workbench and its camera controls are in development. This release does not recognize arbitrary scrap from photographs, establish mechanical compatibility, control remote devices, or demonstrate general invention intelligence. Matching parts is a candidate plan; a real build still needs inspection and a trial.

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

The catalog is not the invention boundary. You can import your own [recipe](examples/document-scanner.json), or explicitly request a draft from a configured OpenAI-compatible model server:

```sh
cp .env.example .env
# Edit .env to use a model you already have available.
npm run invent -- --inventory examples/demo-inventory.json --goal "Make a useful desk tool"
```

[Ollama](https://docs.ollama.com/api/openai-compatibility) is one supported protocol option. No model is downloaded or contacted by the default demo. A remote provider receives the supplied inventory when you explicitly invoke invention; a loopback provider stays on your machine. Provider keys remain in the ignored `.env` file.

The model returns data, not executable code. SCRAPMIND validates IDs, capabilities, quantities, step references, and bounds, then checks the proposal against the actual inventory. An explicit request makes at most two calls, with one repair attempt for malformed proposals. A generated recipe remains a **draft** even when its allocation is complete, and cannot start a build until reviewed. Model output can still omit needed roles or contain incorrect physical advice; schema validity is not a physical guarantee.

```sh
npm run plan -- --inventory examples/demo-inventory.json --recipe examples/document-scanner.json
```

## Local API and library

```sh
npm run serve
# http://127.0.0.1:4317/api/status
```

The API binds to loopback, disables cross-origin requests, and provides catalog, plan, and explicit invention endpoints. See [API documentation](docs/API.md).

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

Tests cover quantity and availability invariants, constrained allocation, alternate supports, missing measurements, model output validation, stale-build rejection, workspace round trips, API boundaries, image evidence, and perspective-correction mathematics. Property tests use a recorded seed. Chromium tests also exercise capture, storage, image export, and permission cleanup with a **synthetic camera**. These are software tests, not evidence of a successful physical build.

See [the roadmap](docs/ROADMAP.md), [engineering status](docs/STATUS.md), [contributing](CONTRIBUTING.md), and [the recipe contract](docs/RECIPES.md).

## Research position

AI-assisted CAD, material reuse, camera tools, and device repurposing have substantial prior art. SCRAPMIND's direction is to connect inventory constraints, adaptive planning, and actual build evidence in one usable workflow. This alpha does not establish a novel research result. Stronger claims require reproducible physical challenges, comparisons, and a dated prior-art review.

MIT licensed. Build something useful, record what happened, and share what others can reproduce.
