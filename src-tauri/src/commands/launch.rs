use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize)]
pub struct InstalledVersion {
    pub version: String,
    pub path:    String,
    pub size_mb: f64,
}

// NEW — tracks spawned game processes so the launcher can actually answer
// "is this still running" instead of firing-and-forgetting. Mirrors the
// DownloadState pattern in download.rs (same key format, same Arc<Mutex<..>>
// shape) for consistency.
pub type ProcessMap = Arc<Mutex<HashMap<String, std::process::Child>>>;

#[derive(Default)]
pub struct ProcessState {
    pub children: ProcessMap,
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
    state:    State<'_, ProcessState>,
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

    let key = format!("{game_id}_{version}");

    #[cfg(target_os = "windows")]
    let child = std::process::Command::new(&exe_path)
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("Failed to launch: {e}"))?;

    #[cfg(target_os = "macos")]
    let child = {
        // Try .app bundle first, fall back to binary
        if exe_path.extension().map(|e| e == "app").unwrap_or(false) {
            // NOTE — `open` hands off to the real app and exits itself
            // almost immediately, so tracking this child only confirms the
            // hand-off succeeded, not whether the game is still running.
            // is_game_running will under-report here (revert to "Play"
            // shortly after launch even while the game is still up) rather
            // than get stuck showing "Running" forever — the safer of the
            // two failure modes.
            std::process::Command::new("open").arg(&exe_path).spawn()
                .map_err(|e| format!("Failed to launch: {e}"))?
        } else {
            std::process::Command::new(&exe_path).current_dir(&dir).spawn()
                .map_err(|e| format!("Failed to launch: {e}"))?
        }
    };

    #[cfg(target_os = "linux")]
    let child = {
        // Make AppImages executable first
        if exe_path.extension().map(|e| e == "AppImage" || e == "appimage").unwrap_or(false) {
            let _ = std::process::Command::new("chmod").args(["+x", &exe_path.to_string_lossy()]).status();
        }
        std::process::Command::new(&exe_path)
            .current_dir(&dir)
            .spawn()
            .map_err(|e| format!("Failed to launch: {e}"))?
    };

    state.children.lock().unwrap().insert(key, child);

    Ok(())
}

/// Whether the process launched for this game+version is still alive.
/// Cleans up its own tracking entry once the process has exited so the map
/// doesn't grow unbounded across a long launcher session.
#[tauri::command]
pub async fn is_game_running(
    game_id: String,
    version: String,
    state:   State<'_, ProcessState>,
) -> Result<bool, String> {
    let key = format!("{game_id}_{version}");
    let mut children = state.children.lock().unwrap();
    match children.get_mut(&key) {
        None => Ok(false),
        Some(child) => match child.try_wait() {
            Ok(None)     => Ok(true),                              // still running
            Ok(Some(_))  => { children.remove(&key); Ok(false) }   // exited normally
            Err(_)       => { children.remove(&key); Ok(false) }   // can't determine — assume not running
        },
    }
}

fn find_executable(dir: &PathBuf) -> Result<PathBuf, String> {
    let extensions: &[&str] = if cfg!(target_os = "windows") {
        &["exe", "msi"]
    } else if cfg!(target_os = "macos") {
        &["app", "dmg", ""]
    } else {
        &["AppImage", "appimage", "x86_64", ""]
    };

    // Walk one level deep.
    // NEW — sorted so results are at least deterministic across runs.
    // std::fs::read_dir's order isn't guaranteed by the OS/filesystem, so
    // without this, which file "wins" when a game ships more than one
    // matching binary (crash handler, redistributable installer, the real
    // game exe...) could vary from launch to launch. This doesn't make the
    // guess any smarter — only reproducible, which is what makes the
    // exeName override above worth using: without it being deterministic
    // there'd be no reliable way to even know what auto-detect will pick.
    let mut top: Vec<PathBuf> = std::fs::read_dir(dir).map_err(|e| e.to_string())?
        .flatten().map(|e| e.path()).filter(|p| !p.is_dir()).collect();
    top.sort();
    for path in &top {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if extensions.iter().any(|e| e.is_empty() || ext == e.to_lowercase()) {
            return Ok(path.clone());
        }
    }

    // Walk one level deeper (game might be in a subfolder)
    let mut subdirs: Vec<PathBuf> = std::fs::read_dir(dir).map_err(|e| e.to_string())?
        .flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    subdirs.sort();
    for sub in &subdirs {
        let mut nested: Vec<PathBuf> = std::fs::read_dir(&sub).map_err(|e| e.to_string())?
            .flatten().map(|e| e.path()).collect();
        nested.sort();
        for path in &nested {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if extensions.iter().any(|e| e.is_empty() || ext == e.to_lowercase()) {
                return Ok(path.clone());
            }
        }
    }

    Err("Could not find executable in installed version.".into())
}

/// Return the version string if it's installed locally, else None.
#[tauri::command]
pub async fn get_installed_version(game_id: String, version: String) -> Result<Option<InstalledVersion>, String> {
    let dir = game_dir(&game_id, &version);
    // FIX — previously this only checked `dir.exists()`. download_build
    // creates this directory up front, before attempting the download (see
    // download.rs), so a download/extraction that fails partway — bad
    // mirror URL, corrupt archive, network drop — still leaves the
    // directory behind, just empty. That made a failed install
    // indistinguishable from a real one here, which is how the launcher
    // could end up offering "Play" for a version with nothing playable
    // inside it. A non-empty check catches that without the cost of a full
    // recursive validation.
    let has_content = std::fs::read_dir(&dir).map(|mut e| e.next().is_some()).unwrap_or(false);
    if !dir.exists() || !has_content { return Ok(None); }
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

/// Opens the OS file explorer at an installed version's directory.
/// Uses the OS's own "open path" binary directly (same pattern already used
/// for macOS .app launches above) rather than tauri-plugin-shell's exposed
/// open command, so this doesn't need any capability/permission changes.
#[tauri::command]
pub async fn open_install_folder(game_id: String, version: String) -> Result<(), String> {
    let dir = game_dir(&game_id, &version);
    if !dir.exists() {
        return Err("This version isn't installed.".into());
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?;

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
