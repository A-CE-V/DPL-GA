use std::{
    collections::HashMap,
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use tauri::State;

// ─── State types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded:  u64,
    pub total:       u64,
    pub percent:     f64,
    pub speed_kbps:  f64,
    pub status:      String, // "downloading" | "extracting" | "done" | "error" | "cancelled"
    pub error:       Option<String>,
}

pub type ProgressMap = Arc<Mutex<HashMap<String, DownloadProgress>>>;
pub type CancelMap   = Arc<Mutex<HashMap<String, bool>>>;

#[derive(Default)]
pub struct DownloadState {
    pub progress: ProgressMap,
    pub cancel:   CancelMap,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn game_dir(game_id: &str, version: &str) -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("DeployLauncher")
        .join(game_id)
        .join(version)
}

fn detect_archive_type(url: &str) -> &'static str {
    let url_lower = url.split('?').next().unwrap_or(url).to_lowercase();
    if url_lower.ends_with(".zip")                                     { return "zip";      }
    if url_lower.ends_with(".tar.gz") || url_lower.ends_with(".tgz")  { return "tar.gz";   }
    if url_lower.ends_with(".tar")                                     { return "tar";      }
    if url_lower.ends_with(".exe") || url_lower.ends_with(".msi")     { return "exe";      }
    if url_lower.ends_with(".dmg")                                     { return "dmg";      }
    if url_lower.ends_with(".appimage")                                { return "appimage"; }
    "zip"
}

// ─── IPC Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn download_build(
    game_id:  String,
    version:  String,
    url:      String,
    state:    State<'_, DownloadState>,
) -> Result<(), String> {
    let key      = format!("{game_id}_{version}");
    let progress = Arc::clone(&state.progress);
    let cancel   = Arc::clone(&state.cancel);

    {
        let mut p = progress.lock().unwrap();
        p.insert(key.clone(), DownloadProgress {
            downloaded: 0, total: 0, percent: 0.0,
            speed_kbps: 0.0, status: "downloading".into(), error: None,
        });
    }

    let dest_dir = game_dir(&game_id, &version);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let archive_type = detect_archive_type(&url).to_string();
    let tmp_path     = dest_dir.join(format!("build.{archive_type}"));

    tokio::spawn(async move {
        let client = Client::new();
        let res = match client.get(&url).send().await {
            Ok(r)  => r,
            Err(e) => {
                let mut p = progress.lock().unwrap();
                if let Some(entry) = p.get_mut(&key) {
                    entry.status = "error".into();
                    entry.error  = Some(e.to_string());
                }
                return;
            }
        };

        let total      = res.content_length().unwrap_or(0);
        let mut file   = std::fs::File::create(&tmp_path).unwrap();
        let mut stream = res.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_tick  = std::time::Instant::now();
        let mut last_bytes: u64 = 0;

        while let Some(chunk) = stream.next().await {
            {
                let c = cancel.lock().unwrap();
                if c.get(&key).copied().unwrap_or(false) {
                    let mut p = progress.lock().unwrap();
                    if let Some(entry) = p.get_mut(&key) {
                        entry.status = "cancelled".into();
                    }
                    let _ = std::fs::remove_file(&tmp_path);
                    return;
                }
            }

            let chunk = match chunk {
                Ok(c)  => c,
                Err(e) => {
                    let mut p = progress.lock().unwrap();
                    if let Some(entry) = p.get_mut(&key) {
                        entry.status = "error".into();
                        entry.error  = Some(e.to_string());
                    }
                    return;
                }
            };

            file.write_all(&chunk).unwrap();
            downloaded += chunk.len() as u64;

            let elapsed = last_tick.elapsed().as_secs_f64();
            let speed = if elapsed >= 0.5 {
                let bytes_since = downloaded - last_bytes;
                last_bytes = downloaded;
                last_tick  = std::time::Instant::now();
                (bytes_since as f64 / elapsed) / 1024.0
            } else {
                0.0
            };

            let percent = if total > 0 { (downloaded as f64 / total as f64) * 100.0 } else { 0.0 };
            let mut p   = progress.lock().unwrap();
            if let Some(entry) = p.get_mut(&key) {
                entry.downloaded = downloaded;
                entry.total      = total;
                entry.percent    = percent;
                if speed > 0.0 { entry.speed_kbps = speed; }
            }
        }

        // ── Extraction ──────────────────────────────────────────────────────
        {
            let mut p = progress.lock().unwrap();
            if let Some(entry) = p.get_mut(&key) {
                entry.status = "extracting".into();
            }
        }

        // NOTE: No `?` inside tokio::spawn — the block returns () not Result.
        // Use explicit match instead.
        let extract_result: Result<(), String> = match archive_type.as_str() {
            "zip" => {
                match std::fs::File::open(&tmp_path) {
                    Err(e) => Err(e.to_string()),
                    Ok(f)  => match zip::ZipArchive::new(f) {
                        Err(e)       => Err(e.to_string()),
                        Ok(mut arch) => arch.extract(&dest_dir).map_err(|e| e.to_string()),
                    },
                }
            }
            "exe" | "msi" | "dmg" | "appimage" => {
                let target = dest_dir.join(
                    std::path::Path::new(&url)
                        .file_name()
                        .unwrap_or_default()
                );
                std::fs::rename(&tmp_path, &target).map_err(|e| e.to_string())
            }
            _ => Err(format!("Unsupported archive type: {archive_type}")),
        };

        let _ = std::fs::remove_file(&tmp_path);

        let mut p = progress.lock().unwrap();
        if let Some(entry) = p.get_mut(&key) {
            match extract_result {
                Ok(())  => entry.status = "done".into(),
                Err(e)  => { entry.status = "error".into(); entry.error = Some(e); }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_download_progress(
    game_id: String,
    version: String,
    state:   State<'_, DownloadState>,
) -> Result<Option<DownloadProgress>, String> {
    let key = format!("{game_id}_{version}");
    let p   = state.progress.lock().unwrap();
    Ok(p.get(&key).cloned())
}

#[tauri::command]
pub async fn cancel_download(
    game_id: String,
    version: String,
    state:   State<'_, DownloadState>,
) -> Result<(), String> {
    let key = format!("{game_id}_{version}");
    let mut c = state.cancel.lock().unwrap();
    c.insert(key, true);
    Ok(())
}

#[tauri::command]
pub async fn check_url_availability(url: String) -> Result<bool, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.head(&url).send().await;
    Ok(res.map(|r| r.status().is_success() || r.status().as_u16() == 405).unwrap_or(false))
}