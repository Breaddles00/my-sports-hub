// Optional Cloudflare Worker for the web version of My Sports Hub.
// Only needed if ESPN or Squiggle stop allowing requests straight from the browser (CORS).
// Forwards GET /?url=<https URL> to the same hosts the desktop app is allowed to use, adds CORS
// headers for the site, and caches each response for a few seconds. Anything else is refused,
// so it can't be used as a general-purpose proxy. Setup: see worker/README.md.
const ALLOWED_HOSTS = new Set(['site.api.espn.com', 'site.web.api.espn.com', 'sports.core.api.espn.com', 'api.squiggle.com.au']);
const ALLOWED_ORIGINS = ['https://breaddles00.github.io', 'http://localhost:8765'];
const UA = 'MySportsHub/1 (personal sports tracker; https://github.com/Breaddles00/my-sports-hub)';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors(origin) });

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url') || '');
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors(origin) });
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
      return new Response('Host not allowed', { status: 403, headers: cors(origin) });
    }

    const upstream = await fetch(target.href, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
      cf: { cacheTtl: 10, cacheEverything: true },
    });
    const headers = new Headers(cors(origin));
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    headers.set('Cache-Control', 'public, max-age=5');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
