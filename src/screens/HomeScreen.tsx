import { useState, useEffect, useRef } from "react";
import {
  Play, Download, ChevronDown, X, Check,
  Globe, MessageCircle, Twitter, Github, Trash2, Settings, WifiOff,
  ArrowUpCircle, Loader, ShieldCheck, RotateCcw, Sparkles, Wrench, AlertTriangle, FileText,
} from "lucide-react";
import { FaItchIo, FaYoutube } from "react-icons/fa";
import { CachedImage } from "../components/CachedImage";
import { Modal } from "../components/Modal";
import { MarqueeText } from "../components/MarqueeText";
import { MediaGallery } from "../components/MediaGallery";
import {
  startDownload, getProgress, cancelDownload, launchGame, isGameRunning,
  getInstalledVersion, deleteVersion, checkUrl, isTauri,
  type DownloadProgress,
} from "../lib/ipc";
import { fetchVersions, fetchChangelog, fetchMedia, GAME_ID, logSession } from "../lib/firebase";
import { checkForLauncherUpdate, type LauncherUpdate } from "../lib/updater";
import { loadPrefs, savePrefs } from "./SettingsScreen";
import { Watermark } from "../components/Watermark";
import type { GameConfig, GameVersion, ChangelogEntry, GameMedia, Platform, CanvasComponent, ChangelogType } from "../types";

// ─── Platform detection ───────────────────────────────────────────────────────
function getCurrentPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win"))    return "windows";
  if (ua.includes("mac"))    return "mac";
  if (ua.includes("linux"))  return "linux";
  if (ua.includes("android") || ua.includes("iphone")) return "mobile";
  return "windows";
}

// ─── Custom font injection (unchanged — already correct) ─────────────────────
const CUSTOM_FONT_STYLE_ID = "deploy-launcher-custom-font";

function injectCustomFont(fontName: string, fontUrl: string): void {
  document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();
  const ext = fontUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "ttf";
  const fmtMap: Record<string, string> = { ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" };
  const format = fmtMap[ext] ?? "truetype";
  const style = document.createElement("style");
  style.id = CUSTOM_FONT_STYLE_ID;
  style.textContent = `@font-face { font-family:'${fontName}'; src:url('${fontUrl}') format('${format}'); font-weight:100 900; font-style:normal; font-display:swap; }`;
  document.head.appendChild(style);
}
function removeCustomFont(): void {
  document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();
}

// ─── Safe-margin clamp for canvas layouts ─────────────────────────────────────
// FIX: enforces the 10px barrier even on canvasLayout data that predates
// this feature (or was crafted by hand) — no element's bounding box can
// end up positioned outside the safe area, regardless of source.
const SAFE_MARGIN_PX = 10;
function clampToSafeArea(comp: CanvasComponent, canvasW: number, canvasH: number) {
  const x = Math.min(Math.max(comp.x, SAFE_MARGIN_PX), Math.max(SAFE_MARGIN_PX, canvasW - comp.w - SAFE_MARGIN_PX));
  const y = Math.min(Math.max(comp.y, SAFE_MARGIN_PX), Math.max(SAFE_MARGIN_PX, canvasH - comp.h - SAFE_MARGIN_PX));
  return { ...comp, x, y };
}

// ─── Download status → human copy + icon ──────────────────────────────────────
const DOWNLOAD_STATUS_META: Record<string, { label: string; Icon: React.ComponentType<{ size?: number }> }> = {
  starting:    { label: "Starting...",          Icon: Loader },
  downloading: { label: "Downloading",          Icon: Download },
  resuming:    { label: "Resuming download...", Icon: RotateCcw },
  verifying:   { label: "Verifying integrity...", Icon: ShieldCheck },
  extracting:  { label: "Extracting...",        Icon: Loader },
};

function ProgressBar({ progress, accent }: { progress: DownloadProgress & { status: string }; accent: string }) {
  // FIX — surface a failed download/extraction instead of silently
  // vanishing. See the polling loop above: "error" entries are no longer
  // deleted the instant they appear, so this now actually gets a chance to
  // render. Shows the real message from the Rust side (checksum mismatch,
  // invalid archive, network failure, etc.) instead of a generic state.
  if (progress.status === "error") {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--text-xs)", color: "#f87171", fontFamily: "'DM Mono',monospace", lineHeight: 1.4 }}>
        <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{progress.error ?? "Download failed."}</span>
      </div>
    );
  }

  const pct   = Math.round(progress.percent);
  const speed = progress.speed_kbps > 0 ? (progress.speed_kbps > 1024 ? `${(progress.speed_kbps / 1024).toFixed(1)} MB/s` : `${Math.round(progress.speed_kbps)} KB/s`) : "";
  const mb    = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;
  const meta  = DOWNLOAD_STATUS_META[progress.status] ?? DOWNLOAD_STATUS_META.downloading;
  // FIX — "extracting" used to be lumped in as indeterminate (a fixed 40%
  // shimmer, no real numbers) because the Rust side only reported progress
  // once, at the very start, with no updates for the rest of a call that
  // could run 30s-2min+ on a large archive. It now reports real per-entry
  // progress (see extract_zip_with_progress in download.rs), so it belongs
  // with the other real-progress states instead.
  const isIndeterminate = progress.status === "starting" || progress.status === "verifying";
  const isExtracting    = progress.status === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "'DM Mono',monospace" }}>
          <meta.Icon size={11} />
          {isIndeterminate ? meta.label : `${pct}% ${speed ? "· " + speed : ""}`}
        </span>
        {!isIndeterminate && progress.total > 0 && (
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
            {isExtracting ? `${progress.downloaded} / ${progress.total} files` : `${mb(progress.downloaded)} / ${mb(progress.total)}`}
          </span>
        )}
      </div>
      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3, transition: "width 0.3s ease",
          width: isIndeterminate ? "40%" : `${pct}%`,
          background: `linear-gradient(90deg, ${accent}99, ${accent})`,
          animation: isIndeterminate ? "shimmer 1.1s ease infinite" : "none",
        }} />
      </div>
    </div>
  );
}

