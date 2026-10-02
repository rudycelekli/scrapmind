import { afterEach, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApi } from '../scripts/api.js';
import { demoInventory } from '../core/fixtures.js';
import type { ProviderConfig } from '../core/inventor.js';
import { conceptFixture } from './ideation-fixture.js';
import { photoObservationFixture } from './inventory-scan-fixture.js';
import { photoDataUrl } from '../core/inventory-scan.js';
import { pngBlob } from './image-fixture.js';
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
async function start(config?: ProviderConfig, fetcher?: typeof fetch) {
  const server = createApi(config, fetcher);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return `http://127.0.0.1:${address.port}`;
}
it('provides real planning over the local API', async () => {
  const url = await start();
  const response = await fetch(`${url}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' },
    body: JSON.stringify({ inventory: demoInventory(), goal: 'document scanner' }),
  });
  expect(response.status).toBe(200);
  const plans = await response.json();
  expect(plans[0].recipe.id).toBe('document-scanner');
  expect(plans[0].status).toBe('ready');
});
it('rejects browser requests from unrelated origins', async () => {
  const url = await start();
  expect(
    (await fetch(`${url}/api/status`, { headers: { Origin: 'https://unrelated.example' } })).status,
  ).toBe(403);
});
it('does not invent a model when no provider is configured', async () => {
  const url = await start();
  const status = await (await fetch(`${url}/api/status`)).json();
  expect(status.model.enabled).toBe(false);
  const response = await fetch(`${url}/api/invent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' },
    body: '{}',
  });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('Nothing was sent');
  expect(
    (
      await fetch(`${url}/api/ideate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' },
        body: '{}',
      })
    ).status,
  ).toBe(503);
});

it('serves AI portfolios and serializes model operations across both invention routes', async () => {
  let release!: () => void, entered!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const active = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    if (calls === 1) {
      entered();
      await barrier;
    }
    const value = calls === 1 ? { concepts: [conceptFixture()] } : { issues: [] };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    );
  };
  const url = await start(
    { baseUrl: 'http://localhost/v1', model: 'synthetic-test', visionModel: 'synthetic-vision' },
    fetcher,
  );
  const headers = { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' };
  const request = fetch(`${url}/api/ideate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ inventory: demoInventory(), goal: 'compare shadows', count: 1 }),
  });
  await active;
  try {
    expect((await fetch(`${url}/api/invent`, { method: 'POST', headers, body: '{}' })).status).toBe(
      429,
    );
    expect((await fetch(`${url}/api/ideate`, { method: 'POST', headers, body: '{}' })).status).toBe(
      429,
    );
    expect((await fetch(`${url}/api/scan`, { method: 'POST', headers, body: '{}' })).status).toBe(
      429,
    );
  } finally {
    release();
  }
  const response = await request;
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.calls).toBe(2);
  expect(result.proposals[0].plan.status).toBe('draft');
  expect(result.proposals[0].resourceReview.status).toBe('no-issues-reported');
});
it('rejects malformed data and requests without the explicit API header', async () => {
  const url = await start();
  expect(
    (
      await fetch(`${url}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
  ).toBe(415);
  expect(
    (
      await fetch(`${url}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' },
        body: '{',
      })
    ).status,
  ).toBe(400);
});

it('keeps photo inference disabled until configured and returns observations without echoing image bytes', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe('synthetic-vision');
    expect(body.messages[1].content[1].image_url.url).toContain('data:image/png;base64,');
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(photoObservationFixture()) } }],
      }),
    );
  };
  const headers = { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' };
  const input = JSON.stringify({
    inventory: demoInventory(),
    image: await photoDataUrl(pngBlob()),
  });
  const textOnly = await start(
    { baseUrl: 'http://localhost/v1', model: 'synthetic-text' },
    fetcher,
  );
  expect(
    (await fetch(`${textOnly}/api/scan`, { method: 'POST', headers, body: input })).status,
  ).toBe(503);
  expect(calls).toBe(0);
  const url = await start(
    { baseUrl: 'http://localhost/v1', model: 'synthetic-text', visionModel: 'synthetic-vision' },
    fetcher,
  );
  const status = await (await fetch(`${url}/api/status`)).json();
  expect(status.model.vision).toMatchObject({ configured: true, name: 'synthetic-vision' });
  const response = await fetch(`${url}/api/scan`, { method: 'POST', headers, body: input });
  expect(response.status).toBe(200);
  const scan = await response.json();
  expect(scan.proposals).toHaveLength(2);
  expect(scan.resolutions).toEqual([]);
  expect(scan.artifact.source).toBe('imported-image');
  expect(scan.image).toBeUndefined();
  expect(JSON.stringify(scan)).not.toContain('data:image/');
  expect(calls).toBe(1);
  expect(
    (
      await fetch(`${url}/api/scan`, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://unrelated.example' },
        body: input,
      })
    ).status,
  ).toBe(403);
  expect(calls).toBe(1);
});
