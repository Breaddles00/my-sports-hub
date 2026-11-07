// Launch-time updater for My Sports Hub.
//
// Every push to GitHub (Breaddles00/my-sports-hub) builds a new numbered Release via GitHub Actions.
// On launch the app checks for a newer version *before* opening the main window:
//
//   • Installed app (from the Setup .exe) → downloads the new installer from GitHub Releases,
//     installs it silently and relaunches (electron-updater).
//   • Running from a git clone of the repo  → `git pull`, reinstalls packages if needed,
//     rebuilds the UI and relaunches.
//   • Portable .exe / copied folder           → can't replace itself, so the app shows an
//     "update available" banner with a download link.
//
// The check is quick: if GitHub can't be reached within a few seconds the app just opens.

const { app, BrowserWindow, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const OWNER = 'Breaddles00';
const REPO = 'my-sports-hub';
const CHECK_TIMEOUT_MS = 8000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

let notice = null; // shown in the app as a banner when we can't self-update

// ---------- helpers ----------
function withTimeout(promise, ms, label = 'timeout') {
  let t;
  return Promise.race([promise, new Promise((_, rej) => (t = setTimeout(() => rej(new Error(label)), ms)))]).finally(() => clearTimeout(t));
}

function cmpVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = '';
    let err = '';
    p.stdout?.on('data', (d) => (out += d));
    p.stderr?.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${cmd} exited ${code}`))));
  });
}

const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;
const appDir = () => app.getAppPath();
const isGitClone = () => !app.isPackaged && fs.existsSync(path.join(appDir(), '.git'));

function mode() {
  if (process.platform !== 'win32') return app.isPackaged ? 'release-check' : isGitClone() ? 'git' : 'release-check';
  if (app.isPackaged && !isPortable()) return 'installer';
  if (isGitClone()) return 'git';
  return 'release-check';
}

// ---------- splash window ----------
class Splash {
  constructor() {
    this.win = new BrowserWindow({
      width: 420,
      height: 260,
      frame: false,
      resizable: false,
      movable: true,
      show: false,
      center: true,
      skipTaskbar: false,
      backgroundColor: '#0b0f17',
      title: 'My Sports Hub',
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    this.ready = new Promise((r) => this.win.once('ready-to-show', r));
    this.win.loadFile(path.join(__dirname, 'splash.html'));
    this.ready.then(() => !this.win.isDestroyed() && this.win.show());
  }
  async set(status, percent = null, sub = '') {
    if (this.win.isDestroyed()) return;
    await this.ready;
    const js = `window.setStatus(${JSON.stringify(status)}, ${percent === null ? 'null' : Number(percent)}, ${JSON.stringify(sub)})`;
    this.win.webContents.executeJavaScript(js).catch(() => {});
  }
  close() {
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}

// ---------- strategies ----------
async function latestReleaseVersion() {
  const res = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MySportsHub-Updater' },
  });
  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const j = await res.json();
  return { version: String(j.tag_name || '').replace(/^v/, ''), url: j.html_url || RELEASES_URL };
}

async function checkRelease() {
  const latest = await withTimeout(latestReleaseVersion(), CHECK_TIMEOUT_MS, 'Update check timed out');
  if (latest?.version && cmpVersions(latest.version, app.getVersion()) > 0) return latest;
  return null;
}

/** Installed app: electron-updater pulls the new installer from GitHub Releases. */
async function updateInstalled(splash) {
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return; // module missing (shouldn't happen in a packaged build)
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  const result = await withTimeout(autoUpdater.checkForUpdates(), CHECK_TIMEOUT_MS, 'Update check timed out');
  const next = result?.updateInfo?.version;
  if (!next || cmpVersions(next, app.getVersion()) <= 0) return;

  await splash.set(`Downloading update v${next}…`, 0, `You have v${app.getVersion()}`);
  autoUpdater.on('download-progress', (p) => {
    const mb = (n) => (n / 1048576).toFixed(1);
    splash.set(`Downloading update v${next}…`, p.percent, `${mb(p.transferred)} of ${mb(p.total)} MB`);
  });
  await withTimeout(autoUpdater.downloadUpdate(), DOWNLOAD_TIMEOUT_MS, 'Download timed out');
  await splash.set(`Installing v${next}…`, 100, 'My Sports Hub will reopen in a moment');
  await new Promise((r) => setTimeout(r, 600));
  autoUpdater.quitAndInstall(true, true); // silent install, then relaunch
  await new Promise(() => {}); // never continue launching the old version
}

/** Running from a git clone: pull, rebuild, relaunch. */
async function updateGitClone(splash) {
  const cwd = appDir();
  const git = (...args) => run('git', args, { cwd });
  await withTimeout(git('fetch', '--quiet', 'origin'), CHECK_TIMEOUT_MS, 'Update check timed out');
  const local = await git('rev-parse', 'HEAD');
  let remote;
  try {
    remote = await git('rev-parse', '@{u}');
  } catch {
    return; // no upstream branch configured
  }
  if (local === remote) return;
  try {
    await git('merge-base', '--is-ancestor', 'HEAD', '@{u}');
  } catch {
    notice = { version: null, message: 'Your copy has local changes, so it was not auto-updated.', url: RELEASES_URL };
    return;
  }
  const changed = (await git('diff', '--name-only', 'HEAD', '@{u}')).split(/\r?\n/);
  const count = await git('rev-list', '--count', 'HEAD..@{u}');

  await splash.set('Downloading update…', 25, `${count} new change${count === '1' ? '' : 's'} on GitHub`);
  await git('pull', '--ff-only', '--quiet');

  if (changed.some((f) => /^package(-lock)?\.json$/.test(f))) {
    await splash.set('Updating packages…', 50, 'This can take a minute');
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd, shell: process.platform === 'win32' });
  }
  await splash.set('Rebuilding…', 80);
  await run(process.execPath, [path.join(cwd, 'scripts', 'build.mjs')], { cwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  await splash.set('Restarting…', 100);
  app.relaunch();
  app.exit(0);
  await new Promise(() => {});
}

/** Portable exe / copied folder: just tell the user. */
async function checkOnly() {
  const latest = await checkRelease();
  if (latest) notice = { version: latest.version, message: `Version ${latest.version} is available.`, url: latest.url };
}

// ---------- public API ----------
/** Runs before the main window opens. Resolves when the app should continue launching. */
async function runStartupUpdate() {
  if (process.argv.includes('--skip-update-check') || process.env.MSH_SKIP_UPDATE === '1') return;
  const splash = new Splash();
  const started = Date.now();
  try {
    await splash.set('Checking for updates…', null, `v${app.getVersion()}`);
    const m = mode();
    if (m === 'installer') await updateInstalled(splash);
    else if (m === 'git') await updateGitClone(splash);
    else await checkOnly();
    await splash.set('Up to date — starting…', null, `v${app.getVersion()}`);
  } catch (e) {
    // Offline, GitHub slow, etc. — never block the app from opening.
    await splash.set('Starting…', null, `Couldn't check for updates (${e.message})`);
    await new Promise((r) => setTimeout(r, 900));
  }
  const minShow = 700 - (Date.now() - started);
  if (minShow > 0) await new Promise((r) => setTimeout(r, minShow));
  return splash; // caller closes it once the main window is ready
}

/** "Check for updates" button in Settings. */
async function manualCheck() {
  try {
    const m = mode();
    if (m === 'git') {
      const cwd = appDir();
      await withTimeout(run('git', ['fetch', '--quiet', 'origin'], { cwd }), CHECK_TIMEOUT_MS, 'Timed out');
      const [a, b] = await Promise.all([run('git', ['rev-parse', 'HEAD'], { cwd }), run('git', ['rev-parse', '@{u}'], { cwd })]);
      return a === b ? { status: 'current', version: app.getVersion() } : { status: 'available', canRestart: true, message: 'New changes are on GitHub.' };
    }
    const latest = await checkRelease();
    if (!latest) return { status: 'current', version: app.getVersion() };
    return { status: 'available', version: latest.version, url: latest.url, canRestart: m === 'installer' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function restartToUpdate() {
  app.relaunch();
  app.exit(0);
}

module.exports = { runStartupUpdate, manualCheck, restartToUpdate, getNotice: () => notice, RELEASES_URL, cmpVersions };
