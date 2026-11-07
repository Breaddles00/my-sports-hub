//! Launch-time updater for My Sports Hub.
//!
//! Every push to `main` on GitHub (Breaddles00/my-sports-hub) builds a numbered Release. On launch,
//! before the main window is shown, a small splash checks the latest Release:
//!
//! - Installed with the Setup exe: downloads the new Setup exe, checks its SHA-256 against the
//!   digest GitHub publishes for the asset, runs it in passive mode (progress bar, no questions)
//!   and the installer reopens the app on the new version.
//! - Portable exe: can't replace itself, so the app shows a banner with a download link.
//!
//! If GitHub can't be reached within 8 seconds (e.g. offline), the app just opens.
//! `--skip-update-check` or `MSH_SKIP_UPDATE=1` skips the check.

use std::{
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_http::reqwest;

const OWNER: &str = "Breaddles00";
const REPO: &str = "my-sports-hub";
const RELEASES_URL: &str = "https://github.com/Breaddles00/my-sports-hub/releases/latest";
const USER_AGENT: &str = "MySportsHub-Updater";
const CHECK_TIMEOUT: Duration = Duration::from_secs(8);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// Banner shown in the app when an update exists but can't be installed automatically (portable exe).
#[derive(Default)]
pub struct UpdateState {
    notice: Mutex<Option<Value>>,
}

struct Release {
    version: String,
    url: String,
    setup: Option<Asset>,
}

struct Asset {
    name: String,
    url: String,
    size: u64,
    sha256: Option<String>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn parse_version(v: &str) -> [u64; 3] {
    let mut out = [0; 3];
    for (i, part) in v.trim_start_matches('v').split(['.', '-']).take(3).enumerate() {
        out[i] = part.parse().unwrap_or(0);
    }
    out
}

fn is_newer(candidate: &str, current: &str) -> bool {
    parse_version(candidate) > parse_version(current)
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// The NSIS installer puts uninstall.exe next to the app; the portable exe has none.
fn is_installed() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe").exists()))
        .unwrap_or(false)
}

fn skip_requested() -> bool {
    std::env::args().any(|a| a == "--skip-update-check") || std::env::var("MSH_SKIP_UPDATE").map(|v| v == "1").unwrap_or(false)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CHECK_TIMEOUT)
        .build()
        .map_err(err)
}

async fn latest_release() -> Result<Option<Release>, String> {
    let api = format!("https://api.github.com/repos/{OWNER}/{REPO}/releases/latest");
    let res = client()?
        .get(api)
        .header("Accept", "application/vnd.github+json")
        .timeout(CHECK_TIMEOUT)
        .send()
        .await
        .map_err(err)?;
    if res.status().as_u16() == 404 {
        return Ok(None); // no releases yet
    }
    if !res.status().is_success() {
        return Err(format!("GitHub HTTP {}", res.status().as_u16()));
    }
    let body: Value = serde_json::from_str(&res.text().await.map_err(err)?).map_err(err)?;
    let setup = body["assets"].as_array().and_then(|assets| {
        assets
            .iter()
            .find(|a| {
                let name = a["name"].as_str().unwrap_or("");
                name.starts_with("My-Sports-Hub-Setup-") && name.ends_with(".exe")
            })
            .map(|a| Asset {
                name: a["name"].as_str().unwrap_or("My-Sports-Hub-Setup.exe").to_string(),
                url: a["browser_download_url"].as_str().unwrap_or("").to_string(),
                size: a["size"].as_u64().unwrap_or(0),
                sha256: a["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(|h| h.to_lowercase()),
            })
    });
    Ok(Some(Release {
        version: body["tag_name"].as_str().unwrap_or("").trim_start_matches('v').to_string(),
        url: body["html_url"].as_str().unwrap_or(RELEASES_URL).to_string(),
        setup,
    }))
}

// ---------- splash window ----------
struct Splash(Option<WebviewWindow>);

impl Splash {
    fn open(app: &AppHandle) -> Self {
        let win = WebviewWindowBuilder::new(app, "splash", WebviewUrl::App("splash.html".into()))
            .title("My Sports Hub")
            .inner_size(420.0, 260.0)
            .resizable(false)
            .decorations(false)
            .center()
            .build()
            .ok();
        Splash(win)
    }

    fn set(&self, status: &str, percent: Option<f64>, sub: &str) {
        if let Some(win) = &self.0 {
            let percent = percent.map(|p| format!("{p:.1}")).unwrap_or_else(|| "null".into());
            let js = format!("window.setStatus && window.setStatus({}, {}, {})", json!(status), percent, json!(sub));
            let _ = win.eval(&js);
        }
    }

    fn close(&self) {
        if let Some(win) = &self.0 {
            let _ = win.close();
        }
    }
}

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn pause(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}

// ---------- download + install ----------
async fn download(asset: &Asset, version: &str, splash: &Splash) -> Result<PathBuf, String> {
    let mut res = client()?
        .get(&asset.url)
        .timeout(DOWNLOAD_TIMEOUT)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?;
    let total = res.content_length().unwrap_or(asset.size).max(1);
    let path = std::env::temp_dir().join(&asset.name);
    let mut file = std::fs::File::create(&path).map_err(err)?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_report: Option<Instant> = None;
    let mb = |n: u64| n as f64 / 1_048_576.0;

    while let Some(chunk) = res.chunk().await.map_err(err)? {
        file.write_all(&chunk).map_err(err)?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        if last_report.map_or(true, |t| t.elapsed() >= Duration::from_millis(150)) {
            last_report = Some(Instant::now());
            let pct = (received as f64 / total as f64 * 100.0).min(100.0);
            splash.set(
                &format!("Downloading update v{version}…"),
                Some(pct),
                &format!("{:.1} of {:.1} MB", mb(received), mb(total)),
            );
        }
    }
    file.flush().map_err(err)?;
    drop(file);

    let actual: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    let size_ok = asset.size == 0 || received == asset.size;
    let hash_ok = asset.sha256.as_ref().map_or(true, |expected| *expected == actual);
    if !size_ok || !hash_ok {
        let _ = std::fs::remove_file(&path);
        return Err("the download was incomplete or corrupted".into());
    }
    Ok(path)
}

/// Returns Ok(()) when the app should carry on opening; never returns once an update starts installing.
async fn launch_check(app: &AppHandle, splash: &Splash) -> Result<(), String> {
    let current = current_version(app);
    let Some(release) = latest_release().await? else { return Ok(()) };
    if !is_newer(&release.version, &current) {
        return Ok(());
    }
    if !is_installed() {
        *app.state::<UpdateState>().notice.lock().unwrap() = Some(json!({
            "version": release.version,
            "message": format!("Version {} is available.", release.version),
            "url": release.url,
        }));
        return Ok(());
    }
    let Some(asset) = release.setup else {
        return Err("the new release has no installer".into());
    };

    splash.set(&format!("Downloading update v{}…", release.version), Some(0.0), &format!("You have v{current}"));
    let installer = download(&asset, &release.version, splash).await?;
    splash.set(&format!("Installing v{}…", release.version), Some(100.0), "My Sports Hub will reopen in a moment");
    pause(600);

    // /P = passive (progress bar only), /R = reopen the app afterwards, /UPDATE = update mode.
    std::process::Command::new(&installer)
        .args(["/P", "/R", "/UPDATE"])
        .spawn()
        .map_err(|e| format!("couldn't start the installer ({e})"))?;
    app.exit(0);
    std::future::pending::<()>().await; // never carry on launching the old version
    Ok(())
}

/// Called from the setup hook (main thread): opens the splash, then checks for updates in the background.
pub fn on_launch(app: AppHandle) {
    if skip_requested() {
        show_main(&app);
        return;
    }
    let splash = Splash::open(&app);
    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        let version = format!("v{}", current_version(&app));
        splash.set("Checking for updates…", None, &version);
        match launch_check(&app, &splash).await {
            Ok(()) => splash.set("Up to date — starting…", None, &version),
            Err(e) => {
                // Offline, GitHub slow, etc.: never block the app from opening.
                splash.set("Starting…", None, &format!("Couldn't check for updates ({e})"));
                pause(900);
            }
        }
        let shown = started.elapsed();
        if shown < Duration::from_millis(700) {
            std::thread::sleep(Duration::from_millis(700) - shown);
        }
        show_main(&app);
        splash.close();
    });
}

// ---------- commands used by src/tauri-api.js ----------
#[tauri::command]
pub fn update_notice(state: tauri::State<'_, UpdateState>) -> Option<Value> {
    state.notice.lock().unwrap().clone()
}

/// Settings → Updates → Check now.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Value {
    let current = current_version(&app);
    match latest_release().await {
        Ok(Some(r)) if is_newer(&r.version, &current) => json!({
            "status": "available",
            "version": r.version,
            "url": r.url,
            "canRestart": is_installed() && r.setup.is_some(),
        }),
        Ok(_) => json!({ "status": "current", "version": current }),
        Err(message) => json!({ "status": "error", "message": message }),
    }
}

/// "Restart & update": relaunching runs the launch check, which installs the update.
#[tauri::command]
pub fn restart_to_update(app: AppHandle) {
    app.restart();
}
