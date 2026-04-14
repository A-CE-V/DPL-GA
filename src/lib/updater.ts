/**
 * updater.ts — Launcher self-update (Phase 7)
 *
 * Uses tauri-plugin-updater to check for a new version of the launcher binary
 * itself. This is separate from game updates (which are handled by download.rs).
 *
 * Flow:
 *   1. checkForLauncherUpdate() is called on HomeScreen mount
 *   2. If an update is found, it returns the update info
 *   3. HomeScreen shows a banner — user clicks "Install Update"
 *   4. installLauncherUpdate() downloads, installs, and relaunches
 *
 * The update endpoint is configured in tauri.conf.json under plugins.updater.
 * The dev must host a JSON manifest at that URL in the format:
 * {
 *   "version": "1.1.0",
 *   "notes": "What changed",
 *   "pub_date": "2025-01-01T00:00:00Z",
 *   "platforms": {
 *     "windows-x86_64": { "url": "https://...", "signature": "..." },
 *     "darwin-aarch64": { "url": "https://...", "signature": "..." },
 *     "linux-x86_64":   { "url": "https://...", "signature": "..." }
 *   }
 * }
 *
 * To generate signing keys run:
 *   npm run tauri signer generate
 * Put the public key in tauri.conf.json → plugins.updater.pubkey
 * Keep the private key secret — use it when building releases.
 */

import { isTauri } from "./ipc";

export interface LauncherUpdate {
  version:  string;
  notes:    string;
  date:     string;
  download: () => Promise<void>;  // call this to download + install + relaunch
}

/**
 * Check if a newer version of the launcher is available.
 * Returns null if: no update found, not in Tauri, endpoint not configured,
 * or the check fails for any reason. Always fails silently.
 */
export async function checkForLauncherUpdate(): Promise<LauncherUpdate | null> {
  if (!isTauri()) return null;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");

    const update = await check();
    if (!update?.available) return null;

    return {
      version: update.version,
      notes:   update.body  ?? "",
      date:    update.date  ?? "",
      download: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
  } catch (e) {
    // Endpoint not configured, network error, etc. — always silent.
    console.warn("[updater] check failed (non-critical):", e);
    return null;
  }
}
