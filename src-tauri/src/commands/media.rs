use std::path::PathBuf;
use base64::Engine;
use reqwest::Client;
use sha2::{Digest, Sha256};

// Same base-directory pattern as game_dir() in download.rs/launch.rs, but
// under the OS cache dir rather than data dir — these files are disposable
// and safe to lose (they just get re-downloaded), unlike actual game
// installs, so the semantically-correct location is the cache dir.
fn image_cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("DeployLauncher")
        .join("images")
}

fn detect_image_ext(url: &str) -> &'static str {
    let path = url.split('?').next().unwrap_or(url).to_lowercase();
    if path.ends_with(".png")       { "png"  }
    else if path.ends_with(".gif")  { "gif"  }
    else if path.ends_with(".webp") { "webp" }
    else                             { "jpg"  } // reasonable default; browsers/webviews sniff content anyway
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "png"  => "image/png",
        "gif"  => "image/gif",
        "webp" => "image/webp",
        _      => "image/jpeg",
    }
}

fn to_data_url(bytes: &[u8], ext: &str) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{};base64,{}", mime_for_ext(ext), encoded)
}

/// Fetches an image URL once, persists the bytes to disk, and returns a
/// base64 data URL. Every call after the first for the same URL is served
/// straight off disk with no network request at all — this is the "stays
/// loaded in the app's cache" behavior: once a player has seen an image, the
/// launcher never re-fetches it unless the cache is cleared or the dev
/// changes the URL (a changed URL hashes to a different cache file, so it's
/// treated as a new image rather than served stale).
///
/// Returned as a base64 data URL rather than served through Tauri's asset://
/// protocol, specifically so this doesn't require touching
/// tauri.conf.json's asset-protocol scope or any capabilities/*.json file —
/// given the recent stale-permissions build issue on this project, avoiding
/// new permission surface here was worth the small base64 overhead.
#[tauri::command]
pub async fn get_cached_image(url: String) -> Result<String, String> {
    if url.trim().is_empty() {
        return Err("Empty image URL.".into());
    }

    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let hash = hex::encode(hasher.finalize());
    let ext  = detect_image_ext(&url);

    let cache_dir = image_cache_dir();
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let cache_path = cache_dir.join(format!("{hash}.{ext}"));

    // Already cached — no network involved at all.
    if cache_path.exists() {
        let bytes = std::fs::read(&cache_path).map_err(|e| e.to_string())?;
        return Ok(to_data_url(&bytes, ext));
    }

    // First time seeing this URL — fetch once, persist, then serve.
    let client = Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Image fetch failed: HTTP {}", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;

    std::fs::write(&cache_path, &bytes).map_err(|e| e.to_string())?;
    Ok(to_data_url(&bytes, ext))
}

/// Clears every cached image. Not currently wired to any UI — exposed so a
/// future "Clear image cache" toggle in Settings can call it without
/// needing a new backend command at that point.
#[tauri::command]
pub async fn clear_image_cache() -> Result<(), String> {
    let dir = image_cache_dir();
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
