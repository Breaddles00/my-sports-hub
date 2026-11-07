// My Sports Hub — Tauri shell. The React UI lives in src/; src/tauri-api.js gives it window.api
// using the plugins registered below. updater.rs runs the launch-time update check.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod updater;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

fn main() {
    tauri::Builder::default()
        // Must be first: a second launch focuses the running window instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // The main window starts hidden behind the update splash, so its visibility is never restored.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(updater::UpdateState::default())
        .invoke_handler(tauri::generate_handler![
            updater::update_notice,
            updater::check_for_updates,
            updater::restart_to_update
        ])
        .setup(|app| {
            updater::on_launch(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running My Sports Hub");
}
