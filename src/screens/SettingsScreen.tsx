import { useState, useEffect } from "react";
import {
  ArrowLeft, Trash2, RefreshCw, Check, WifiOff, Clock,
  HardDrive, Settings, Info, ToggleLeft,
} from "lucide-react";
import { getInstalledVersion, deleteVersion, isTauri } from "../lib/ipc";
import { clearConfigCache, cacheAge, loadConfigCache } from "../lib/cache";
import { GAME_ID }  from "../lib/firebase";
import type { GameConfig, GameVersion } from "../types";

// ─── Player preferences stored in localStorage ────────────────────────────────
// These are player-side overrides — separate from the game config in Firestore.
const PREFS_KEY = "dl_player_prefs_v1";

export interface PlayerPrefs {
  analyticsOptOut: boolean;    // player can opt out of session tracking
  disableAutoUpdate: boolean;  // player can disable auto-update (if dev allows rollback)
  preferredVersion?: string;   // last manually selected version
}

export function loadPrefs(): PlayerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : { analyticsOptOut: false, disableAutoUpdate: false };
  } catch { return { analyticsOptOut: false, disableAutoUpdate: false }; }
}

export function savePrefs(prefs: PlayerPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({
  label, desc, checked, onChange, accent, disabled = false,
}: {
  label: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
  accent: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: disabled ? 0.4 : 1 }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "var(--text-primary)" }}>{label}</p>
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-faint)", marginTop: 3, lineHeight: 1.5 }}>{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        role="switch"
        aria-checked={checked}
        style={{
          width: 38, height: 22, borderRadius: 11, border: "none",
          cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0, position: "relative",
          background: checked ? accent : "rgba(255,255,255,0.1)",
          transition: "background 0.2s",
        }}
      >
        <span style={{
          position: "absolute", top: 3,
          left: checked ? 19 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}

// ─── Installed version row ─────────────────────────────────────────────────────
function InstalledVersionRow({
  version, accent, onDelete,
}: { version: GameVersion; accent: string; onDelete: () => void }) {
  const [info,     setInfo]     = useState<{ version: string; path: string; size_mb: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleted,  setDeleted]  = useState(false);

  useEffect(() => {
    if (isTauri()) {
      getInstalledVersion(GAME_ID, version.tag)
        .then(r => setInfo(r))
        .catch(() => {});
    }
  }, [version.tag]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteVersion(GAME_ID, version.tag);
      setDeleted(true);
      onDelete();
    } catch (e) {
      console.error("[SettingsScreen] delete failed:", e);
    } finally {
      setDeleting(false);
    }
  };

  if (deleted) return null;

  const isInstalled = !!info;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", borderRadius: 10,
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
        background: version.status === "stable" ? "#22c55e" : "#f59e0b",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
          v{version.tag}
        </span>
        {info ? (
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-faint)", marginLeft: 10 }}>
            {info.size_mb.toFixed(1)} MB · installed
          </span>
        ) : (
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text-faint)", marginLeft: 10 }}>
            not downloaded
          </span>
        )}
      </div>
      {isInstalled && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete local files"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 7,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
            color: "#f87171", fontFamily: "'DM Mono',monospace", fontSize: 11,
            cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting
            ? <RefreshCw size={11} style={{ animation: "spin 0.65s linear infinite" }} />
            : <Trash2 size={11} />}
          {deleting ? "Deleting..." : "Delete"}
        </button>
      )}
    </div>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
interface Props {
  config:  GameConfig;
  versions: GameVersion[];
  onBack:  () => void;
  fromCache?: boolean;
}

