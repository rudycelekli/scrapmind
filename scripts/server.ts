import { createApi } from './api.js';
const baseUrl = process.env.SCRAPMIND_AI_BASE_URL,
  model = process.env.SCRAPMIND_AI_MODEL;
const port = Number(process.env.SCRAPMIND_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('SCRAPMIND_PORT must be an integer from 1 to 65535.');
const server = createApi(
  baseUrl && model
    ? {
        baseUrl,
        model,
        apiKey: process.env.SCRAPMIND_AI_KEY,
        format: process.env.SCRAPMIND_AI_FORMAT === 'json_object' ? 'json_object' : 'json_schema',
      }
    : undefined,
);
server.listen(port, '127.0.0.1', () =>
  console.log(`SCRAPMIND local API: http://127.0.0.1:${port}/api/status`),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
const shutdown = () => {
  server.close();
  server.closeIdleConnections();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
