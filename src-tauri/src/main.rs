// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{download, launch, media, system_info, mac_ban};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())  // Phase 7
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())                  // Phase 7 — relaunch
        // ═══════════════════════════════════════════════════════════════════
        // FIX — this .manage() call was completely missing.
        //
        // download_build, get_download_progress, and cancel_download all
        // take a `State<'_, DownloadState>` parameter. Without registering
        // that state via .manage() here, Tauri has no DownloadState instance
        // to hand to those commands — every single call to any of them would
        // fail at runtime with a "state not managed" error. This means the
        // entire download system (the button, progress tracking, resume,
        // cancel — everything) was never actually reachable, regardless of
        // anything on the frontend. This is very likely the real root cause
        // behind "I can't even download the game."
        // ═══════════════════════════════════════════════════════════════════
        .manage(download::DownloadState::default())
        // NEW — same pattern, for launch_game/is_game_running's process
        // tracking. Registered here up front specifically because of the
        // lesson above: a command taking State<'_, T> without a matching
        // .manage(T::default()) call fails at runtime, not compile time.
        .manage(launch::ProcessState::default())
        .invoke_handler(tauri::generate_handler![
            download::download_build,
            download::get_download_progress,
            download::cancel_download,
            download::check_url_availability,
            launch::launch_game,
            launch::is_game_running,
            launch::get_installed_version,
            launch::delete_version,
            launch::open_install_folder,
            media::get_cached_image,
            media::clear_image_cache,
            system_info::get_system_info,
            mac_ban::get_mac_address_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Deploy Launcher");
}
