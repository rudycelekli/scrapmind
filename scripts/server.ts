import { createApi } from './api.js';
import { configuredProvider } from './provider-config.js';
const port = Number(process.env.SCRAPMIND_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('SCRAPMIND_PORT must be an integer from 1 to 65535.');
const server = createApi(configuredProvider());
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
