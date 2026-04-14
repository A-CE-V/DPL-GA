import { useEffect, useState, useCallback } from "react";
import { WifiOff, ShieldX, RefreshCw, Clock } from "lucide-react";
import { checkIPBan, checkMACBan, getClientIP, fetchGameConfig } from "../lib/firebase";
import { applyTheme, getTheme }                                  from "../lib/themes";
import { loadConfigCache, cacheAge }                             from "../lib/cache";
import { getMacAddress, isTauri }                                from "../lib/ipc";
import { GAME_ID }                                               from "../lib/firebase";
import type { GameConfig }                                       from "../types";

type Status = "animating" | "checking" | "no-internet" | "banned" | "ok";

interface Props {
  onReady: (config: GameConfig, fromCache?: boolean) => void;
}

// ─── Status overlay ───────────────────────────────────────────────────────────
function StatusScreen({
  Icon, iconColor, title, body, action,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  iconColor: string; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div style={{ ...FULL, background: "#020402", animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 340, textAlign: "center", padding: 24 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: `${iconColor}14`, border: `1px solid ${iconColor}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={26} color={iconColor} />
        </div>
        <p style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{title}</p>
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#475569", lineHeight: 1.7 }}>{body}</p>
        {action}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function SplashScreen({ onReady }: Props) {
  const [status,     setStatus]    = useState<Status>("animating");
  const [visible,    setVisible]   = useState(false);
  const [banReason,  setBanReason] = useState("");
  const [usingCache, setUsingCache] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTimeout(() => setVisible(true), 60));
    const t     = setTimeout(() => setStatus("checking"), 600);
    return () => { cancelAnimationFrame(frame); clearTimeout(t); };
  }, []);

  const proceedWithCache = useCallback((cached: NonNullable<Awaited<ReturnType<typeof loadConfigCache>>>) => {
    const theme = getTheme(cached.config.profile?.themeId ?? "terminal");
    applyTheme(theme);
    setUsingCache(true);
    setStatus("ok");
    setTimeout(() => onReady(cached.config, true), 200);
  }, [onReady]);

  const runChecks = useCallback(async () => {
    // ── 1. Load cache early as fallback ───────────────────────────────────────
    const cached = await loadConfigCache(GAME_ID);

    // ── 2. Offline fast-path ──────────────────────────────────────────────────
    if (!navigator.onLine) {
      if (cached) { proceedWithCache(cached); return; }
      setStatus("no-internet");
      return;
    }

    try {
      // ── 3. Connectivity check + IP + MAC all fired in parallel ────────────
      // MAC address requires Tauri; in web/dev mode it gracefully returns null.
      const [connOk, ip, macInfo] = await Promise.all([
        fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(2500) })
          .then(() => true).catch(() => false),
        getClientIP(),
        isTauri() ? getMacAddress().catch(() => null) : Promise.resolve(null),
      ]);

      if (!connOk) {
        if (cached) { proceedWithCache(cached); return; }
        setStatus("no-internet");
        return;
      }

      // ── 4. Ban checks — IP and MAC in parallel ────────────────────────────
      const [ipBan, macBan] = await Promise.all([
        checkIPBan(ip),
        macInfo?.mac ? checkMACBan(macInfo.mac) : Promise.resolve({ banned: false }),
      ]);

      if (ipBan.banned) {
        setBanReason(ipBan.reason ?? "");
        setStatus("banned");
        return;
      }
      if (macBan.banned) {
        setBanReason(macBan.reason ?? "");
        setStatus("banned");
        return;
      }

      // ── 5. Fetch fresh config ─────────────────────────────────────────────
      const config = await fetchGameConfig();
      if (!config) {
        if (cached) { proceedWithCache(cached); return; }
        setStatus("no-internet");
        return;
      }

      applyTheme(getTheme(config.profile?.themeId ?? "terminal"));
      setStatus("ok");
      setTimeout(() => onReady(config, false), 200);

    } catch {
      if (cached) { proceedWithCache(cached); return; }
      setStatus("no-internet");
    }
  }, [onReady, proceedWithCache]);

  useEffect(() => {
    if (status === "checking") runChecks();
  }, [status, runChecks]);

  // ── Status screens ──────────────────────────────────────────────────────────
  if (status === "no-internet") return (
    <StatusScreen
      Icon={WifiOff} iconColor="#ef4444"
      title="No Internet Connection"
      body="Deploy Launcher needs an internet connection to start for the first time. Check your connection and try again."
      action={
        <button onClick={() => setStatus("checking")} style={BTN_STYLE}>
          <RefreshCw size={13} /> Retry
        </button>
      }
    />
  );

  if (status === "banned") return (
    <StatusScreen
      Icon={ShieldX} iconColor="#ef4444"
      title="Access Denied"
      body={banReason || "Your access to this game has been restricted. Contact support if you think this is a mistake."}
    />
  );

  // ── Splash animation ────────────────────────────────────────────────────────
  return (
    <div style={{
      ...FULL, background: "#020402",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      opacity:    status === "ok" ? 0 : 1,
      transition: status === "ok" ? "opacity 0.3s ease" : "none",
    }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        opacity:    visible ? 1 : 0,
        filter:     visible ? "blur(0px)"  : "blur(18px)",
        transform:  visible ? "scale(1)"   : "scale(0.93)",
        transition: "opacity 0.9s cubic-bezier(0.4,0,0.2,1), filter 0.9s ease, transform 0.9s ease",
        willChange: "opacity, filter, transform",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20, overflow: "hidden",
          background: "#020402",
          animation: visible ? "pulse-glow 3s ease-in-out infinite" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img src="/images/logo-icon.png" alt="Deploy"
            style={{ width: 72, height: 72, objectFit: "contain", mixBlendMode: "screen" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <img src="/images/logo-title.png" alt="Deploy"
            style={{ height: 28, width: "auto", objectFit: "contain", mixBlendMode: "screen", opacity: 0.9 }} />
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#22c55e", opacity: 0.5, letterSpacing: "0.26em", textTransform: "uppercase" }}>
            Launcher
          </span>
        </div>
      </div>

      {status === "checking" && visible && (
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(34,197,94,0.15)", borderTopColor: "#22c55e", animation: "spin 0.65s linear infinite" }} />
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "rgba(34,197,94,0.4)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            checking...
          </span>
        </div>
      )}

      {usingCache && visible && (
        <div style={{
          position: "absolute", bottom: 24,
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 99,
          background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.18)",
        }}>
          <Clock size={11} color="#eab308" />
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#eab308", letterSpacing: "0.1em" }}>
            offline · cached data
          </span>
        </div>
      )}
    </div>
  );
}

const FULL: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 9999,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const BTN_STYLE: React.CSSProperties = {
  marginTop: 6, display: "flex", alignItems: "center", gap: 8,
  padding: "9px 20px", borderRadius: 9, border: "none",
  background: "#22c55e", color: "#000",
  fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer",
};
