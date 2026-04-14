import { invoke } from "@tauri-apps/api/core";

export interface DownloadProgress {
  downloaded:  number;
  total:       number;
  percent:     number;
  speed_kbps:  number;
  status:      "downloading" | "extracting" | "done" | "error" | "cancelled";
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

// Phase 6 — MAC address
export interface MacInfo {
  mac:     string;  // raw hex, e.g. "a1b2c3d4e5f6"
  display: string;  // formatted, e.g. "A1:B2:C3:D4:E5:F6"
}

// ─── Download ─────────────────────────────────────────────────────────────────
export const startDownload = (gameId: string, version: string, url: string) =>
  invoke<void>("download_build", { gameId, version, url });

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

// ─── MAC address (Phase 6) ────────────────────────────────────────────────────
// Only works inside Tauri — returns null in web/dev mode.
export const getMacAddress = () =>
  invoke<MacInfo>("get_mac_address_cmd");

// ─── Is running inside Tauri? ─────────────────────────────────────────────────
export const isTauri = () => "__TAURI_INTERNALS__" in window;
