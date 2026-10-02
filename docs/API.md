# Local API

Start with `npm run serve`. Default address: `http://127.0.0.1:4317`. Set `SCRAPMIND_PORT` to use another port.

| Route          | Method | Purpose                                                         |
| -------------- | ------ | --------------------------------------------------------------- |
| `/api/status`  | GET    | Version and configured model availability; never includes a key |
| `/api/recipes` | GET    | Starter recipe catalog                                          |
| `/api/plan`    | POST   | Validate inventory and return constrained plans                 |
| `/api/invent`  | POST   | Explicitly request and validate a model proposal                |

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

The default installation returns HTTP 503 without contacting a model. Invalid requests or proposals return HTTP 400. Concurrent model requests return HTTP 429. API keys are not returned to clients or written into proposal output.

The API is a local development interface, not a public multi-user service. Authentication, multi-user storage, remote deployment, and device pairing are separate roadmap work.
