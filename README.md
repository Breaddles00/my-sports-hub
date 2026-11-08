# My Sports Hub

A Windows 11 desktop app (React + [Tauri 2](https://v2.tauri.app)), also [on the web](https://breaddles00.github.io/my-sports-hub/), with live scores, schedules, standings, box scores, rosters and news for:

**NFL · NCAA Football (FBS) · MLB · NBA · NHL · AFL**

## Install

Download **`My-Sports-Hub-Setup-x.x.x.exe`** from the [latest release](https://github.com/Breaddles00/my-sports-hub/releases/latest) and run it (about 2 MB). It installs for your user only, adds My Sports Hub to the Start menu and Desktop, and needs nothing else. Double-clicking **`Setup My Sports Hub.bat`** in this repo downloads and runs the same installer.

Windows SmartScreen may warn about an "unknown publisher" because the app isn't code-signed. Click **More info → Run anyway**.

A **`My-Sports-Hub-Portable-x.x.x.exe`** that runs without installing is also attached to each release. It needs the Microsoft Edge WebView2 runtime, which Windows 11 already has.

## Web version

The same app also runs in a browser: **https://breaddles00.github.io/my-sports-hub/**. It shows the same scores, schedules, standings, Starred tabs, game centre and news. On a phone the sidebar becomes a tab bar along the bottom.

- **Add it to your home screen** to open it full screen like an app. On iPhone, use Safari's **Share → Add to Home Screen**. On Android, use Chrome's **⋮ → Add to Home screen**.
- **Starred teams and settings are kept separately** on each device and browser.
- **Notifications** only arrive while the site is open. On iPhone they need the home-screen version.
- The site always runs the newest build, so there's no updater. Every push to `main` that changes the UI republishes it ([`web.yml`](.github/workflows/web.yml)).
- Data comes straight from ESPN in the browser. ESPN refuses a few endpoints from browsers: team lists and pages, depth charts, and all of Squiggle. Those need the small Cloudflare proxy in [`worker/`](worker/README.md).

Build it locally with `node scripts/build.mjs --web`. The output goes to `dist-web/`; serve that folder with any static server.

## Automatic updates

Each time it starts, My Sports Hub shows a small splash screen and checks this repo's latest GitHub Release. If there's a newer version, it updates before opening.

| How you run it | What happens when there's an update |
|---|---|
| Installed with the Setup `.exe` | Downloads the new installer, checks its SHA-256 against the one GitHub publishes, installs it (a progress bar, no questions) and reopens on the new version |
| Portable `.exe` | Shows a banner with a link to download the new version |

If GitHub can't be reached within about 8 seconds (for example, when you're offline), the app opens normally. **Settings → Updates → Check now** runs the check on demand. To skip it once, launch with `--skip-update-check` (or set `MSH_SKIP_UPDATE=1`).

### How releases are made

Every push to `main` (except README-only changes) runs the **Build & release Windows app** GitHub Action. It:

1. stamps the version as `1.1.<run number>`, so each push is newer than the last,
2. builds the app, the installer and the portable exe on Windows,
3. publishes them as the latest GitHub Release, which the updater reads.

To start a new minor or major version, change `"version"` in `package.json` (e.g. `1.2.0`); `src-tauri/tauri.conf.json` reads it from there. The run number is still added as the patch number.

## Features

- **Home dashboard**: every live game across all six leagues, your followed teams, and today's slate for each league.
- **Starred**: just your starred teams, with a merged schedule and results list (bye weeks included), a news feed, season stats (key-stat comparison per league, or full stats for one team) a roster for each team (NFL and NCAAF split into Offense, Defense and Special Teams; other sports grouped by position) and depth charts (NFL, MLB, NBA and NHL; ESPN doesn't publish them for NCAAF or AFL). Hover an injury tag (Out, Questionable, IR, Active…) for ESPN's latest note on the injury and when it was updated. Pick a team chip to focus on one team.
- **Off-season countdowns**: when a league's season is over, its scoreboard shows a countdown to next season's first game (to the second once the schedule is out, otherwise an estimate from ESPN's season calendar), plus when the preseason starts. Home lists every league in its off-season, and starred teams with no next game show how long until they're back.
- **Live updates**: refreshes every 15s while games are in progress and every 60s otherwise (both adjustable). Scores flash when they change.
- **Scoreboards**: browse by week (NFL/NCAAF) or game day (MLB/NBA/NHL/AFL), with Live/Upcoming/Final filters and team search. Each slate lists the teams on bye that week (NFL, NCAAF) or round (AFL, from Squiggle's fixture), or without a game that day (MLB, NBA, NHL). Cards show down & distance, possession, red zone, MLB count and bases, last play, TV, venue and betting line.
- **Game centre**: line score, win-probability chart, leaders, scoring summary, full box score, team stats, play-by-play or drives, and game info.
- **Standings**, **Teams** (schedule, results and roster with injuries; hover a status for the latest note) and **News**.
- **Follow teams (☆)**: Windows notifications at kick-off, on every score, and at full time.
- Dark and light themes, the standard Windows 11 title bar, and times in your local time zone.
- Keyboard: `F5` refresh · `H` home · `S` starred · `1`–`6` leagues · `Esc` close panel · `F12` dev tools.

## Data

Data comes from ESPN's public JSON feeds (`site.api.espn.com`). They're free and need no API key, but they're unofficial and can change. The AFL ladder falls back to the free [Squiggle API](https://api.squiggle.com.au). My Sports Hub isn't affiliated with any league or with ESPN.

## Development

Building needs [Node.js](https://nodejs.org) and [Rust](https://rustup.rs) with the Visual Studio C++ build tools ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
npm install
npm run dev            # build the UI and run the app (debug build, skips installing updates)
npm run dist           # release build: src-tauri/target/release/ and the installer in bundle/nsis/
npm run build:web      # web version into dist-web/ (published to GitHub Pages by web.yml)
```

```
src-tauri/src/main.rs        window, single instance, saved window state, plugins
src-tauri/src/updater.rs     launch-time update check + splash, "Check now"
src-tauri/capabilities/      what the UI may do, including the HTTP host allow-list
src-tauri/tauri.conf.json    app name, window, installer settings
src/tauri-api.js             window.api bridge for the UI (HTTP, links, notifications, updates)
src/splash.*                 "Checking for updates…" splash
src/api.js                   ESPN/Squiggle fetching + normalisation
src/leagues.js               league config (add more leagues here)
src/store.jsx                settings, favourites, live polling
src/components/              Home, Starred, Scoreboard, GameCard, GameDetail, Standings, Teams, News, Settings
scripts/build.mjs            esbuild bundler for the UI (into dist/)
scripts/ci-version.mjs       CI version stamping
```
