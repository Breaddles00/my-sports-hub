// Bundles the React UI (src/) using esbuild.
//   node scripts/build.mjs          → dist/      for the Tauri app (see src-tauri/tauri.conf.json)
//   node scripts/build.mjs --web    → dist-web/  for the website (GitHub Pages, .github/workflows/web.yml)
// The web build reads MSH_PROXY_URL (optional, see worker/) and GITHUB_SHA from the environment.
import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const web = process.argv.includes('--web');
const dist = join(root, web ? 'dist-web' : 'dist');

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.css': 'css' },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

let options;
if (!web) {
  mkdirSync(dist, { recursive: true });
  copyFileSync(join(root, 'src', 'index.html'), join(dist, 'index.html'));
  // Launch splash ("Checking for updates…"), opened by src-tauri/src/updater.rs before the main window.
  copyFileSync(join(root, 'src', 'splash.html'), join(dist, 'splash.html'));
  copyFileSync(join(root, 'src', 'splash.js'), join(dist, 'splash.js'));
  copyFileSync(join(root, 'src-tauri', 'icons', 'icon.png'), join(dist, 'icon.png'));

  options = {
    ...common,
    entryPoints: [join(root, 'src', 'main.jsx')],
    outfile: join(dist, 'app.js'),
    target: ['chrome120'],
    define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  };
} else {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, 'icons'), { recursive: true });

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
  const now = new Date();
  const buildId = sha || now.getTime().toString(36);
  const build = {
    version: `${pkg.version.split('.').slice(0, 2).join('.')}-web`,
    sha,
    date: now.toISOString(),
  };

  let proxy = (process.env.MSH_PROXY_URL || '').trim().replace(/\/+$/, '');
  if (proxy && !/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(proxy)) {
    console.warn(`Ignoring MSH_PROXY_URL (must be an https URL): ${proxy}`);
    proxy = '';
  }
  const hosts = ['https://site.api.espn.com', 'https://site.web.api.espn.com', 'https://sports.core.api.espn.com', 'https://api.squiggle.com.au'];
  if (proxy) hosts.push(new URL(proxy).origin);

  const fill = (text) => text.replaceAll('%BUILD_ID%', buildId).replaceAll('%CONNECT_SRC%', hosts.join(' '));
  const webSrc = join(root, 'src', 'web');
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) {
    writeFileSync(join(dist, f), fill(readFileSync(join(webSrc, f), 'utf8')));
  }
  for (const f of readdirSync(join(webSrc, 'icons'))) copyFileSync(join(webSrc, 'icons', f), join(dist, 'icons', f));
  writeFileSync(join(dist, '.nojekyll'), ''); // GitHub Pages: serve files as-is
  console.log(`Web build ${build.version} (${buildId})${proxy ? `, proxy ${proxy}` : ', no proxy'}`);

  options = {
    ...common,
    entryPoints: [join(root, 'src', 'main-web.jsx')],
    outfile: join(dist, 'app.js'),
    // Phones: iOS 16+ Safari and recent Android Chrome.
    target: ['chrome110', 'safari16', 'firefox115'],
    define: {
      'process.env.NODE_ENV': watch ? '"development"' : '"production"',
      __PROXY_URL__: JSON.stringify(proxy),
      __BUILD__: JSON.stringify(build),
    },
  };
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await esbuild.build(options);
}
