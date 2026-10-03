# Local API

Start with `npm run serve`. Default address: `http://127.0.0.1:4317`. Set `SCRAPMIND_PORT` to use another port.

| Route          | Method | Purpose                                                                       |
| -------------- | ------ | ----------------------------------------------------------------------------- |
| `/api/status`  | GET    | Version and configured model availability; never includes a key               |
| `/api/recipes` | GET    | Starter recipe catalog                                                        |
| `/api/plan`    | POST   | Validate inventory and return constrained plans                               |
| `/api/invent`  | POST   | Explicitly request and validate a model proposal                              |
| `/api/ideate`  | POST   | Generate, allocate, critique, and attempt repair of up to three AI drafts     |
| `/api/scan`    | POST   | Explicitly request photo inventory suggestions from a configured vision model |

POST requests require `Content-Type: application/json` and `X-Scrapmind-Request: 1`. Requests from unrelated browser origins are rejected. The server stores no inventory. The invention route requires explicit environment configuration and accepts at most one active inference request.

## Plan

```json
{
  "inventory": [],
  "goal": "scan a document"
}
```

An optional `recipes` array substitutes a validated custom catalog. Plans include allocations, missing roles, used-but-untested capabilities, and fingerprints for stale-build checking. `ready` means required inventory roles are allocated. It does not mean physically built or verified.

## Invent

```json
{
  "inventory": [],
  "goal": "Make a small useful desk accessory"
}
```

An optional `image` accepts a JPEG, PNG, or WebP base64 data URL for a vision-capable configured model. Image dimensions and capabilities remain unestablished unless entered in inventory. The current adapter proposes a recipe; it does not implement automatic inventory extraction.

The response contains `recipe`, `plan`, `model`, `mode` (`local` or `remote`), `attempts`, and `reviewed: false`. One explicit invention request may make up to two model calls: the second repairs a proposal that failed syntax or schema validation. There are no hidden unlimited retries. JSON-schema output is the default; set `SCRAPMIND_AI_FORMAT=json_object` for a provider that only supports plain JSON output.

The default installation returns HTTP 503 without contacting a model. Invalid requests or proposals return HTTP 400. Concurrent model requests return HTTP 429 across both invention routes. API keys are not returned to clients or written into proposal output.

## AI portfolio

```json
{
  "inventory": [],
  "goal": "Find useful inspection tools from my spare devices",
  "count": 3,
  "avoid": ["Document scanner"]
}
```

`count` is 1–3, default 3. `avoid` contains up to 30 titles; an optional image uses the same data-URL contract as `/api/invent`. The response includes proposals with compiled draft recipes, plans, reasoning, assumptions, inventory coverage, resource-review states/issues, and model provenance. Ranking considers resource-review state before declared inventory coverage. Novelty and physical success remain unverified.

Each explicit operation makes at most five model calls, with a 240-second operation timeout and 90 seconds per call. Failed critique is reported as `not-completed`, never clean. The response contains `calls`, generation `attempts`, `repairAttempted`, and `repairApplied`. The API returns proposals; it does not persist them. The saved CLI workbench checks inventory revision before storing its results.

Provider configuration supports `SCRAPMIND_AI_REVIEW_MODEL`, `SCRAPMIND_AI_PROFILE`, `SCRAPMIND_AI_REASONING_EFFORT`, and `SCRAPMIND_AI_MAX_OUTPUT_TOKENS` in addition to the existing settings. Status reports configured effort or `provider-default`; that is configuration, not a measured capability. See [AI configuration and limits](AI.md).

The visual workbench is served at `/` when starting `npm run serve`. Only its three built public assets are exposed, with restrictive browser policies after loopback and Origin checks. Client disconnection aborts active model dispatch and prevents subsequent dispatch; already sent provider calls may have been processed. The API is a single-owner loopback interface, not a public multi-user service. Authentication, multi-user storage, remote deployment, and device pairing are separate roadmap work.

## Inventory photo observations

```json
{
  "inventory": [],
  "image": "data:image/png;base64,..."
}
```

`image` must contain actual supported PNG/JPEG bytes, bounded to 6 MB and 24 megapixels. Placeholder data above is not valid input. This operation requires `SCRAPMIND_AI_VISION_MODEL`; otherwise it returns HTTP 503 without contacting a provider. Vision, portfolio, and legacy invention operations share the single active-model slot. Normal Host, Origin, JSON-header, and 9 MB request-body restrictions apply.

The response is a scan record with tentative object/count/function suggestions, optional approximate normalized regions, uncertainties, possible existing-item IDs, and a checksum-bound source-photo record. Image bytes and data URLs are not echoed. The API stores neither images nor inventory. The caller retains the source bytes; the CLI stores them locally only after validating the scan and input revision. Existing-item suggestions never update counts automatically.

Each operation makes at most two model calls, with one syntax/schema repair, a 180-second operation timeout, and 90 seconds per call. Successful protocol validation does not establish recognition accuracy, dimensions, working capabilities, or physical compatibility. Owner declarations are applied through the saved workbench, not this read-only API. See [photo review and evidence rules](INVENTORY-PHOTOS.md).
