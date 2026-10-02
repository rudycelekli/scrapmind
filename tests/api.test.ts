import { afterEach, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApi } from '../scripts/api.js';
import { demoInventory } from '../core/fixtures.js';
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
async function start() {
  const server = createApi();
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
