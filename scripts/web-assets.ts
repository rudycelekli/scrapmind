import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';

const assets: Record<string, { name: string; type: string }> = {
  '/': { name: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { name: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { name: 'style.css', type: 'text/css; charset=utf-8' },
};
/** Serve only the three known build assets, after the API's loopback/origin checks. */
export async function serveWebAsset(
  path: string,
  directory: string,
  response: ServerResponse,
): Promise<boolean> {
  const asset = assets[path];
  if (!asset) return false;
  try {
    const bytes = await readFile(resolve(directory, asset.name));
    response.writeHead(200, {
      'Content-Type': asset.type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    });
    response.end(bytes);
  } catch {
    response.writeHead(503, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end('Build the visual workbench with npm run build, then restart npm run serve.');
  }
  return true;
}