// FIX — was an inline banner pinned to the top of the screen, dismissible
// and easy to miss. Now a proper modal — "a window telling about a new
// update", as asked for — using the same install-state logic as before.
function UpdateBanner({ update, accent, onDismiss }: { update: LauncherUpdate; accent: string; onDismiss: () => void }) {
  const [installing, setInstalling] = useState(false);
  return (
    <Modal onClose={installing ? undefined : onDismiss}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <ArrowUpCircle size={26} color={accent} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "var(--text-md)", color: "var(--text-primary)" }}>Launcher update available</p>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>v{update.version}</p>
        </div>
      </div>
      {update.notes && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 18, maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap" }}>
          {update.notes}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {!installing && (
          <button onClick={onDismiss} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: "var(--text-sm)", cursor: "pointer" }}>
            Later
          </button>
        )}
        <button onClick={async () => { setInstalling(true); try { await update.download(); } catch { setInstalling(false); } }} disabled={installing} style={{ flex: installing ? 1 : 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 8, border: "none", background: accent, color: "#000", fontFamily: "'Syne',sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, cursor: installing ? "default" : "pointer", opacity: installing ? 0.75 : 1 }}>
          {installing ? <><Loader size={13} style={{ animation: "spin 0.65s linear infinite" }} /> Installing...</> : <><ArrowUpCircle size={13} /> Install & Restart</>}
        </button>
      </div>
    </Modal>
  );
}

// NEW — download confirmation, per your request: a prompt before every
// download starts instead of it firing immediately, with a "don't ask
// again" checkbox that persists to the same PlayerPrefs SettingsScreen
// reads/writes (skipDownloadConfirm).
function DownloadConfirmModal({
  version, title, accent, onConfirm, onCancel,
}: {
  version: GameVersion; title: string; accent: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = () => {
    if (dontAskAgain) savePrefs({ ...loadPrefs(), skipDownloadConfirm: true });
    onConfirm();
  };

  return (
    <Modal onClose={onCancel}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Download size={26} color={accent} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "var(--text-md)", color: "var(--text-primary)" }}>Download {title}?</p>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>v{version.tag}</p>
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, cursor: "pointer", userSelect: "none" }}>
        <input
          type="checkbox" checked={dontAskAgain}
          onChange={e => setDontAskAgain(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: accent, cursor: "pointer", flexShrink: 0 }}
        />
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "'DM Mono',monospace" }}>
          Don't ask me again
        </span>
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: "var(--text-sm)", cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={handleConfirm} style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 8, border: "none", background: accent, color: "#000", fontFamily: "'Syne',sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, cursor: "pointer" }}>
          <Download size={13} /> Download
        </button>
      </div>
    </Modal>
  );
}

const SMALL_BTN: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: "var(--text-xs)", cursor: "pointer" };

function buildSocials(socials: GameConfig["socials"]) {
  return [
    { key: "discord", url: socials.discord, Icon: MessageCircle, label: "Discord"   },
    { key: "twitter", url: socials.twitter, Icon: Twitter,       label: "X/Twitter" },
    { key: "youtube", url: socials.youtube, Icon: FaYoutube,     label: "YouTube"   },
    { key: "github",  url: socials.github,  Icon: Github,        label: "GitHub"    },
    { key: "itch",    url: socials.itch,    Icon: FaItchIo,      label: "Itch.io"   },
    { key: "website", url: socials.website, Icon: Globe,         label: "Website"   },
  ].filter(s => !!s.url);
}

// ─── Changelog type meta — now with icons, not just a color dot ──────────────
const CHANGELOG_TYPE_META: Record<ChangelogType, { color: string; Icon: React.ComponentType<{ size?: number; color?: string }>; label: string }> = {
  feature:  { color: "#22c55e", Icon: Sparkles,      label: "Feature"  },
  fix:      { color: "#60a5fa", Icon: Wrench,        label: "Fix"      },
  breaking: { color: "#f87171", Icon: AlertTriangle, label: "Breaking" },
  other:    { color: "#94a3b8", Icon: FileText,      label: "Other"    },
};

