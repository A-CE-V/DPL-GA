use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct InstalledVersion {
    pub version: String,
    pub path:    String,
    pub size_mb: f64,
}

fn game_dir(game_id: &str, version: &str) -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("DeployLauncher")
        .join(game_id)
        .join(version)
}

/// Launch the game executable inside the installed version directory.
/// Tries to find a .exe (Windows), .app bundle (macOS), AppImage (Linux).
#[tauri::command]
pub async fn launch_game(
    game_id:  String,
    version:  String,
    exe_name: Option<String>,   // optional override — discovered automatically if None
) -> Result<(), String> {
    let dir = game_dir(&game_id, &version);
    if !dir.exists() {
        return Err(format!("Version {version} is not installed."));
    }

    let exe_path = if let Some(name) = exe_name {
        dir.join(name)
    } else {
        find_executable(&dir)?
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&exe_path)
            .current_dir(&dir)
            .spawn()
            .map_err(|e| format!("Failed to launch: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        // Try .app bundle first, fall back to binary
        if exe_path.extension().map(|e| e == "app").unwrap_or(false) {
            std::process::Command::new("open").arg(&exe_path).spawn()
                .map_err(|e| format!("Failed to launch: {e}"))?;
        } else {
            std::process::Command::new(&exe_path).current_dir(&dir).spawn()
                .map_err(|e| format!("Failed to launch: {e}"))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Make AppImages executable first
        if exe_path.extension().map(|e| e == "AppImage" || e == "appimage").unwrap_or(false) {
            let _ = std::process::Command::new("chmod").args(["+x", &exe_path.to_string_lossy()]).status();
        }
        std::process::Command::new(&exe_path)
            .current_dir(&dir)
            .spawn()
            .map_err(|e| format!("Failed to launch: {e}"))?;
    }

    Ok(())
}

fn find_executable(dir: &PathBuf) -> Result<PathBuf, String> {
    let extensions: &[&str] = if cfg!(target_os = "windows") {
        &["exe", "msi"]
    } else if cfg!(target_os = "macos") {
        &["app", "dmg", ""]
    } else {
        &["AppImage", "appimage", "x86_64", ""]
    };

    // Walk one level deep
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() { continue; }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if extensions.iter().any(|e| e.is_empty() || ext == e.to_lowercase()) {
            return Ok(path);
        }
    }

    // Walk one level deeper (game might be in a subfolder)
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let sub = entry.path();
        if !sub.is_dir() { continue; }
        let sub_entries = std::fs::read_dir(&sub).map_err(|e| e.to_string())?;
        for se in sub_entries.flatten() {
            let path = se.path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if extensions.iter().any(|e| e.is_empty() || ext == e.to_lowercase()) {
                return Ok(path);
            }
        }
    }

    Err("Could not find executable in installed version.".into())
}

/// Return the version string if it's installed locally, else None.
#[tauri::command]
pub async fn get_installed_version(game_id: String, version: String) -> Result<Option<InstalledVersion>, String> {
    let dir = game_dir(&game_id, &version);
    if !dir.exists() { return Ok(None); }
    // Compute directory size
    let size: u64 = walkdir_size(&dir);
    Ok(Some(InstalledVersion {
        version: version.clone(),
        path:    dir.to_string_lossy().into_owned(),
        size_mb: size as f64 / 1_048_576.0,
    }))
}

/// Delete an installed version.
#[tauri::command]
pub async fn delete_version(game_id: String, version: String) -> Result<(), String> {
    let dir = game_dir(&game_id, &version);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn walkdir_size(path: &PathBuf) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries.flatten().fold(0u64, |acc, e| {
        let p = e.path();
        if p.is_file() {
            acc + p.metadata().map(|m| m.len()).unwrap_or(0)
        } else {
            acc + walkdir_size(&p)
        }
    })
}
