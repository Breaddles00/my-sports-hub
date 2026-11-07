// Tauri build only: provides the same window.api bridge that electron/preload.js gives the
// React UI in the Electron build, so nothing in src/ has to change. Loaded before app.js.
(() => {
  const T = window.__TAURI__;
  if (!T) return;

  const OWNER = 'Breaddles00';
  const REPO = 'my-sports-hub';
  const UA = 'MySportsHub-Tauri/0.1 (personal sports tracker)';
  const ALLOWED_HOSTS = new Set(['site.api.espn.com', 'site.web.api.espn.com', 'sports.core.api.espn.com', 'api.squiggle.com.au']);
  const win = T.window.getCurrentWindow();

  // ---------- HTTP (same allow-list and 4 s request cache as electron/main.js) ----------
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

  // ---------- updates: no auto-install in the test build, just point to the newest Tauri release ----------
  const cmp = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
  };
  async function checkForUpdates() {
    try {
      const list = await fetchJson(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=30`, {
        Accept: 'application/vnd.github+json',
        'User-Agent': UA,
      });
      const rel = list.find((r) => !r.draft && /^tauri-v\d+\.\d+\.\d+$/.test(r.tag_name));
      const current = await T.app.getVersion();
      if (rel && cmp(rel.tag_name.slice(7), current) > 0) {
        return { status: 'available', version: rel.tag_name.slice(7), url: rel.html_url, canRestart: false };
      }
      return { status: 'current' };
    } catch (e) {
      return { status: 'error', message: (e && e.message) || String(e) };
    }
  }

  window.api = {
    platform: 'tauri', // native title bar, so the UI doesn't reserve space for caption buttons
    get,
    openExternal,
    version: () => T.app.getVersion(),
    setTheme: (theme) => {
      win.setTheme(theme === 'light' ? 'light' : 'dark').catch(() => {});
    },
    flash,
    updateNotice: () => Promise.resolve(null),
    checkForUpdates,
    restartToUpdate: () => Promise.resolve(),
  };
})();