// FIX — the changelog "no information" bug.
// The old rendering had no `whiteSpace` set on the expanded body text —
// CSS collapses newlines by default, so any patch notes a dev wrote with
// line breaks or simple bullet lists rendered as one squished paragraph,
// which is very likely what read as "no information at all". Adding
// `whiteSpace: "pre-wrap"` preserves the dev's actual formatting exactly
// as written. Separation by unique entry.id (not version) was already
// correct in the dashboard's save logic — nothing to change there.
function ChangelogCard({ entry, expanded, onToggle, accent }: {
  entry: ChangelogEntry; expanded: boolean; onToggle: () => void; accent: string;
}) {
  const meta = CHANGELOG_TYPE_META[entry.type] ?? CHANGELOG_TYPE_META.other;
  return (
    <div style={{ background: "var(--bg-surface)", border: `1px solid ${expanded ? meta.color + "33" : "var(--border)"}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.15s" }}>
      <button onClick={onToggle} style={{ width: "100%", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${meta.color}16`, border: `1px solid ${meta.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <meta.Icon size={13} color={meta.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "var(--text-base)", fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</p>
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: 2 }}>v{entry.version} · {entry.date}</p>
        </div>
        <span style={{ fontSize: "var(--text-2xs)", padding: "3px 8px", borderRadius: 5, background: `${meta.color}18`, color: meta.color, fontFamily: "'DM Mono',monospace", fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{meta.label}</span>
        <ChevronDown size={13} color="var(--text-muted)" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>
      {expanded && (
        entry.body?.trim() ? (
          <p style={{
            padding: "0 14px 14px 50px", fontSize: "var(--text-sm)", color: "var(--text-secondary)",
            lineHeight: 1.75, whiteSpace: "pre-wrap",
          }}>
            {entry.body}
          </p>
        ) : (
          <p style={{ padding: "0 14px 14px 50px", fontSize: "var(--text-xs)", color: "var(--text-muted)", fontStyle: "italic" }}>
            No description provided for this entry.
          </p>
        )
      )}
    </div>
  );
}

interface LayoutProps {
  config: GameConfig; fromCache: boolean; platform: Platform;
  versions: GameVersion[]; changelog: ChangelogEntry[]; media: GameMedia[];
  installing: Record<string, DownloadProgress>; installed: Record<string, boolean>;
  running: Record<string, boolean>;
  launching: boolean; expanded: string | null; mediaIdx: number;
  refreshing: boolean; refreshResult: "idle" | "updated" | "current"; onRefresh: () => void;
  onDownload: (v: GameVersion) => void; onCancel: (tag: string) => void;
  onDelete: (tag: string) => void; onLaunch: (tag?: string) => void;
  onSettings: () => void;
  setExpanded: (id: string | null) => void; setMediaIdx: (i: number) => void;
}

function TierWatermark({ profile, settings }: { profile: GameConfig["profile"]; settings: GameConfig["settings"] }) {
  const tier = profile.licenseType ?? "solo";
  if (tier === "solo") return null;
  const bg = profile.customTheme?.bg ?? profile.bannerColor ?? "#040704";
  return <Watermark position={settings.watermarkPosition} bgColorHex={bg} />;
}

// ════════════════════════════════════════════════════════════════════════════
// CANVAS LAYOUT RENDERER
// ════════════════════════════════════════════════════════════════════════════
function LayoutCanvas(p: LayoutProps) {
  const { config, fromCache, versions, media, changelog, installing, installed, running, launching, expanded, refreshing, refreshResult, onRefresh } = p;
  const { profile, settings, socials } = config;
  const accent  = profile.accentColor;
  const latest  = versions[0];
  const isRunning = !!(latest && running[latest.tag]);
  const canLaunch = latest && installed[latest.tag] && !launching && !isRunning;
  const SOCIALS = buildSocials(socials);
  const CANVAS_W = 900, CANVAS_H = 600;
  const layout  = (profile.canvasLayout ?? []).map(c => clampToSafeArea(c, CANVAS_W, CANVAS_H));
  const sorted  = [...layout].sort((a, b) => a.zIndex - b.zIndex);

  const renderComponent = (comp: CanvasComponent) => {
    const style: React.CSSProperties = { position: "absolute", left: comp.x, top: comp.y, width: comp.w, height: comp.h, zIndex: comp.zIndex, overflow: "hidden" };
    switch (comp.type) {
      case "game-title":
        // NEW — hideTitle lets a dev rely on their logo instead; skip
        // rendering entirely rather than an empty box taking up space.
        if (profile.hideTitle) return null;
        return <div key={comp.id} style={style}><MarqueeText text={profile.title} style={{ fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontSize: Math.max(14, comp.h * 0.55), fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1 }} /></div>;
      case "author-label":
        return <div key={comp.id} style={style}><p style={{ fontFamily: "'DM Mono',monospace", fontSize: Math.max(10, comp.h * 0.45), color: "var(--text-muted)" }}>by {profile.author} · v{profile.version}</p></div>;
      case "game-description":
        return <div key={comp.id} style={{ ...style, overflowY: "auto" }}><p style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.7 }}>{profile.description}</p></div>;
      case "launch-button": {
        const dl = latest && installing[latest.tag];
        return <div key={comp.id} style={style}>{dl ? (
          <div style={{ width: "100%", height: "100%", background: "var(--bg-surface)", borderRadius: 8, padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button onClick={() => latest && p.onCancel(latest.tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={11} /></button></div>
            {latest && <ProgressBar progress={dl} accent={accent} />}
          </div>
        ) : (
          <button onClick={() => canLaunch ? p.onLaunch() : !isRunning && latest && p.onDownload(latest)} disabled={launching || isRunning} style={{ width: "100%", height: "100%", borderRadius: 8, border: "none", background: isRunning ? "var(--bg-elevated)" : canLaunch ? accent : `${accent}22`, color: isRunning ? "var(--text-secondary)" : canLaunch ? "#000" : accent, fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontSize: Math.max(12, comp.h * 0.3), fontWeight: 800, cursor: isRunning ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {launching ? "Launching..." : isRunning ? <><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 1.4s ease infinite" }} /> Running</> : canLaunch ? <><Play size={Math.min(18, comp.h * 0.35)} fill="currentColor" /> Launch</> : <><Download size={Math.min(16, comp.h * 0.3)} /> Download</>}
          </button>
        )}</div>;
      }
      case "version-badge":
        return latest ? <div key={comp.id} style={{ ...style, display: "flex", alignItems: "center" }}><span style={{ fontSize: "var(--text-2xs)", padding: "3px 10px", borderRadius: 99, background: `${accent}18`, color: accent, fontFamily: "'DM Mono',monospace", fontWeight: 700, border: `1px solid ${accent}33`, whiteSpace: "nowrap" }}>{latest.status === "stable" ? <Check size={9} style={{ display: "inline", verticalAlign: "-1px" }} /> : <AlertTriangle size={9} style={{ display: "inline", verticalAlign: "-1px" }} />} v{latest.tag}</span></div> : null;
      case "media-carousel":
        return <div key={comp.id} style={{ ...style, borderRadius: 8, overflow: "hidden" }}>
          <MediaGallery
            media={media} accent={accent}
            mode={profile.mediaDisplayMode} autoAdvance={profile.mediaAutoAdvance} autoAdvanceSeconds={profile.mediaAutoAdvanceSeconds}
            activeIdx={p.mediaIdx} onActiveIdxChange={p.setMediaIdx}
          />
        </div>;
      case "social-links":
        return <div key={comp.id} style={{ ...style, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {SOCIALS.map(({ key, url, Icon, label }) => <a key={key} href={url} target="_blank" rel="noopener noreferrer" title={label} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: Math.min(30, comp.h * 0.8), height: Math.min(30, comp.h * 0.8), borderRadius: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", textDecoration: "none", transition: "all 0.12s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.color = accent; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}><Icon size={12} /></a>)}
        </div>;
      case "settings-button":
        return <div key={comp.id} style={style}><button onClick={p.onSettings} style={{ width: "100%", height: "100%", borderRadius: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.color = accent; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}><Settings size={Math.min(16, comp.w * 0.4)} /></button></div>;
      case "update-button":
        return <div key={comp.id} style={style}>
          <button onClick={onRefresh} disabled={refreshing} title="Check for updates" style={{ width: "100%", height: "100%", borderRadius: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: refreshResult === "updated" ? "#22c55e" : "var(--text-muted)", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'DM Mono',monospace", fontSize: Math.max(9, comp.h * 0.28), fontWeight: 600 }}>
            <RotateCcw size={Math.min(14, comp.h * 0.4)} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none", flexShrink: 0 }} />
            {comp.w > 90 && (refreshing ? "Checking..." : refreshResult === "updated" ? "Updated!" : refreshResult === "current" ? "Up to date" : "Check for Updates")}
          </button>
        </div>;
      case "offline-badge":
        return fromCache ? <div key={comp.id} style={{ ...style, display: "flex", alignItems: "center" }}><div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}><WifiOff size={9} color="#eab308" /><span style={{ fontSize: "var(--text-2xs)", color: "#eab308", fontFamily: "'DM Mono',monospace" }}>offline</span></div></div> : null;
      case "progress-bar":
        return latest && installing[latest.tag] ? <div key={comp.id} style={{ ...style, background: "var(--bg-surface)", borderRadius: 8, padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}><div style={{ display: "flex", justifyContent: "flex-end" }}><button onClick={() => p.onCancel(latest.tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={11} /></button></div><ProgressBar progress={installing[latest.tag]} accent={accent} /></div> : null;
      case "changelog":
        return <div key={comp.id} style={{ ...style, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {changelog.map(e => <ChangelogCard key={e.id} entry={e} expanded={expanded === e.id} onToggle={() => p.setExpanded(expanded === e.id ? null : e.id)} accent={accent} />)}
          {changelog.length === 0 && <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>No changelog entries yet.</p>}
        </div>;
      case "divider":
        return <div key={comp.id} style={style}><div style={{ width: "100%", height: 1, background: "var(--border)" }} /></div>;
      case "spacer":
        return <div key={comp.id} style={style} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "var(--bg-base)", overflow: "hidden", fontFamily: "'DM Mono',monospace" }}>
      {sorted.map(comp => renderComponent(comp))}
      <TierWatermark profile={profile} settings={settings} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LAYOUT 1 — CLASSIC
// ════════════════════════════════════════════════════════════════════════════
function LayoutClassic(p: LayoutProps) {
  const { config, fromCache, versions, changelog, media, installing, installed, running, launching, expanded, mediaIdx, refreshing, refreshResult, onRefresh } = p;
  const { profile, settings, socials } = config;
  const accent = profile.accentColor;
  const latest = versions[0];
  const isRunning = !!(latest && running[latest.tag]);
  const canLaunch = latest && installed[latest.tag] && !launching && !isRunning;
  const SOCIALS = buildSocials(socials);
  const [tab, setTab] = useState<"home" | "versions" | "changelog">("home");

  return (
    <div style={{ height: "100vh", background: "var(--bg-base)", display: "flex", flexDirection: "column", fontFamily: "'DM Mono',monospace" }}>
      <header style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: `12px calc(var(--safe-margin) + 10px)`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <CachedImage src={profile.logoUrl} style={{ width: 30, height: 30, borderRadius: 7, objectFit: "contain", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            {!profile.hideTitle && <MarqueeText text={profile.title} style={{ fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontSize: "var(--text-md)", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }} />}
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>by {profile.author} · v{profile.version}</p>
          </div>
        </div>
        {fromCache && <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", flexShrink: 0 }}><WifiOff size={10} color="#eab308" /><span style={{ fontSize: "var(--text-2xs)", color: "#eab308" }}>offline</span></div>}
        <button onClick={onRefresh} disabled={refreshing} title="Check for updates" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: refreshResult === "updated" ? "#22c55e" : "var(--text-muted)", cursor: refreshing ? "default" : "pointer", flexShrink: 0 }} onMouseEnter={e => { if (!refreshing) { e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.color = accent; } }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = refreshResult === "updated" ? "#22c55e" : "var(--text-muted)"; }}><RotateCcw size={15} style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }} /></button>
        <button onClick={p.onSettings} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.color = accent; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}><Settings size={15} /></button>
      </header>

      <div style={{ display: "flex", gap: 2, padding: `0 calc(var(--safe-margin) + 10px)`, background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {(["home", "versions", "changelog"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "11px 14px", fontSize: "var(--text-sm)", fontFamily: "'DM Mono',monospace", background: "none", border: "none", cursor: "pointer", color: tab === t ? accent : "var(--text-muted)", borderBottom: `2px solid ${tab === t ? accent : "transparent"}`, fontWeight: tab === t ? 600 : 400, textTransform: "capitalize", transition: "all 0.12s" }}>
            {t}
          </button>
        ))}
      </div>

      <div className="dl-scroll-region" style={{ flex: 1, padding: `20px calc(var(--safe-margin) + 10px) calc(var(--safe-margin) + 20px)` }}>
        {tab === "home" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600 }}>
            {profile.description && <p style={{ fontSize: "var(--text-base)", color: "var(--text-secondary)", lineHeight: 1.7 }}>{profile.description}</p>}

            {media.length > 0 && (
              <div style={{ borderRadius: 10, overflow: "hidden", background: "var(--bg-surface)", border: "1px solid var(--border)", aspectRatio: "16/9" }}>
                <MediaGallery
                  media={media} accent={accent}
                  mode={profile.mediaDisplayMode} autoAdvance={profile.mediaAutoAdvance} autoAdvanceSeconds={profile.mediaAutoAdvanceSeconds}
                  activeIdx={mediaIdx} onActiveIdxChange={p.setMediaIdx}
                />
              </div>
            )}

            {latest && (installing[latest.tag] ? (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                <ProgressBar progress={installing[latest.tag]} accent={accent} />
                <button onClick={() => p.onCancel(latest.tag)} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "var(--text-xs)", fontFamily: "'DM Mono',monospace" }}>
                  <X size={11} /> Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => canLaunch ? p.onLaunch() : !isRunning && p.onDownload(latest)}
                disabled={launching || isRunning}
                style={{
                  height: 46, borderRadius: 10, border: "none",
                  background: isRunning ? "var(--bg-elevated)" : canLaunch ? accent : `${accent}22`,
                  color: isRunning ? "var(--text-secondary)" : canLaunch ? "#000" : accent,
                  fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontSize: "var(--text-md)", fontWeight: 700,
                  cursor: isRunning ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "transform 0.1s, filter 0.15s",
                }}
                onMouseDown={e => { if (!isRunning) e.currentTarget.style.transform = "scale(0.98)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {launching
                  ? <><Loader size={16} style={{ animation: "spin 0.65s linear infinite" }} /> Launching...</>
                  : isRunning
                  ? <><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 1.4s ease infinite" }} /> Running</>
                  : canLaunch
                  ? <><Play size={16} fill="currentColor" /> Launch v{latest.tag}</>
                  : <><Download size={15} /> Download v{latest.tag}</>}
              </button>
            ))}

            {SOCIALS.length > 0 && (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 4 }}>
                {SOCIALS.map(({ key, url, Icon, label }) => (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "var(--text-xs)", textDecoration: "none", transition: "all 0.12s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = `${accent}44`; e.currentTarget.style.color = accent; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
                    <Icon size={12} /> {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "versions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
            {versions.map(v => {
              const inProg = installing[v.tag];
              const isInst = installed[v.tag];
              const isLatest = v.id === versions[0]?.id;
              const hasMirrors = v[p.platform].length > 0;
              return (
                <div key={v.id} style={{ background: "var(--bg-surface)", border: `1px solid ${isLatest ? accent + "33" : "var(--border)"}`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: inProg ? 10 : 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--launcher-font,'Syne',sans-serif)", fontSize: "var(--text-md)", fontWeight: 700, color: "var(--text-primary)" }}>v{v.tag}</span>
                        {isLatest && <span style={{ fontSize: "var(--text-2xs)", padding: "2px 6px", borderRadius: 4, background: `${accent}20`, color: accent, fontWeight: 700 }}>LATEST</span>}
                        {v.status === "bugged" && <span style={{ fontSize: "var(--text-2xs)", padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.12)", color: "#f87171", fontWeight: 700 }}>BUGGED</span>}
                        {isInst && <Check size={12} color={accent} />}
                      </div>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2, display: "block" }}>{v.date}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {isInst ? (
                        <>
                          {(settings.allowVersionRollback || isLatest) && (
                            running[v.tag]
                              ? <span style={{ ...SMALL_BTN, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "default" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 1.4s ease infinite" }} /> Running</span>
                              : <button onClick={() => p.onLaunch(v.tag)} style={{ ...SMALL_BTN, background: `${accent}20`, color: accent, border: `1px solid ${accent}33` }}><Play size={11} fill="currentColor" /> Launch</button>
                          )}
                          <button onClick={() => p.onDelete(v.tag)} style={{ ...SMALL_BTN, background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}><Trash2 size={11} /></button>
                        </>
                      ) : inProg ? (
                        <button onClick={() => p.onCancel(v.tag)} style={SMALL_BTN}><X size={11} /> Cancel</button>
                      ) : hasMirrors ? (
                        <button onClick={() => p.onDownload(v)} style={{ ...SMALL_BTN, background: `${accent}20`, color: accent, border: `1px solid ${accent}33` }}><Download size={11} /> Download</button>
                      ) : (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>No {p.platform} build</span>
                      )}
                    </div>
                  </div>
                  {inProg && <ProgressBar progress={inProg} accent={accent} />}
                </div>
              );
            })}
          </div>
        )}

        {tab === "changelog" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
            {changelog.map(e => <ChangelogCard key={e.id} entry={e} expanded={expanded === e.id} onToggle={() => p.setExpanded(expanded === e.id ? null : e.id)} accent={accent} />)}
            {changelog.length === 0 && <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", textAlign: "center", padding: "32px 0" }}>No changelog entries yet.</p>}
          </div>
        )}
      </div>

      <TierWatermark profile={profile} settings={settings} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HomeScreen
// ════════════════════════════════════════════════════════════════════════════
interface Props {
  config: GameConfig; fromCache?: boolean; onOpenSettings: () => void;
  // NEW — App.tsx's own `versions` state (the one passed to SettingsScreen)
  // was never populated by anything — nothing in App.tsx ever fetched it.
  // HomeScreen does the real fetching; this reports its results upward so
  // Settings sees real data instead of a permanently empty array.
  onVersionsUpdate?: (v: GameVersion[]) => void;
}

export function HomeScreen({ config, fromCache = false, onOpenSettings, onVersionsUpdate }: Props) {
  const { profile, settings } = config;
  const platform = getCurrentPlatform();
  const prefs    = loadPrefs();

  const [versions,        setVersions]        = useState<GameVersion[]>([]);
  const [changelog,       setChangelog]        = useState<ChangelogEntry[]>([]);
  const [media,           setMedia]            = useState<GameMedia[]>([]);
  const [mediaIdx,        setMediaIdx]         = useState(0);
  const [installing,      setInstalling]       = useState<Record<string, DownloadProgress>>({});
  const [installed,       setInstalled]        = useState<Record<string, boolean>>({});
  const [running,         setRunning]          = useState<Record<string, boolean>>({});
  const [launching,       setLaunching]        = useState(false);
  const [expanded,        setExpanded]         = useState<string | null>(null);
  const [launcherUpdate,  setLauncherUpdate]   = useState<LauncherUpdate | null>(null);
  // NEW — manual "check for updates" (update-button canvas component +
  // the header icon in the Classic layout). Separate from launcherUpdate
  // above, which is specifically about the launcher binary itself
  // (checkForLauncherUpdate/Tauri's updater plugin) — this is about the
  // game's version/changelog/media data going stale while the launcher is
  // already open, since that data is otherwise only fetched once on mount.
  const [refreshing,      setRefreshing]       = useState(false);
  const [refreshResult,   setRefreshResult]    = useState<"idle" | "updated" | "current">("idle");
  // NEW — auto-fetch feature. gameUpdateNotice holds the new tag when a
  // check reveals the latest published version differs from the one this
  // player last saw (persisted in localStorage — see the effect below), and
  // drives the modal that replaces the old dismiss-and-forget banner.
  const [gameUpdateNotice, setGameUpdateNotice] = useState<string | null>(null);
  // NEW — the version awaiting confirmation in the download modal, or null
  // when none is pending.
  const [pendingDownload, setPendingDownload]  = useState<GameVersion | null>(null);
  const prevRunningRef = useRef<Record<string, boolean>>({});
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    if (profile.customFontUrl && profile.fontFamily) {
      injectCustomFont(profile.fontFamily, profile.customFontUrl);
      document.documentElement.style.setProperty("--launcher-font", `'${profile.fontFamily}', sans-serif`);
    } else if (profile.fontFamily) {
      removeCustomFont();
      const existing = document.querySelector(`link[data-gf="${profile.fontFamily}"]`);
      if (!existing) {
        const safeName = profile.fontFamily.replace(/ /g, "+");
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${safeName}:wght@400;700;800;900&display=swap`;
        link.dataset.gf = profile.fontFamily;
        document.head.appendChild(link);
      }
      document.documentElement.style.setProperty("--launcher-font", `'${profile.fontFamily}', sans-serif`);
    } else {
      removeCustomFont();
      document.documentElement.style.removeProperty("--launcher-font");
    }
  }, [profile.fontFamily, profile.customFontUrl]);

  useEffect(() => { fetchVersions().then(setVersions); fetchChangelog().then(setChangelog); fetchMedia().then(setMedia); }, []);

  // NEW — auto-fetch, part 1: "instantly after opening it". Compares the
  // latest published tag against the last one this player actually saw
  // (persisted per-game in localStorage). Runs whenever `versions` changes
  // — the initial mount fetch, a manual refresh, or the auto-refresh after
  // closing the game below — so it uniformly covers "new since I last had
  // this open" regardless of what triggered the fetch, without popping the
  // modal for a version the player has already been shown before.
  useEffect(() => {
    if (!versions.length) return;
    const latestTag = versions[0].tag;
    const key = `deploy_last_seen_version_${GAME_ID}`;
    const lastSeen = localStorage.getItem(key);
    if (lastSeen && lastSeen !== latestTag) setGameUpdateNotice(latestTag);
    localStorage.setItem(key, latestTag);
  }, [versions]);

  // NEW — auto-fetch, part 2: "after closing the game". Watches for a
  // tracked version's running state going true -> false (a session that
  // just ended) and re-checks both the game's version data and the
  // launcher binary itself right then, rather than waiting for the player
  // to notice and hit the manual refresh button.
  useEffect(() => {
    const prev = prevRunningRef.current;
    const justStopped = Object.keys(prev).some(tag => prev[tag] && !running[tag]);
    if (justStopped) {
      handleRefresh();
      checkForLauncherUpdate().then(u => { if (u) setLauncherUpdate(u); });
    }
    prevRunningRef.current = running;
  }, [running]);

  // Mirrors versions up to App.tsx whenever it changes (initial load,
  // manual refresh, or the auto-refresh added below) — see the Props
  // comment on onVersionsUpdate for why this exists.
  useEffect(() => { onVersionsUpdate?.(versions); }, [versions, onVersionsUpdate]);
  useEffect(() => { checkForLauncherUpdate().then(u => { if (u) setLauncherUpdate(u); }); }, []);
  useEffect(() => {
    if (!isTauri() || !versions.length) return;
    Promise.all(versions.map(v => getInstalledVersion(GAME_ID, v.tag).then(r => [v.tag, !!r] as const))).then(r => setInstalled(Object.fromEntries(r)));
  }, [versions]);

  // NEW — "Running" button state. Polls is_game_running (real process
  // tracking on the Rust side, not a guess) for every locally-installed
  // version every 2s. Only polls installed tags — cheap enough at that
  // interval and count that per-tag "was this ever launched" bookkeeping
  // isn't worth the extra complexity.
  useEffect(() => {
    if (!isTauri()) return;
    const installedTags = Object.keys(installed).filter(t => installed[t]);
    if (installedTags.length === 0) { setRunning({}); return; }

    let cancelled = false;
    const poll = () => {
      Promise.all(installedTags.map(t =>
        isGameRunning(GAME_ID, t).then(r => [t, r] as const).catch(() => [t, false] as const)
      )).then(results => { if (!cancelled) setRunning(Object.fromEntries(results)); });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [installed]);
  useEffect(() => {
    const latest = versions[0];
    if (!latest || !settings.autoUpdateOnLaunch || prefs.disableAutoUpdate) return;
    if (!installed[latest.tag] && !installing[latest.tag]) handleDownload(latest);
  }, [versions, installed]);

  // FIX: polling now runs every 400ms instead of 800ms while a download is
  // active — combined with the immediate "starting" state set synchronously
  // on click (see handleDownload below), this closes the dead-feeling gap
  // between clicking Download and seeing the first real progress update.
  useEffect(() => {
    const activeKeys = Object.keys(installing).filter(k => ["downloading", "resuming", "verifying", "extracting", "starting"].includes(installing[k].status));
    if (!activeKeys.length) return;
    const timer = setInterval(async () => {
      const updates: Record<string, DownloadProgress> = {};
      await Promise.all(activeKeys.map(async tag => { const pr = await getProgress(GAME_ID, tag).catch(() => null); if (pr) updates[tag] = pr; }));
      setInstalling(prev => {
        const next = { ...prev, ...updates };
        for (const k of Object.keys(next)) {
          if (next[k].status === "done") { setInstalled(ins => ({ ...ins, [k]: true })); delete next[k]; }
          // FIX — "error" used to be deleted here immediately, same as
          // "cancelled". That meant a failed download or a corrupt/invalid
          // archive (e.g. a mirror serving an HTML page instead of the real
          // file) looked identical to nothing having happened — the button
          // just silently reset with zero feedback. Errors now stay in
          // state so ProgressBar can show the actual message; the existing
          // cancel (X) button doubles as the dismiss action. Deliberate
          // cancellations are unaffected — still cleared right away.
          else if (next[k].status === "cancelled") { delete next[k]; }
        }
        return next;
      });
    }, 400);
    return () => clearInterval(timer);
  }, [installing]);

  useEffect(() => {
    return () => {
      if (!prefs.analyticsOptOut && settings.collectAnalytics) {
        const min = Math.round((Date.now() - sessionStart.current) / 60_000);
        if (min > 0) logSession({ platform, version: profile.version, durationMin: min });
      }
    };
  }, []);

  // NEW — the actual download-starting logic, now only called after
  // confirmation (see handleDownload below) rather than directly from the
  // Download button.
  const startDownloadFlow = async (v: GameVersion) => {
    const mirrors = v[platform];
    if (!mirrors.length) return;

    let chosen = mirrors[0];
    if (isTauri()) {
      for (const m of mirrors) {
        const ok = await checkUrl(m.url).catch(() => false);
        if (ok) { chosen = m; break; }
      }
    }

    // FIX — instant feedback on click. Previously the button gave zero
    // visual response until the first 800ms poll tick landed, which is
    // exactly why it could feel like "clicking a stone." This synchronous
    // state update happens the instant the click handler runs, before any
    // network request even starts.
    setInstalling(prev => ({ ...prev, [v.tag]: { downloaded: 0, total: 0, percent: 0, speed_kbps: 0, status: "starting" } }));

    // FIX — passes the dev-supplied SHA-256 (if any) through so the Rust
    // side verifies the download's integrity before extracting.
    await startDownload(GAME_ID, v.tag, chosen.url, chosen.sha256).catch(err => {
      console.error(err);
      setInstalling(prev => { const n = { ...prev }; delete n[v.tag]; return n; });
    });
  };

  // NEW — confirmation gate. Shows a modal before every download unless
  // the player has previously ticked "don't ask again" (persisted in the
  // same PlayerPrefs SettingsScreen already reads/writes).
  const handleDownload = (v: GameVersion) => {
    if (loadPrefs().skipDownloadConfirm) { startDownloadFlow(v); return; }
    setPendingDownload(v);
  };

  const handleCancel = async (tag: string) => { await cancelDownload(GAME_ID, tag).catch(console.error); setInstalling(prev => { const n = { ...prev }; delete n[tag]; return n; }); };
  const handleDelete = async (tag: string) => { await deleteVersion(GAME_ID, tag).catch(console.error); setInstalled(prev => ({ ...prev, [tag]: false })); };

  // NEW — manual refresh. versions/changelog/media are otherwise only
  // fetched once on mount (see the useEffect above), so a player who has
  // the launcher open when a dev publishes a new version wouldn't see it
  // without restarting the app. Compares the latest tag before and after
  // to report whether anything actually changed.
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult("idle");
    const prevLatestTag = versions[0]?.tag;
    try {
      const [freshVersions] = await Promise.all([
        fetchVersions(),
        fetchChangelog().then(setChangelog).catch(() => {}),
        fetchMedia().then(setMedia).catch(() => {}),
      ]);
      setVersions(freshVersions);
      setRefreshResult(freshVersions[0]?.tag && freshVersions[0].tag !== prevLatestTag ? "updated" : "current");
    } catch (e) {
      console.error("[HomeScreen] refresh failed:", e);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshResult("idle"), 4000);
    }
  };
  // FIX — previously always called launchGame with no exeName, so it
  // relied 100% on Rust's find_executable auto-detection. GameVersion now
  // carries an optional dev-configured executable name per platform (set
  // in the dashboard's Builds & Versions section) — look it up and pass it
  // through when present; falls back to auto-detect exactly as before when
  // the dev hasn't set one for this version.
  const handleLaunch = async (tag?: string) => {
    const t = tag ?? versions[0]?.tag;
    if (!t) return;
    const v = versions.find(ver => ver.tag === t);
    const exeName = platform === "windows" ? v?.windowsExeName
      : platform === "mac"   ? v?.macExeName
      : platform === "linux" ? v?.linuxExeName
      : undefined;
    setLaunching(true);
    try {
      await launchGame(GAME_ID, t, exeName);
      // Optimistic — the real poll (every 2s) will confirm/correct this,
      // but without it there'd be a gap between the 3s "Launching..."
      // window ending and the next poll tick where the button could flash
      // back to "Launch" even though the game did start successfully.
      setRunning(prev => ({ ...prev, [t]: true }));
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setLaunching(false), 3000);
  };

  const layoutProps: LayoutProps = {
    config, fromCache, platform, versions, changelog, media,
    installing, installed, running, launching, expanded, mediaIdx,
    refreshing, refreshResult, onRefresh: handleRefresh,
    onDownload: handleDownload, onCancel: handleCancel,
    onDelete: handleDelete, onLaunch: handleLaunch,
    onSettings: onOpenSettings,
    setExpanded, setMediaIdx,
  };

  return (
    <>
      {profile.canvasLayout?.length ? <LayoutCanvas {...layoutProps} /> : <LayoutClassic {...layoutProps} />}

      {launcherUpdate && (
        <UpdateBanner update={launcherUpdate} accent={profile.accentColor} onDismiss={() => setLauncherUpdate(null)} />
      )}

      {pendingDownload && (
        <DownloadConfirmModal
          version={pendingDownload}
          title={profile.title}
          accent={profile.accentColor}
          onConfirm={() => { const v = pendingDownload; setPendingDownload(null); startDownloadFlow(v); }}
          onCancel={() => setPendingDownload(null)}
        />
      )}

      {/* NEW — game version update notice. See the last-seen-version effect
          above for when this actually fires. Intentionally only informs —
          closing it returns to the normal screen where Download goes
          through the confirmation modal like any other download, rather
          than this modal auto-starting one itself. */}
      {gameUpdateNotice && (
        <Modal onClose={() => setGameUpdateNotice(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <Sparkles size={26} color={profile.accentColor} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "var(--text-md)", color: "var(--text-primary)" }}>New version available</p>
              <p style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>v{gameUpdateNotice}</p>
            </div>
          </div>
          {changelog[0]?.body && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 18, maxHeight: 140, overflowY: "auto" }}>
              {changelog[0].body}
            </p>
          )}
          <button onClick={() => setGameUpdateNotice(null)} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: profile.accentColor, color: "#000", fontFamily: "'Syne',sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, cursor: "pointer" }}>
            Got it
          </button>
        </Modal>
      )}
    </>
  );
}
