// window.api: the bridge between the React UI and the Tauri shell (src-tauri/). Imported first in main.jsx.
// HTTP, links and notifications use Tauri plugins; updates are handled in Rust (src-tauri/src/updater.rs).
(() => {
  const T = window.__TAURI__;
  if (!T) return;

  const UA = 'MySportsHub/1 (personal sports tracker)';
  const ALLOWED_HOSTS = new Set(['site.api.espn.com', 'site.web.api.espn.com', 'sports.core.api.espn.com', 'api.squiggle.com.au']);
  const win = T.window.getCurrentWindow();

  // ---------- HTTP (allow-listed hosts, also enforced in src-tauri/capabilities/default.json; 4 s request cache) ----------
  const cache = new Map();
  const CACHE_MS = 4000;

  async function fetchJson(url, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await T.http.fetch(url, { signal: controller.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function get(url) {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch {
      return Promise.reject(new Error('Invalid URL'));
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
      return Promise.reject(new Error(`Blocked host: ${parsed.hostname}`));
    }
    const key = parsed.href;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_MS) return hit.promise;
    const promise = fetchJson(key, { Accept: 'application/json', 'User-Agent': UA });
    cache.set(key, { t: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 300) {
      const cutoff = Date.now() - CACHE_MS;
      for (const [k, v] of cache) if (v.t < cutoff) cache.delete(k);
    }
    return promise;
  }

  // ---------- links open in the default browser ----------
  function openExternal(url) {
    const u = String(url);
    if (/^https?:\/\//i.test(u)) return T.opener.openUrl(u).catch(() => {});
    return Promise.resolve();
  }
  window.open = (url) => {
    openExternal(url);
    return null;
  };
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.href;
      if (/^https?:\/\//i.test(href) && !href.startsWith(location.origin)) {
        e.preventDefault();
        openExternal(href);
      }
    },
    true
  );

  // ---------- notifications: route the web Notification API to native Windows toasts ----------
  class TauriNotification {
    constructor(title, opts = {}) {
      this.title = title;
      this.body = opts.body || '';
      this.onclick = null;
      try {
        T.notification.sendNotification({ title: String(title), body: this.body });
      } catch {
        /* ignore */
      }
    }
    close() {}
    static requestPermission() {
      return T.notification.requestPermission().then((p) => (TauriNotification.permission = p));
    }
  }
  TauriNotification.permission = 'granted'; // Windows desktop apps don't need a prompt
  T.notification
    .isPermissionGranted()
    .then((ok) => (TauriNotification.permission = ok ? 'granted' : 'default'))
    .catch(() => {});
  window.Notification = TauriNotification;

  // ---------- taskbar flash ----------
  async function flash() {
    try {
      if (!(await win.isFocused())) await win.requestUserAttention(2); // 2 = informational
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('focus', () => win.requestUserAttention(null).catch(() => {}));

  // ---------- updates: checked and installed by the Rust side (src-tauri/src/updater.rs) ----------
  const invoke = (cmd) => T.core.invoke(cmd);
  const checkForUpdates = () => invoke('check_for_updates').catch((e) => ({ status: 'error', message: String((e && e.message) || e) }));

  window.api = {
    platform: 'tauri', // native title bar, so the UI doesn't reserve space for caption buttons
    get,
    openExternal,
    version: () => T.app.getVersion(),
    setTheme: (theme) => {
      win.setTheme(theme === 'light' ? 'light' : 'dark').catch(() => {});
    },
    flash,
    updateNotice: () => invoke('update_notice'), // banner for the portable exe when a newer version exists
    checkForUpdates,
    restartToUpdate: () => invoke('restart_to_update'), // relaunch; the launch check then installs the update
  };
})();
