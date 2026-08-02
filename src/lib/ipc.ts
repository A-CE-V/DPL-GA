import { invoke } from "@tauri-apps/api/core";

export interface DownloadProgress {
  downloaded:  number;
  total:       number;
  percent:     number;
  speed_kbps:  number;
  // FIX: added "resuming" and "verifying" — these are real states the Rust
  // side now reports (see download.rs), previously undeclared here meaning
  // the UI had no way to distinguish "resuming a partial download" or
  // "checksum verification in progress" from plain "downloading".
  status:      "downloading" | "resuming" | "verifying" | "extracting" | "done" | "error" | "cancelled";
  error?:      string;
}

export interface InstalledVersion {
  version: string;
  path:    string;
  size_mb: number;
}

export interface SystemInfo {
  os:          string;
  os_version:  string;
  arch:        string;
  hostname:    string;
}

export interface MacInfo {
  mac:     string;
  display: string;
}

// ─── Download ─────────────────────────────────────────────────────────────────
// FIX: startDownload now accepts an optional expectedSha256. When the dev
// has supplied a checksum for this mirror URL (see MirrorUrl.sha256 in
// types/index.ts), it's passed through to the Rust side, which verifies
// the downloaded file's integrity before extracting. When omitted, the
// download proceeds exactly as before — no behavior change for existing
// mirror URLs that don't have a checksum set.
export const startDownload = (
  gameId: string, version: string, url: string, expectedSha256?: string,
) =>
  invoke<void>("download_build", { gameId, version, url, expectedSha256: expectedSha256 ?? null });

export const getProgress = (gameId: string, version: string) =>
  invoke<DownloadProgress | null>("get_download_progress", { gameId, version });

export const cancelDownload = (gameId: string, version: string) =>
  invoke<void>("cancel_download", { gameId, version });

export const checkUrl = (url: string) =>
  invoke<boolean>("check_url_availability", { url });

// ─── Launch ───────────────────────────────────────────────────────────────────
export const launchGame = (gameId: string, version: string, exeName?: string) =>
  invoke<void>("launch_game", { gameId, version, exeName: exeName ?? null });

export const getInstalledVersion = (gameId: string, version: string) =>
  invoke<InstalledVersion | null>("get_installed_version", { gameId, version });

export const deleteVersion = (gameId: string, version: string) =>
  invoke<void>("delete_version", { gameId, version });

// ─── System ──────────────────────────────────────────────────────────────────
export const getSystemInfo = () =>
  invoke<SystemInfo>("get_system_info");

// ─── MAC address ────────────────────────────────────────────────────────────
export const getMacAddress = () =>
  invoke<MacInfo>("get_mac_address_cmd");

// ─── Is running inside Tauri? ─────────────────────────────────────────────────
export const isTauri = () => "__TAURI_INTERNALS__" in window;
