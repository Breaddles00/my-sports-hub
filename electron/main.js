// My Sports Hub — Electron main process
const { app, BrowserWindow, ipcMain, net, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

const APP_ID = 'com.mysportshub.desktop';

// Only these hosts can be requested by the UI (all data requests go through the main process,
// which avoids browser CORS limits and keeps the renderer sandboxed).
const ALLOWED_HOSTS = new Set([
  'site.api.espn.com',
  'site.web.api.espn.com',
  'sports.core.api.espn.com',
  'api.squiggle.com.au',
]);

const isWin = process.platform === 'win32';
let mainWindow = null;

// ---------- window state ----------
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return { width: 1440, height: 900, maximized: false };
  }
}
function saveWindowState(win) {
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(statePath(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch {
    /* ignore */
  }
}

// ---------- HTTP bridge ----------
const cache = new Map(); // url -> { t, promise }
const CACHE_MS = 4000;

async function httpGet(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Blocked host: ${parsed.hostname}`);
  }

  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.promise;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await net.fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          // Squiggle asks API users to identify their app in the User-Agent.
          'User-Agent': 'MySportsHub-Desktop/1.0 (personal sports tracker)',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  })();

  cache.set(url, { t: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  if (cache.size > 300) {
    const cutoff = Date.now() - CACHE_MS;
    for (const [k, v] of cache) if (v.t < cutoff) cache.delete(k);
  }
  return promise;
}

ipcMain.handle('http:get', (_e, url) => httpGet(String(url)));
ipcMain.handle('shell:open', (_e, url) => {
  const u = String(url);
  if (/^https?:\/\//i.test(u)) shell.openExternal(u);
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:notice', () => updater.getNotice());
ipcMain.handle('update:check', () => updater.manualCheck());
ipcMain.handle('update:restart', () => updater.restartToUpdate());
ipcMain.on('theme:set', (_e, theme) => {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
  if (mainWindow && isWin) {
    try {
      mainWindow.setTitleBarOverlay(
        theme === 'light'
          ? { color: '#f3f5f9', symbolColor: '#1f2937', height: 40 }
          : { color: '#0b0f17', symbolColor: '#cbd5e1', height: 40 }
      );
    } catch {
      /* older Electron */
    }
  }
});
ipcMain.on('window:flash', () => {
  if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
});

// ---------- window ----------
function createWindow(splash) {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width || 1440,
    height: state.height || 900,
    x: state.x,
    y: state.y,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0f17',
    title: 'My Sports Hub',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    ...(isWin
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: { color: '#0b0f17', symbolColor: '#cbd5e1', height: 40 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splash) splash.close();
  });
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('focus', () => mainWindow.flashFrame(false));

  // Any link that tries to open a new window goes to the default browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Keyboard: F12 / Ctrl+Shift+I = devtools, Ctrl+R = reload UI
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// ---------- shortcuts (used by "Setup My Sports Hub.bat" when running without the installer) ----------
function createShortcuts() {
  const appDir = app.getAppPath();
  const opts = {
    target: process.execPath,
    args: `"${appDir}"`,
    cwd: appDir,
    icon: path.join(appDir, 'build', 'icon.ico'),
    iconIndex: 0,
    appUserModelId: APP_ID,
    description: 'Live scores, schedules and stats',
  };
  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'My Sports Hub.lnk');
  const desktop = path.join(app.getPath('desktop'), 'My Sports Hub.lnk');
  const ok = [startMenu, desktop].map((p) => shell.writeShortcutLink(p, 'create', opts) || shell.writeShortcutLink(p, 'replace', opts));
  console.log(`Start Menu shortcut: ${ok[0] ? 'created' : 'failed'}\nDesktop shortcut: ${ok[1] ? 'created' : 'failed'}`);
}

// ---------- lifecycle ----------
if (isWin && process.argv.includes('--create-shortcuts')) {
  app.whenReady().then(() => {
    createShortcuts();
    app.quit();
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  if (isWin) app.setAppUserModelId(APP_ID); // needed for Windows toast notifications
  Menu.setApplicationMenu(null);

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    let splash = null;
    try {
      splash = await updater.runStartupUpdate(); // may install an update and relaunch instead of returning
    } catch {
      /* never block launch */
    }
    createWindow(splash);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
