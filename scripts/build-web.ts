import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}dist/web`;
await mkdir(output, { recursive: true });
const licenses = await Promise.all([
  readFile(`${root}LICENSE`, 'utf8'),
  readFile(`${root}node_modules/zod/LICENSE`, 'utf8'),
  readFile(`${root}node_modules/esbuild/LICENSE.md`, 'utf8'),
]);
await build({
  entryPoints: [`${root}web/main.ts`],
  outfile: `${output}/app.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  legalComments: 'inline',
  banner: { js: `/*! SCRAPMIND and bundled code notices\n${licenses.join('\n\n')}\n*/` },
});
await copyFile(`${root}web/index.html`, `${output}/index.html`);
await copyFile(`${root}web/style.css`, `${output}/style.css`);
