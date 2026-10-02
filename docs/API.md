# Local API

Start with `npm run serve`. Default address: `http://127.0.0.1:4317`. Set `SCRAPMIND_PORT` to use another port.

| Route          | Method | Purpose                                                                   |
| -------------- | ------ | ------------------------------------------------------------------------- |
| `/api/status`  | GET    | Version and configured model availability; never includes a key           |
| `/api/recipes` | GET    | Starter recipe catalog                                                    |
| `/api/plan`    | POST   | Validate inventory and return constrained plans                           |
| `/api/invent`  | POST   | Explicitly request and validate a model proposal                          |
| `/api/ideate`  | POST   | Generate, allocate, critique, and attempt repair of up to three AI drafts |

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

Provider configuration supports `SCRAPMIND_AI_REVIEW_MODEL`, `SCRAPMIND_AI_PROFILE`, and `SCRAPMIND_AI_MAX_OUTPUT_TOKENS` in addition to the existing settings. See [AI configuration and limits](AI.md).

The API is a local development interface, not a public multi-user service. Authentication, multi-user storage, remote deployment, and device pairing are separate roadmap work.