export function SettingsScreen({ config, versions, onBack, fromCache = false }: Props) {
  const { profile, settings } = config;
  const accent = profile.accentColor;

  const [prefs,        setPrefs]        = useState<PlayerPrefs>(loadPrefs);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [cacheInfo,    setCacheInfo]    = useState<{ age: string; version: string } | null>(null);
  const [savedPrefs,   setSavedPrefs]   = useState(false);
  const [localVersions, setLocalVersions] = useState<GameVersion[]>(versions);

  // Load cache metadata
  useEffect(() => {
    loadConfigCache(GAME_ID).then(c => {
      if (c) setCacheInfo({ age: cacheAge(c), version: c.version });
    });
  }, []);

  const updatePref = (key: keyof PlayerPrefs, val: boolean) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    savePrefs(next);
    setSavedPrefs(true);
    setTimeout(() => setSavedPrefs(false), 1800);
  };

  const handleClearCache = async () => {
    await clearConfigCache();
    setCacheCleared(true);
    setCacheInfo(null);
    setTimeout(() => setCacheCleared(false), 2000);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "'DM Mono',monospace",
      padding: "clamp(16px,3vw,32px)",
      animation: "fadeIn 0.2s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 9, padding: "7px 12px",
            color: "var(--text-muted)", fontFamily: "'DM Mono',monospace",
            fontSize: 12, cursor: "pointer",
          }}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div>
          <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
            Settings
          </p>
          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
            {profile.title}
          </p>
        </div>
        {savedPrefs && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, color: accent, fontSize: 11 }}>
            <Check size={13} /> Saved
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 540 }}>

        {/* ── Offline / cache banner ─────────────────────────────────────── */}
        {fromCache && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "10px 14px", borderRadius: 10,
            background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)",
          }}>
            <WifiOff size={14} color="#eab308" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, color: "#eab308", fontWeight: 600 }}>Offline Mode</p>
              <p style={{ fontSize: 10, color: "rgba(234,179,8,0.6)", marginTop: 2, lineHeight: 1.5 }}>
                Running from cached data. Some features may be unavailable until you reconnect.
              </p>
            </div>
          </div>
        )}

        {/* ── Player preferences ─────────────────────────────────────────── */}
        <Section title="Preferences" Icon={ToggleLeft} accent={accent}>
          <ToggleRow
            label="Opt out of analytics"
            desc="Disable session time and platform reporting. Your play data won't be collected."
            checked={prefs.analyticsOptOut}
            onChange={v => updatePref("analyticsOptOut", v)}
            accent={accent}
          />
          <Divider accent={accent} />
          <ToggleRow
            label="Disable auto-update"
            desc="Don't automatically download updates on launch. You can update manually from the versions tab."
            checked={prefs.disableAutoUpdate}
            onChange={v => updatePref("disableAutoUpdate", v)}
            accent={accent}
            // Only allow disabling auto-update if the dev allows rollback
            disabled={!settings.allowVersionRollback}
          />
          {!settings.allowVersionRollback && (
            <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
              Auto-update cannot be disabled — the developer has locked this setting.
            </p>
          )}
        </Section>

        {/* ── Installed versions ─────────────────────────────────────────── */}
        <Section title="Installed Versions" Icon={HardDrive} accent={accent}>
          {localVersions.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--text-faint)" }}>No versions downloaded.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {localVersions.map(v => (
                <InstalledVersionRow
                  key={v.id}
                  version={v}
                  accent={accent}
                  onDelete={() => setLocalVersions(prev => prev.filter(x => x.id !== v.id))}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── Cache ──────────────────────────────────────────────────────── */}
        <Section title="Offline Cache" Icon={Clock} accent={accent}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              {cacheInfo ? (
                <>
                  <p style={{ fontSize: 12, color: "var(--text-primary)" }}>
                    Cached — v{cacheInfo.version}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                    Last updated {cacheInfo.age}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-faint)" }}>No cache stored.</p>
              )}
            </div>
            {cacheInfo && (
              <button
                onClick={handleClearCache}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 8,
                  background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)",
                  color: "#f87171", fontFamily: "'DM Mono',monospace", fontSize: 11, cursor: "pointer",
                }}
              >
                {cacheCleared ? <><Check size={11} /> Cleared</> : <><Trash2 size={11} /> Clear Cache</>}
              </button>
            )}
          </div>
          <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
            The launcher saves a local copy of your game config to start offline. Clear it to force a fresh fetch on next launch.
          </p>
        </Section>

        {/* ── About ──────────────────────────────────────────────────────── */}
        <Section title="About" Icon={Info} accent={accent}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              ["Game",    profile.title],
              ["Version", `v${profile.version}`],
              ["Author",  profile.author],
              ["Built with", "Deploy Launcher"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{label}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{value}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function Section({ title, Icon, accent, children }: {
  title: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "clamp(14px,2vw,20px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon size={14} color={accent} />
        <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          {title}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Divider({ accent }: { accent: string }) {
  return <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />;
}
