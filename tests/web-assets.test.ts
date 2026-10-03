import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type Server } from 'node:http';
import { createApi } from '../scripts/api.js';

const servers: Server[] = [];
const directories: string[] = [];
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
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
it('serves only known built assets after loopback and origin checks, with a restrictive browser policy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scrapmind-public-assets-'));
  directories.push(directory);
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Public workbench</title>');
  await writeFile(join(directory, 'private.json'), 'must not be served');
  const server = createApi(undefined, fetch, { webDirectory: directory });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const url = `http://127.0.0.1:${address.port}`;
  const page = await fetch(url);
  expect(page.status).toBe(200);
  expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect(page.headers.get('content-security-policy')).not.toContain('unsafe-inline');
  expect(page.headers.get('permissions-policy')).toContain('microphone=()');
  expect(await page.text()).toContain('Public workbench');
  expect((await fetch(`${url}/private.json`)).status).toBe(404);
  expect((await fetch(`${url}/app.js`)).status).toBe(503);
  expect((await fetch(url, { headers: { Origin: 'https://unrelated.example' } })).status).toBe(403);
  const denied = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(url, { headers: { Host: 'unrelated.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  expect(denied).toBe(403);
});
