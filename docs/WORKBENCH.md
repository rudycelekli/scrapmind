# Saved workbench

The CLI now retains your inventory, AI drafts, build steps, acceptance results, and imported images across runs. This is a working local workflow; the visual workbench is still in development.

## Start locally

Node.js 22.12 or newer, after `npm ci`:

```sh
npm run workbench -- init --inventory examples/demo-inventory.json --name "My workbench"
npm run workbench -- plan --goal "scan a document"
npm run workbench -- start --recipe document-scanner --id first-scanner
npm run workbench -- show --build first-scanner
```

The example inventory is declared **demo data**. Replace it with your actual materials, devices, quantities, and measured dimensions before recording a real build. See [the inventory example](../examples/demo-inventory.json).

The default directory is `.scrapmind/`, ignored by this repository. `--workspace path` chooses another directory. Do not commit private inventories, images, exported bundles, or reports; exports may contain the entire inventory and stored prose. Initialization and bundle import refuse an existing destination directory.

Omit `--inventory` to start empty. With an explicitly configured vision model, `scan --photo path.png|jpg` saves tentative object/function suggestions for owner review. Use `scan-show`, `scan-template`, and `scan-review` to inspect and declare the actual items. Accepted entries remain untested; source photos and decisions are portable. See [the photo-first workflow](INVENTORY-PHOTOS.md).

## Invent with the AI engine

```sh
cp .env.example .env
# Configure a model endpoint and model you have available.
npm run workbench -- ideate --goal "Make a useful inspection tool from these spare devices" --count 3
npm run workbench -- plan
```

Read the proposed uses, reasoning, assumptions, missing parts, and resource-review issues. Each result has a generated recipe ID. To allow a build after inspecting the actual physical procedure:

```sh
npm run workbench -- review --recipe YOUR-RECIPE-ID --acknowledge-review
npm run workbench -- start --recipe YOUR-RECIPE-ID --id my-experiment
```

If resource review has unresolved issues or did not complete, the command also requires `--acknowledge-resource-issues`. Correct a procedure by importing a revised recipe with explicit replacement instead of merely dismissing errors. See [the AI contract and evaluation limits](AI.md).

`plan`, `show`, and `ideate` print readable summaries by default; add `--json` for the full machine-readable result. Full results contain inventory and recipe fingerprints.

## Record what happened

`show` lists actual step IDs and acceptance check IDs for the recipe. Record a step only after carrying it out and inspecting its check:

```sh
npm run workbench -- step --build first-scanner --step STEP-ID
npm run workbench -- check --build first-scanner --check CHECK-ID --outcome unknown --note "Fit needs inspection."
```

Outcomes are `passed`, `failed`, or `unknown`. `step --undo` removes a completion mark. A failed check produces a needs-work state. Inventory or recipe changes make the old build stale; results are preserved, and a new build must use the new plan.

Import a PNG or JPEG as build evidence, selecting a camera ID allocated to that build:

```sh
npm run workbench -- image --build first-scanner --device ALLOCATED-CAMERA-ID --file photo.png
npm run workbench -- check --build first-scanner --check CAPTURE-CHECK-ID --outcome passed --note "Describe the actual observed image detail." --artifact RETURNED-IMAGE-ID
```

Repeat `--artifact` for multiple images. Capture acceptance rules require distinct attached originals, and timed checks require coherent sequence metadata. An ordinary imported photo has no independently established capture time or sequence timing. The CLI inspects supported image headers, dimensions, and checksums; full image decoding and camera capture are provided by the browser library. Image bytes do not prove scene authenticity or hardware identity. Synthetic images used by software tests are not physical evidence.

## Change inventory and replan

```sh
npm run workbench -- availability --item arm --available false
npm run workbench -- plan --goal "scan a document"
npm run workbench -- report
```

This preserves the old build and reports it as stale. The new plan describes available substitutions or missing roles. `inventory --file inventory.json` replaces the full inventory after schema validation. `recipe --file recipe.json` imports a custom recipe; `--replace` explicitly replaces an existing ID. Neither operation infers physical success.

## Reports and portable evidence

```sh
npm run workbench -- report --output my-build-report.md
npm run workbench -- bundle --output my-build-bundle.json
npm run workbench -- audit --bundle my-build-bundle.json
npm run workbench -- import --bundle my-build-bundle.json --workspace restored-workbench
```

Output files must be new. A report distinguishes stored trial status from `verified`, `unchecked`, or `needs-evidence` image integrity. Missing, altered, or unreadable image bytes cannot silently appear verified. AI build reports retain resource-review issues and assumptions. A reported pass remains an owner claim even when checksums match.

Bundles include the complete workspace and referenced photo bytes, bounded to 20 MB of image data and 35 MB of JSON. Export refuses missing or changed images. Import validates all schema references and image checksums before creating its destination. Metadata-only core workspace exports do not contain photo bytes. Bundles and reports are plain text data, not encrypted backups.

## Persistence and recovery

```text
.scrapmind/
  workspace.json   current validated ledger
  images/          checksum-named local PNG/JPEG files
  history/         previous valid ledgers before each successful metadata commit
  workspace.lock   present during a write
```

Images are written before metadata is committed. Metadata uses a same-directory temporary file and atomic rename. Previous ledgers and images are preserved; history is not automatically pruned. Workspaces are single-owner local directories, not a concurrent multi-user database. Keep portable bundles as separate backups; rename and history do not guarantee recovery from disk failure or sudden power loss.

Writers use an exclusive lock. A concurrent write is refused instead of losing someone else's update. An interrupted process may leave `workspace.lock`. Inspect its recorded PID and process state before manually removing it; SCRAPMIND never deletes an existing lock automatically. Failed disk operations may leave an incomplete new directory or an unreferenced image for inspection.

Internal files are bounded regular-file reads, and workspace metadata/image paths do not follow symbolic links. The new files use private permissions on systems that support them. These checks are not encryption or protection against another program running as the same owner.

AI inference occurs outside the write lock. Saving rechecks the exact inventory revision, so an inventory change during inference requires a fresh request. A saved draft's inventory provenance stays inspectable when the current inventory later changes.

```sh
npm run workbench -- --help
# After npm run build:
node dist/scripts/workbench-cli.js --help
```
