# My Sports Hub

A Windows 11 desktop app (React + Electron) with live scores, schedules, standings, box scores, rosters and news for:

**NFL · NCAA Football (FBS) · MLB · NBA · NHL · AFL**

## Install

**Easiest:** download **`My-Sports-Hub-Setup-x.x.x.exe`** from the [latest release](https://github.com/Breaddles00/my-sports-hub/releases/latest) and run it. It adds My Sports Hub to the Start menu and Desktop. You don't need to install anything else.

Windows SmartScreen may warn about an "unknown publisher" because the app isn't code-signed. Click **More info → Run anyway**.

A **`My-Sports-Hub-Portable-x.x.x.exe`** that runs without installing is also attached to each release.

### Build it yourself (optional)

Clone or download this repo and double-click **`Setup My Sports Hub.bat`**. It installs Node.js if needed, builds the app and runs the installer. **`Run My Sports Hub.bat`** runs the app straight from the folder.

## Automatic updates

Each time it starts, My Sports Hub shows a small splash screen and checks this GitHub repo for a newer version. If it finds one, it updates before opening.

| How you run it | What happens when there's an update |
|---|---|
| Installed with the Setup `.exe` | Downloads the new installer from Releases, installs it silently and reopens on the new version |
| From a `git clone` of this repo | Runs `git pull`, reinstalls packages if they changed, rebuilds and reopens |
| Portable `.exe` or a downloaded copy of the folder | Shows a banner with a link to download the new version |

If GitHub can't be reached within about 8 seconds (for example, when you're offline), the app opens normally. **Settings → Updates → Check now** runs the check on demand. To skip it once, launch with `--skip-update-check`.

### How releases are made

Every push to `main` (except README-only changes) runs the **Build & release Windows app** GitHub Action. It:

1. stamps the version as `1.0.<run number>`, so each push is newer than the last,
2. builds the installer and portable app on Windows,
3. publishes them as a GitHub Release with `latest.yml`, which the updater reads.

To start a new minor or major version, change `"version"` in `package.json` (e.g. `1.1.0`). The run number is still added as the patch number.

## Features

- **Home dashboard**: every live game across all six leagues, your followed teams, and today's slate for each league.
- **Starred**: just your starred teams, with a merged schedule and results list, a news feed, season stats (key-stat comparison per league, or full stats for one team) and depth charts (NFL, MLB, NBA and NHL; ESPN doesn't publish them for NCAAF or AFL). Pick a team chip to focus on one team.
- **Live updates**: refreshes every 15s while games are in progress and every 60s otherwise (both adjustable). Scores flash when they change.
- **Scoreboards**: browse by week (NFL/NCAAF) or game day (MLB/NBA/NHL/AFL), with Live/Upcoming/Final filters and team search. Cards show down & distance, possession, red zone, MLB count and bases, last play, TV, venue and betting line.
- **Game centre**: line score, win-probability chart, leaders, scoring summary, full box score, team stats, play-by-play or drives, and game info.
- **Standings**, **Teams** (schedule, results and roster with injuries) and **News**.
- **Follow teams (☆)**: Windows notifications at kick-off, on every score, and at full time.
- Dark and light themes, native Windows 11 title bar, and times in your local time zone.
- Keyboard: `F5` refresh · `H` home · `S` starred · `1`–`6` leagues · `Esc` close panel · `F12` dev tools.

## Data

Data comes from ESPN's public JSON feeds (`site.api.espn.com`). They're free and need no API key, but they're unofficial and can change. The AFL ladder falls back to the free [Squiggle API](https://api.squiggle.com.au). My Sports Hub isn't affiliated with any league or with ESPN.

## Development

```bash
npm install
npm start              # build the UI and launch (runs the update check)
npm run start:no-update
npm run dist           # build installer + portable exe into release/ (no publishing)
```

```
electron/main.js       window, secure HTTP bridge, shortcuts
electron/updater.js    launch-time update check (GitHub Releases / git pull)
electron/splash.*      "Checking for updates…" splash window
electron/preload.js    safe API exposed to the UI
src/api.js             ESPN/Squiggle fetching + normalisation
src/leagues.js         league config (add more leagues here)
src/store.jsx          settings, favourites, live polling
src/components/        Home, Starred, Scoreboard, GameCard, GameDetail, Standings, Teams, News, Settings
scripts/build.mjs      esbuild bundler for the React UI
scripts/ci-version.mjs CI version stamping
```
