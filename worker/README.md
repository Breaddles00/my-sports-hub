# Optional data proxy for the web version

The web version (https://breaddles00.github.io/my-sports-hub/) loads scores straight from ESPN and Squiggle in the browser. This folder is only needed if those sites start refusing browser requests. You'd see "Network error: offline, or site.api.espn.com refused the request" everywhere, even though you're online.

`proxy.js` is a tiny Cloudflare Worker. It forwards requests to the four hosts the app uses and refuses everything else. Cloudflare's free plan covers it many times over.

## Setup (about 5 minutes)

1. Create a free account at https://dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Worker**. Name it `my-sports-hub-proxy` and click **Deploy**.
3. Click **Edit code**, replace everything with the contents of `proxy.js`, and click **Deploy**.
4. Copy the worker's address, e.g. `https://my-sports-hub-proxy.<your-name>.workers.dev`.
5. On GitHub, open the repo's **Settings → Secrets and variables → Actions → Variables** tab and add a variable named `PROXY_URL` with that address.
6. Go to **Actions → Publish web version → Run workflow**.

After that, the site tries ESPN directly first and falls back to the proxy for any host that refuses.

With Node installed, `npx wrangler deploy` from this folder does steps 2–3 instead.
