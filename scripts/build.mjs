// Bundles the React UI (src/) into dist/ using esbuild. Tauri loads dist/ (see src-tauri/tauri.conf.json).
import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

mkdirSync(dist, { recursive: true });
copyFileSync(join(root, 'src', 'index.html'), join(dist, 'index.html'));
// Launch splash ("Checking for updates…"), opened by src-tauri/src/updater.rs before the main window.
copyFileSync(join(root, 'src', 'splash.html'), join(dist, 'splash.html'));
copyFileSync(join(root, 'src', 'splash.js'), join(dist, 'splash.js'));
copyFileSync(join(root, 'src-tauri', 'icons', 'icon.png'), join(dist, 'icon.png'));

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
