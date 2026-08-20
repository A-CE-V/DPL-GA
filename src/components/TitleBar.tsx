/**
 * TitleBar.tsx
 *
 * Custom titlebar for the rounded-window look (tauri.conf.json:
 * decorations:false). Removing native decorations also removes the native
 * title bar's drag-to-move and its minimize/maximize/close buttons — this
 * is what replaces them. Rendered once at the top level (see main.tsx) so
 * it's present across every screen (splash, home, settings), not
 * per-screen.
 *
 * Circular icon buttons, matching the rounded-corners aesthetic — this was
 * an explicit ask, not just an incidental style choice.
 */
import { useState, useEffect } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { isTauri } from "../lib/ipc";

// FIX — getCurrentWindow() (from @tauri-apps/api/window) reads
// window.__TAURI_INTERNALS__, which only exists inside a real Tauri
// webview. Importing/calling it eagerly would throw in a plain browser
// preview (npm run dev opened directly, no Tauri backend) — a scenario
// this codebase explicitly supports everywhere else via isTauri() guards
// (see ipc.ts). Resolved lazily and only when actually in Tauri; every
// button below no-ops outside it instead of crashing the whole app on
// first render.
let cachedWin: import("@tauri-apps/api/window").Window | null = null;
async function getWin() {
  if (!isTauri()) return null;
  if (!cachedWin) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    cachedWin = getCurrentWindow();
  }
  return cachedWin;
}

function TitleBarButton({
  onClick, danger, children, label,
}: {
  onClick: () => void; danger?: boolean; children: React.ReactNode; label: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={label}
      style={{
        width: 22, height: 22, borderRadius: "50%", border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hover ? (danger ? "#ef4444" : "var(--bg-elevated)") : "transparent",
        color: hover && danger ? "#fff" : "var(--text-muted)",
        cursor: "pointer", flexShrink: 0, transition: "background 0.12s, color 0.12s",
      }}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    getWin().then(w => {
      if (!w || cancelled) return;
      w.isMaximized().then(setMaximized).catch(() => {});
      w.onResized(() => { w.isMaximized().then(setMaximized).catch(() => {}); })
        .then(f => { if (!cancelled) unlisten = f; else f(); })
        .catch(() => {});
    });

    return () => { cancelled = true; unlisten?.(); };
  }, []);

  return (
    <div
      data-tauri-drag-region
      style={{
        height: "var(--titlebar-height)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        gap: 4, padding: "0 8px",
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
      }}
    >
      <TitleBarButton label="Minimize" onClick={() => getWin().then(w => w?.minimize())}>
        <Minus size={12} />
      </TitleBarButton>
      <TitleBarButton label={maximized ? "Restore" : "Maximize"} onClick={() => getWin().then(w => w?.toggleMaximize())}>
        {maximized ? <Copy size={10} style={{ transform: "scaleX(-1)" }} /> : <Square size={10} />}
      </TitleBarButton>
      <TitleBarButton label="Close" danger onClick={() => getWin().then(w => w?.close())}>
        <X size={13} />
      </TitleBarButton>
    </div>
  );
}
