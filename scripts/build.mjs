// Bundles the React UI (src/) into dist/ using esbuild.
// `--tauri` builds into dist-tauri/ instead, with the Tauri window.api shim and a CSP that allows Tauri's IPC.
import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauri = process.argv.includes('--tauri');
const dist = join(root, tauri ? 'dist-tauri' : 'dist');
const watch = process.argv.includes('--watch');

mkdirSync(dist, { recursive: true });
if (tauri) {
  // Data requests go through Tauri's HTTP plugin (IPC), not the page, so connect-src only needs the IPC endpoints.
  let html = readFileSync(join(root, 'src', 'index.html'), 'utf8');
  html = html.replace(/connect-src [^;]+;/, "connect-src 'self' ipc: http://ipc.localhost;");
  html = html.replace('<script src="app.js"></script>', '<script src="api-shim.js"></script>\n    <script src="app.js"></script>');
  if (!html.includes('api-shim.js') || !html.includes('ipc.localhost')) throw new Error('index.html changed: update the --tauri rewrite in scripts/build.mjs');
  writeFileSync(join(dist, 'index.html'), html);
  copyFileSync(join(root, 'tauri-shim', 'api-shim.js'), join(dist, 'api-shim.js'));
} else {
  copyFileSync(join(root, 'src', 'index.html'), join(dist, 'index.html'));
}

const options = {
  entryPoints: [join(root, 'src', 'main.jsx')],
  bundle: true,
  outfile: join(dist, 'app.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.css': 'css' },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await esbuild.build(options);
}
