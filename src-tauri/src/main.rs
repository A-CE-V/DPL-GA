// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{download, launch, system_info, mac_ban};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())  // Phase 7
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())                  // Phase 7 — relaunch
        .invoke_handler(tauri::generate_handler![
            download::download_build,
            download::get_download_progress,
            download::cancel_download,
            download::check_url_availability,
            launch::launch_game,
            launch::get_installed_version,
            launch::delete_version,
            system_info::get_system_info,
            mac_ban::get_mac_address_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Deploy Launcher");
}
