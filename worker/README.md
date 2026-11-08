# Optional data proxy for the web version

The web version (https://breaddles00.github.io/my-sports-hub/) loads data straight from ESPN in the browser where ESPN allows it. As of November 2026 it allows scoreboards, news, standings, team schedules, rosters, injuries, game summaries and stats. It **refuses** these:

- team lists (`/teams`): the Teams tab and the bye strips
- team pages (`/teams/{id}`): the team drawer
- depth charts
- everything from Squiggle: AFL byes and the AFL ladder backup

Those show "… blocks this in the browser until the data proxy is set up" until this proxy is running.

`proxy.js` is a tiny Cloudflare Worker. It forwards requests to the four hosts the app uses and refuses everything else. Cloudflare's free plan covers it many times over. The site keeps loading directly everything ESPN allows, and only the refused endpoints go through the proxy.

## Setup (about 5 minutes)

1. Create a free account at https://dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Worker**. Name it `my-sports-hub-proxy` and click **Deploy**.
3. Click **Edit code**, replace everything with the contents of `proxy.js`, and click **Deploy**.
4. Copy the worker's address, e.g. `https://my-sports-hub-proxy.<your-name>.workers.dev`.
5. On GitHub, open the repo's **Settings → Secrets and variables → Actions → Variables** tab and add a variable named `PROXY_URL` with that address.
6. Go to **Actions → Publish web version → Run workflow**.

After that, the site tries ESPN directly first and switches to the proxy for any endpoint that refuses.

With Node installed, `npx wrangler deploy` from this folder does steps 2–3 instead.
