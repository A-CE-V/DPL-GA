use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::State;

// ─── State types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded:  u64,
    pub total:       u64,
    pub percent:     f64,
    pub speed_kbps:  f64,
    // "downloading" | "resuming" | "verifying" | "extracting" | "done" | "error" | "cancelled"
    pub status:      String,
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

// A standard Dropbox share link defaults to `dl=0`, which — when fetched
// by a plain HTTP client with no cookies/JS, exactly what reqwest does
// here — serves Dropbox's HTML preview page instead of the actual file.
// That HTML then gets saved as if it were the build archive, so it "downloads"
// (a small, fast, misleadingly successful-looking transfer) but fails at
// the extraction step below because it isn't a real zip. Forcing `dl=1`
// makes Dropbox return the raw file bytes directly. This is a plain string
// rewrite of the query parameter — it changes nothing about which file
// Dropbox serves, only whether it hands over the bytes or a webpage.
fn normalize_download_url(url: &str) -> String {
    if !url.contains("dropbox.com") {
        return url.to_string();
    }
    if url.contains("dl=0") {
        return url.replacen("dl=0", "dl=1", 1);
    }
    if !url.contains("dl=1") {
        let sep = if url.contains('?') { "&" } else { "?" };
        return format!("{url}{sep}dl=1");
    }
    url.to_string()
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

// SHA-256 verification — streams the file back off disk in 64KB chunks
// (never loads the whole archive into memory at once) and returns the
// lowercase hex digest for comparison against the dev-supplied checksum.
fn sha256_file(path: &PathBuf) -> Result<String, String> {
    let mut file   = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf    = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

// Extracts a zip one entry at a time (instead of the crate's own all-at-once
// arch.extract()) so real progress can be reported as it goes. Runs on a
// blocking-pool thread (see spawn_blocking above), so std::fs/std::io calls
// here are fine to use directly.
//
// entry.enclosed_name() is the same zip-slip guard arch.extract() uses
// internally — entries with unsafe paths (absolute paths, `../` escapes)
// return None and are skipped rather than followed, so this isn't a
// weaker safety story than the single-call version it replaces.
fn extract_zip_with_progress(
    tmp_path: &PathBuf,
    dest_dir: &PathBuf,
    progress: &ProgressMap,
    key:      &str,
) -> Result<(), String> {
    let file = std::fs::File::open(tmp_path).map_err(|e| e.to_string())?;
    let mut arch = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let total = arch.len();

    for i in 0..total {
        let mut entry = arch.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match entry.enclosed_name() {
            Some(p) => dest_dir.join(p),
            None    => continue,
        };

        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }

        // Real per-entry progress — game build archives are typically a few
        // hundred to a few thousand files, cheap enough to update every one.
        if let Ok(mut p) = progress.lock() {
            if let Some(e) = p.get_mut(key) {
                e.downloaded = (i + 1) as u64;
                e.total      = total as u64;
                e.percent    = ((i + 1) as f64 / total.max(1) as f64) * 100.0;
            }
        }
    }
    Ok(())
}

// ─── IPC Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn download_build(
    game_id:         String,
    version:         String,
    url:             String,
    // Optional dev-supplied checksum. When present, the download is
    // verified after completing and BEFORE extraction; a mismatch fails
    // the download with a clear error instead of silently installing a
    // corrupted or tampered file. When absent, this step is skipped.
    expected_sha256: Option<String>,
    state:           State<'_, DownloadState>,
) -> Result<(), String> {
    let key      = format!("{game_id}_{version}");
    let progress = Arc::clone(&state.progress);
    let cancel   = Arc::clone(&state.cancel);

    // FIX — found while investigating "the progress bar makes strange
    // movements". cancel_download sets cancel[key] = true and nothing ever
    // clears it — including here, previously. Since the same cancel (X)
    // button also dismisses failed downloads (see HomeScreen.tsx), any
    // download that was ever dismissed after an error left this flag set
    // forever. Every later attempt for that exact game+version would then
    // see a stale "cancelled" flag on its very first chunk and abort almost
    // immediately — looking like the download randomly stalls or resets
    // rather than actually running. A fresh attempt should always start
    // clean regardless of what happened to a previous one.
    cancel.lock().unwrap().remove(&key);

    let url      = normalize_download_url(&url);

    let dest_dir = game_dir(&game_id, &version);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let archive_type = detect_archive_type(&url).to_string();
    let tmp_path     = dest_dir.join(format!("build.{archive_type}"));

    // Resume support: check for an existing partial download.
    let existing_bytes = std::fs::metadata(&tmp_path).map(|m| m.len()).unwrap_or(0);
    let is_resuming     = existing_bytes > 0;

    {
        let mut p = progress.lock().unwrap();
        p.insert(key.clone(), DownloadProgress {
            downloaded: existing_bytes, total: 0, percent: 0.0,
            speed_kbps: 0.0,
            status: if is_resuming { "resuming".into() } else { "downloading".into() },
            error: None,
        });
    }

    tokio::spawn(async move {
        let client  = Client::new();
        let mut req = client.get(&url);

        if is_resuming {
            req = req.header(reqwest::header::RANGE, format!("bytes={existing_bytes}-"));
        }

        let res = match req.send().await {
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

        // Only treat this as a true resume if the server actually replied
        // 206 Partial Content. Some servers ignore Range and send the full
        // file back with 200 — if we kept appending in that case the
        // result would be corrupted, so we detect it and start fresh.
        let server_supports_resume = res.status() == reqwest::StatusCode::PARTIAL_CONTENT;
        let actually_resuming      = is_resuming && server_supports_resume;

        let content_len = res.content_length().unwrap_or(0);
        let total = if actually_resuming { existing_bytes + content_len } else { content_len };

        let mut file = if actually_resuming {
            std::fs::OpenOptions::new().append(true).open(&tmp_path).unwrap()
        } else {
            std::fs::File::create(&tmp_path).unwrap()
        };

        let mut stream     = res.bytes_stream();
        let mut downloaded = if actually_resuming { existing_bytes } else { 0 };
        let mut last_tick  = std::time::Instant::now();
        let mut last_bytes = downloaded;

        {
            let mut p = progress.lock().unwrap();
            if let Some(entry) = p.get_mut(&key) {
                entry.status      = "downloading".into();
                entry.downloaded  = downloaded;
                entry.total       = total;
            }
        }

        while let Some(chunk) = stream.next().await {
            {
                let c = cancel.lock().unwrap();
                if c.get(&key).copied().unwrap_or(false) {
                    let mut p = progress.lock().unwrap();
                    if let Some(entry) = p.get_mut(&key) {
                        entry.status = "cancelled".into();
                    }
                    // Partial file is intentionally kept on disk so a future
                    // download_build call for the same game+version can
                    // resume instead of starting over.
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

            if let Err(e) = file.write_all(&chunk) {
                let mut p = progress.lock().unwrap();
                if let Some(entry) = p.get_mut(&key) {
                    entry.status = "error".into();
                    entry.error  = Some(e.to_string());
                }
                return;
            }
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

            let percent = if total > 0 { ((downloaded as f64 / total as f64) * 100.0).min(100.0) } else { 0.0 };
            let mut p   = progress.lock().unwrap();
            if let Some(entry) = p.get_mut(&key) {
                entry.downloaded = downloaded;
                entry.total      = total;
                entry.percent    = percent;
                if speed > 0.0 { entry.speed_kbps = speed; }
            }
        }
        drop(file);

        // SHA-256 verification (only if the dev supplied one).
        if let Some(expected) = expected_sha256 {
            {
                let mut p = progress.lock().unwrap();
                if let Some(entry) = p.get_mut(&key) {
                    entry.status = "verifying".into();
                }
            }
            // FIX: removed the broken `app.emit(...)` call that was here —
            // no `app: tauri::AppHandle` parameter was ever declared on
            // this function, so the compiler correctly rejected it with
            // "cannot find value `app` in this scope". This event also had
            // no listener anywhere on the frontend (the UI gets its status
            // via polling getProgress() every 400ms, not via events) — so
            // it was dead functionality, not something that needed fixing
            // in place. Removing it is the correct, lowest-risk fix.

            match sha256_file(&tmp_path) {
                Ok(actual) if actual.eq_ignore_ascii_case(&expected) => {
                    // Verified — continue to extraction below.
                }
                Ok(actual) => {
                    let _ = std::fs::remove_file(&tmp_path);
                    let mut p = progress.lock().unwrap();
                    if let Some(entry) = p.get_mut(&key) {
                        entry.status = "error".into();
                        entry.error  = Some(format!(
                            "Checksum mismatch — expected {expected}, got {actual}. The download may be corrupted or tampered with. Please try again."
                        ));
                    }
                    return;
                }
                Err(e) => {
                    let mut p = progress.lock().unwrap();
                    if let Some(entry) = p.get_mut(&key) {
                        entry.status = "error".into();
                        entry.error  = Some(format!("Failed to verify download: {e}"));
                    }
                    return;
                }
            }
        }

        // ── Extraction ──────────────────────────────────────────────────────
        // FIX — this used to be a single blocking arch.extract(&dest_dir)
        // call with zero progress feedback for its entire duration (could
        // easily be 30s-2min+ for a multi-GB game), plus it ran directly
        // inline in this async task, blocking a tokio worker thread the
        // whole time — which could delay get_download_progress polling for
        // this AND any other concurrent download. Now extracts one entry at
        // a time with a real percent after each, via spawn_blocking so the
        // async runtime stays responsive throughout.
        {
            let mut p = progress.lock().unwrap();
            if let Some(entry) = p.get_mut(&key) {
                entry.status     = "extracting".into();
                entry.percent    = 0.0;
                entry.downloaded = 0;
                entry.total      = 0;
                entry.speed_kbps = 0.0;
            }
        }

        let blocking_progress      = Arc::clone(&progress);
        let blocking_key           = key.clone();
        let blocking_archive_type  = archive_type.clone();
        let blocking_tmp_path      = tmp_path.clone();
        let blocking_dest_dir      = dest_dir.clone();
        let blocking_url           = url.clone();

        let extract_result: Result<(), String> = tokio::task::spawn_blocking(move || {
            match blocking_archive_type.as_str() {
                "zip" => extract_zip_with_progress(&blocking_tmp_path, &blocking_dest_dir, &blocking_progress, &blocking_key),
                "exe" | "msi" | "dmg" | "appimage" => {
                    let target = blocking_dest_dir.join(
                        std::path::Path::new(&blocking_url).file_name().unwrap_or_default()
                    );
                    std::fs::rename(&blocking_tmp_path, &target).map_err(|e| e.to_string())
                }
                other => Err(format!("Unsupported archive type: {other}")),
            }
        }).await.unwrap_or_else(|e| Err(format!("Extraction task panicked: {e}")));

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
    let url    = normalize_download_url(&url);
    let client = Client::new();
    match client.head(&url).send().await {
        Ok(res) => Ok(res.status().is_success()),
        Err(_)  => Ok(false),
    }
}
