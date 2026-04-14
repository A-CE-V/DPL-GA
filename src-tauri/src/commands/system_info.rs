use serde::Serialize;

#[derive(Serialize)]
pub struct SystemInfo {
    pub os:           String,
    pub os_version:   String,
    pub arch:         String,
    pub hostname:     String,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    Ok(SystemInfo {
        os:         std::env::consts::OS.to_string(),
        os_version: "unknown".to_string(),   // tauri-plugin-os provides richer info at runtime
        arch:       std::env::consts::ARCH.to_string(),
        hostname:   hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "unknown".to_string()),
    })
}
