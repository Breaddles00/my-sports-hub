// window.api for the web version (GitHub Pages). Imported first in main-web.jsx instead of tauri-api.js.
// Same shape as the Tauri bridge, so nothing else in src/ needs to know which one it's running in.
//
// Data: requests go straight from the browser to ESPN / Squiggle. If a host refuses that (CORS),
// and the build was given a proxy (MSH_PROXY_URL, see worker/), they go through the proxy instead.
(() => {
  if (window.api) return;

  /* global __PROXY_URL__, __BUILD__ */
  const PROXY = typeof __PROXY_URL__ === 'string' ? __PROXY_URL__.replace(/\/+$/, '') : '';
  const BUILD = typeof __BUILD__ === 'object' && __BUILD__ ? __BUILD__ : { version: 'dev', sha: '', date: '' };
  const ALLOWED_HOSTS = new Set(['site.api.espn.com', 'site.web.api.espn.com', 'sports.core.api.espn.com', 'api.squiggle.com.au']);

  // ---------- HTTP (allow-listed hosts; 4 s request cache, like the desktop app) ----------
  const cache = new Map();
  const CACHE_MS = 4000;
  // Per host: 'direct' once a direct request has worked, 'proxy' once one has been refused.
  const route = {};
  try {
    Object.assign(route, JSON.parse(sessionStorage.getItem('sportshub.route') || '{}'));
  } catch {
    /* ignore */
  }
  const saveRoute = () => {
    try {
      sessionStorage.setItem('sportshub.route', JSON.stringify(route));
    } catch {
      /* ignore */
    }
  };

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      // Only CORS-safelisted headers, so the browser sends a simple request (no preflight).
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.http = true;
        throw err;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function load(parsed) {
    const host = parsed.hostname;
    const viaProxy = () => fetchJson(`${PROXY}/?url=${encodeURIComponent(parsed.href)}`);
    if (PROXY && route[host] === 'proxy') return viaProxy();
    try {
      const data = await fetchJson(parsed.href);
      if (route[host] !== 'direct') {
        route[host] = 'direct';
        saveRoute();
      }
      return data;
    } catch (e) {
      // A CORS refusal shows up as a TypeError with no status. HTTP errors and timeouts are real failures.
      const blocked = !e.http && e.name !== 'AbortError';
      if (!blocked || !PROXY || route[host] === 'direct') {
        if (blocked && route[host] !== 'direct') throw new Error(`Network error: offline, or ${host} refused the request`);
        throw e;
      }
      const data = await viaProxy();
      route[host] = 'proxy';
      saveRoute();
      return data;
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
    const promise = load(parsed);
    cache.set(key, { t: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 300) {
      const cutoff = Date.now() - CACHE_MS;
      for (const [k, v] of cache) if (v.t < cutoff) cache.delete(k);
    }
    return promise;
  }

  // ---------- links open in a new tab ----------
  function openExternal(url) {
    const u = String(url);
    if (/^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener');
    return Promise.resolve();
  }

  // ---------- service worker (offline shell, home-screen install, notifications on phones) ----------
  let swReg = null;
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => (swReg = reg))
        .catch(() => {});
    });
  }

  // Phones (Android Chrome, iOS home-screen apps) only allow notifications through the service worker,
  // so route `new Notification()` there when it's available.
  const NativeNotification = window.Notification;
  if (NativeNotification) {
    class WebNotification {
      constructor(title, opts = {}) {
        this.title = title;
        this.body = opts.body || '';
        this.onclick = null;
        const options = { body: this.body, icon: opts.icon || 'icons/icon-192.png', badge: 'icons/icon-192.png' };
        const fallback = () => {
          try {
            const n = new NativeNotification(title, options);
            n.onclick = () => {
              window.focus();
              this.onclick?.();
            };
          } catch {
            /* ignore */
          }
        };
        if (swReg?.showNotification) swReg.showNotification(String(title), options).catch(fallback);
        else fallback();
      }
      close() {}
      static get permission() {
        return NativeNotification.permission;
      }
      static requestPermission(cb) {
        return NativeNotification.requestPermission(cb);
      }
    }
    window.Notification = WebNotification;
  }

  // ---------- theme: browser chrome colour follows the app theme ----------
  function setTheme(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f3f5f9' : '#0b0f17');
  }

  document.documentElement.dataset.platform = 'web';
  const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

  window.api = {
    platform: 'web',
    get,
    openExternal,
    version: () => Promise.resolve(BUILD.version),
    build: BUILD,
    standalone,
    hasProxy: !!PROXY,
    setTheme,
    flash: () => {},
    updateNotice: () => Promise.resolve(null), // a web page is always the latest version
    checkForUpdates: () => Promise.resolve({ status: 'current' }),
    restartToUpdate: () => location.reload(),
  };
})();
