/**
 * cache.ts — GameConfig offline cache
 *
 * Stores the last known-good GameConfig so the launcher can start
 * even when Firestore is unreachable (offline, rate-limited, etc.).
 *
 * Storage strategy:
 *   1. Try Tauri's appLocalDataDir (native — survives browser cache clears)
 *   2. Fall back to localStorage (web preview / dev mode)
 *
 * Cache is considered fresh for up to CACHE_TTL_MS (default: 7 days).
 * A stale cache is still used if online fetch fails — better than nothing.
 */

import type { GameConfig } from "../types";

const CACHE_KEY     = "dl_game_config_v1";
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1_000; // 7 days

interface CachedConfig {
  config:    GameConfig;
  savedAt:   number;   // Date.now()
  gameId:    string;
  version:   string;   // profile.version at time of cache
}

// ─── Detect environment ───────────────────────────────────────────────────────
const isTauri = () => "__TAURI_INTERNALS__" in window;

// ─── Tauri file cache ─────────────────────────────────────────────────────────
// Uses @tauri-apps/plugin-fs if available (declared as optional dep).
async function readTauriCache(): Promise<CachedConfig | null> {
  try {
    const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    const text = await readTextFile("deploy-launcher-cache.json", { baseDir: BaseDirectory.AppLocalData });
    return JSON.parse(text) as CachedConfig;
  } catch {
    return null;
  }
}

async function writeTauriCache(data: CachedConfig): Promise<void> {
  try {
    const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    // Ensure the directory exists (no-op if already exists)
    await mkdir(".", { baseDir: BaseDirectory.AppLocalData, recursive: true }).catch(() => {});
    await writeTextFile("deploy-launcher-cache.json", JSON.stringify(data), { baseDir: BaseDirectory.AppLocalData });
  } catch (e) {
    console.warn("[cache] Tauri write failed, falling back to localStorage:", e);
    // Fallback on Tauri write failure
    writeLocalCache(data);
  }
}

// ─── localStorage cache (fallback / web dev) ──────────────────────────────────
function readLocalCache(): CachedConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedConfig) : null;
  } catch { return null; }
}

function writeLocalCache(data: CachedConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[cache] localStorage write failed:", e);
  }
}

function clearLocalCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Save a freshly fetched GameConfig to the local cache. */
export async function saveConfigCache(gameId: string, config: GameConfig): Promise<void> {
  const data: CachedConfig = {
    config,
    savedAt: Date.now(),
    gameId,
    version: config.profile.version,
  };
  if (isTauri()) {
    await writeTauriCache(data);
  } else {
    writeLocalCache(data);
  }
  console.log("[cache] saved config for gameId:", gameId, "version:", config.profile.version);
}

/** Load the cached GameConfig.
 *  Returns the cached entry (even if stale) or null if nothing is cached.
 *  Callers should check `isCacheFresh()` to decide whether to re-fetch. */
export async function loadConfigCache(gameId: string): Promise<CachedConfig | null> {
  const data = isTauri() ? await readTauriCache() : readLocalCache();
  if (!data)               return null;
  if (data.gameId !== gameId) return null; // different game — ignore
  return data;
}

/** Returns true if the cache entry is younger than CACHE_TTL_MS. */
export function isCacheFresh(entry: CachedConfig): boolean {
  return Date.now() - entry.savedAt < CACHE_TTL_MS;
}

/** Clear all cached data. */
export async function clearConfigCache(): Promise<void> {
  if (isTauri()) {
    try {
      const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      await remove("deploy-launcher-cache.json", { baseDir: BaseDirectory.AppLocalData });
    } catch {}
  }
  clearLocalCache();
}

/** Format a human-readable "last updated" label from a cache entry. */
export function cacheAge(entry: CachedConfig): string {
  const diffMs  = Date.now() - entry.savedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}
