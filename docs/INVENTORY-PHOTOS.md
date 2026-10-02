# Inventory photo suggestions

A photo can start an inventory review. A configured vision model proposes visible objects, approximate counts, possible kinds and functions, image regions, uncertainties, and possible matches to existing inventory. The owner decides what actually enters the workbench. The original photo stays linked to the suggestions and owner decisions.

This is an implemented vision protocol and review workflow, not demonstrated arbitrary scrap recognition. Recognition accuracy and physical correctness remain untested with real workshop photos in this release.

## Start from a photo

Initialize an empty workbench, or supply your existing inventory with `--inventory path.json`:

```sh
npm run workbench -- init --name "My photo lab"
cp .env.example .env
# Configure the endpoint, generation model, and a vision-capable model in .env.
npm run workbench -- scan --photo my-workshop.jpg
```

Photo inference requires an explicit `SCRAPMIND_AI_VISION_MODEL` at the same configured endpoint:

```dotenv
SCRAPMIND_AI_BASE_URL=http://127.0.0.1:11434/v1
SCRAPMIND_AI_MODEL=your-generation-model
SCRAPMIND_AI_VISION_MODEL=your-vision-model
```

The model name is configuration, not a discovered or tested capability. Check that your provider supports image input and the selected output format. No model is downloaded, upgraded, or contacted by initialization, normal planning, reporting, or tests. A missing vision setting stops `scan` without sending anything to a provider.

`scan` is an explicit model operation. A remote provider receives the selected original image bytes, any metadata embedded in those bytes, and the current inventory. Loopback providers process the request on your machine. Keys remain in the ignored `.env`; no key is stored with observations. Provider retention policy is outside this project's control.

## Inspect and declare the actual items

The command prints a scan ID and tentative suggestions. Unknown kinds and empty capability lists are valid observations; they do not force an invented classification. Inspect the actual objects and current inventory:

```sh
npm run workbench -- scan-show --scan SCAN-ID
npm run workbench -- scan-template --scan SCAN-ID --output .scrapmind/photo-review.json
```

The template is intentionally not ready to apply. It has `confirmedPhysicalInventory: false`, `action: pending`, blank item IDs and owner notes, and tentative names/counts/kinds/capabilities. Edit it after checking the actual items. You can submit a subset of decisions and leave the rest pending.

- `add`: supply a new item ID and the actual name, kind, quantity, availability, and declared capabilities. At least one capability must be identified before an item can enter the current inventory schema.
- `replace`: supply an existing item ID and a complete declaration after checking identity and count. This replaces the item; quantities are not silently added. Earlier tested-capability claims are cleared because a photo cannot re-establish them.
- `reject`: supply an owner note and remove the `item` object. Rejection alone does not require physical-inventory confirmation or photo bytes.

An accepted declaration might look like this **illustrative owner entry**, not a model-established fact:

```json
{
  "proposalId": "proposal-1",
  "action": "add",
  "ownerNote": "I checked the actual tool, counted one, and inspected its gripping function.",
  "item": {
    "id": "desk-clamp",
    "name": "My desk clamp",
    "kind": "tool",
    "quantity": 1,
    "available": true,
    "capabilities": ["clamp"],
    "notes": "Fit and gripping force for a particular assembly still need inspection."
  }
}
```

Set the review's `confirmedPhysicalInventory` to `true` only after confirming its accepted declarations. Any `dimensions` must be your own measured values in millimetres; they are not inferred from pixels. Do not insert `evidence` or `testedCapabilities` into the declaration; the review contract rejects those fields.

```sh
npm run workbench -- scan-review --file .scrapmind/photo-review.json
npm run workbench -- plan
npm run workbench -- ideate --goal "Find useful new uses for these parts" --count 3
```

Accepted items enter as **owner-declared** with no tested capabilities. A later [camera capability trial](DEVICE-TRIALS.md) is a separate operation. Accepting a photo declaration cannot establish compatibility, load ratings, electrical suitability, working condition, or a physical trial.

The review file includes the inventory fingerprint current when the template was generated. If inventory changes while you review it, regenerate the template and check your decisions against the current inventory. This does not require another model call. Previously resolved proposals cannot be accepted again. New inventory declarations make earlier builds stale and require new plans/builds; prior results and source observations remain stored.

## Photo evidence and portability

```sh
npm run workbench -- report
npm run workbench -- bundle --output my-photo-workbench.json
npm run workbench -- audit --bundle my-photo-workbench.json
npm run workbench -- import --bundle my-photo-workbench.json --workspace restored-photo-lab
```

The bundle includes scan suggestions, original source images, and owner resolution snapshots. Missing or altered photo bytes stop export. Accepting suggestions also requires the matching source bytes. Image checksums establish matching bytes, not scene authenticity or correct model interpretation. Scan photos are bound to observations; they cannot be reused as current-build capture evidence.

Metadata-only workspace exports contain photo records without the images. Workspaces without the optional `inventoryScans` field remain readable without adding that field. Older alpha readers may reject workspaces containing newer scan fields; use the current reader for these bundles. Reports distinguish unresolved suggestions and matching/missing/changed/unreadable images.

## Bounds and model limitations

- PNG or JPEG input, no more than 6 MB and 24 megapixels. Source headers, dimensions, MIME, canonical base64 and checksums are checked; the Node CLI does not implement full image decoding. The browser import library provides decoding before use.
- Up to 30 candidates per photo, 100 scans per workspace, and 250 inventory items. The usual workspace/evidence-bundle byte bounds still apply. Source images count toward the bundle's 20 MB image budget.
- One model call plus at most one syntax/schema repair: 90 seconds per call, 180 seconds per operation. The model response is bounded before parsing. A failed operation does not mutate inventory or save partial observations.
- Image regions are approximate normalized locations, not manufacturing coordinates or physical measurements. Orientation, occlusion, overlapping objects, ambiguous functions, and approximate counts need owner review.

OpenAI's [vision guide](https://developers.openai.com/api/docs/guides/images-vision) describes data-URL image input and limitations in counting and precise spatial localization. This workflow treats such output as suggestions; it does not turn those limitations into purported certainty.

Validation uses explicit synthetic responses, synthetic images, owner-policy simulations, and real Chromium APIs with a synthetic camera. A local HTTP fixture exercises scan → owner review → inventory → report → bundle → restore. That is protocol/storage evidence, not image-recognition performance. The local server's installed `llama3.2:3b` and `qwen2:0.5b` report completion capabilities without vision; no photo was sent to them, and no live vision-model or physical workshop trial was run.
