import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { invent, providerMode, type ProviderConfig } from '../core/inventor.js';
import { discoverPlans } from '../core/planner.js';
import { inventorySchema } from '../core/schema.js';
import { recipeSchema } from '../core/recipe-schema.js';
import { recipes } from '../core/recipes.js';
import { ideate } from '../core/ideation.js';
import { validateProvider } from '../core/model.js';
import { scanInventory } from '../core/inventory-scan.js';

function respond(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 9_000_000) throw new Error('Request body exceeds 9 MB.');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Loopback API. It does not expose inventory storage or device control. */
export function createApi(config?: ProviderConfig, fetcher: typeof fetch = fetch) {
  if (config) validateProvider(config);
  let inventing = false;
  return createServer(async (request, response) => {
    const host = request.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
      return respond(response, 403, { error: 'Use a loopback host.' });
    if (
      request.headers.origin &&
      ![`http://${host}`, `https://${host}`].includes(request.headers.origin)
    )
      return respond(response, 403, { error: 'Cross-origin API access is disabled.' });
    const path = request.url?.split('?')[0];
    if (request.method === 'GET' && path === '/api/status')
      return respond(response, 200, {
        version: '0.1.0-alpha.5',
        model: config
          ? {
              enabled: true,
              mode: providerMode(config),
              name: config.model,
              reviewModel: config.reviewModel ?? config.model,
              profile: config.profile ?? 'compatible',
              vision: config.visionModel
                ? { configured: true, name: config.visionModel }
                : { configured: false },
            }
          : { enabled: false },
      });
    if (request.method === 'GET' && path === '/api/recipes') return respond(response, 200, recipes);
    if (
      request.method !== 'POST' ||
      !['/api/plan', '/api/invent', '/api/ideate', '/api/scan'].includes(path ?? '')
    )
      return respond(response, 404, { error: 'Unknown API route.' });
    if (
      request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json' ||
      request.headers['x-scrapmind-request'] !== '1'
    )
      return respond(response, 415, {
        error: 'Send application/json with X-Scrapmind-Request: 1.',
      });
    if (path !== '/api/plan' && !config)
      return respond(response, 503, {
        error: 'No model configured. Nothing was sent to a provider.',
      });
    if (path === '/api/scan' && !config?.visionModel)
      return respond(response, 503, {
        error: 'No vision model configured. Nothing was sent to a provider.',
      });
    if (path !== '/api/plan' && inventing)
      return respond(response, 429, {
        error: 'An invention request is already running. Try again when it finishes.',
      });
    try {
      const input = await body(request);
      if (path === '/api/plan') {
        const parsed = z
          .object({
            inventory: inventorySchema,
            goal: z.string().max(1000).default(''),
            recipes: z.array(recipeSchema).max(30).optional(),
          })
          .strict()
          .parse(input);
        return respond(
          response,
          200,
          discoverPlans(parsed.inventory, parsed.goal, parsed.recipes ?? recipes),
        );
      }
      if (inventing)
        return respond(response, 429, {
          error: 'An invention request is already running. Try again when it finishes.',
        });
      inventing = true;
      try {
        respond(
          response,
          200,
          path === '/api/scan'
            ? (await scanInventory(input, config!, fetcher)).scan
            : path === '/api/ideate'
              ? await ideate(input, config!, fetcher)
              : await invent(input, config!, fetcher),
        );
      } finally {
        inventing = false;
      }
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? 'Input or model proposal does not match the SCRAPMIND contract.'
          : error instanceof SyntaxError
            ? 'Invalid JSON.'
            : error instanceof Error
              ? error.message
              : 'Request failed.';
      respond(response, 400, { error: message });
    }
  });
}
