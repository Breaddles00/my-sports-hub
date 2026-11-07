# Tauri test build

This branch (`tauri`) builds My Sports Hub with [Tauri 2](https://v2.tauri.app) instead of Electron, so the two can be compared. The React UI in `src/` is unchanged.

- `src-tauri/`: the Rust shell (window, single instance, saved window state) and plugin permissions in `capabilities/default.json`.
- `tauri-shim/api-shim.js`: provides the same `window.api` the Electron preload provides, using Tauri's HTTP, opener and notification plugins. The HTTP allow-list matches `electron/main.js`.
- `npm run build:tauri-ui` bundles the UI into `dist-tauri/`. `npm run tauri:build` builds the app (needs Rust and the Visual Studio C++ build tools).
- CI: `.github/workflows/build-windows-tauri.yml` runs on pushes to `tauri` and publishes a pre-release tagged `tauri-v0.1.<run>`. Pre-releases are never "latest", so the Electron updater ignores them.

Differences from the Electron app: no auto-update or splash screen, the standard Windows title bar, and separate settings and starred teams. It installs as "My Sports Hub Tauri", alongside the Electron app.
