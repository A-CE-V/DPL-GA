/**
 * SplashScreen.tsx
 *
 * FIX — the "Deploy watermark" the dev asked to remove.
 * Previously this screen showed the big centered Deploy logo/wordmark
 * unconditionally on every single boot, regardless of tier. Now:
 *   - Everyone sees a neutral, unbranded loading indicator by default
 *     (no Deploy logo at all) while connectivity/ban checks run.
 *   - ONLY once the game's config is fetched and profile.licenseType is
 *     "solo" (the cheapest tier) does the branded Deploy reveal play,
 *     briefly, before continuing — this is the intentional "watermark
 *     just for the cheapest tier" behavior.
 *   - Indie/Studio tier skip the branded reveal entirely and transition
 *     straight through. They instead get a small persistent
 *     "Made with Deploy's technology" mark on HomeScreen (see
 *     components/Watermark.tsx) — one or the other, never both.
 *   - Missing/undefined licenseType defaults to the Solo behavior (safest
 *     — never accidentally skips branding for an old game doc that
 *     predates this field).
 */
import { useEffect, useState, useCallback } from "react";
import { WifiOff, ShieldX, RefreshCw, Clock } from "lucide-react";
import { checkIPBan, checkMACBan, getClientIP, fetchGameConfig } from "../lib/firebase";
import { applyTheme, getTheme }                                  from "../lib/themes";
import { loadConfigCache, cacheAge }                             from "../lib/cache";
import { getMacAddress, isTauri }                                from "../lib/ipc";
import { GAME_ID }                                               from "../lib/firebase";
import type { GameConfig }                                       from "../types";

type Status = "animating" | "checking" | "no-internet" | "banned" | "brand-reveal" | "ok";

interface Props {
  onReady: (config: GameConfig, fromCache?: boolean) => void;
}

const BRAND_REVEAL_MS = 1300; // how long the Solo-tier branded logo plays before continuing

// ─── Status overlay (unchanged — errors are never branded either way) ────────
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
        <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "var(--text-lg)", fontWeight: 700, color: "#f1f5f9" }}>{title}</p>
        <p style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: 1.7 }}>{body}</p>
        {action}
      </div>
    </div>
  );
}

// ─── Neutral loading indicator — shown by default, no branding at all ────────
function NeutralLoader({ label }: { label?: string }) {
  return (
    <div style={{ ...FULL, background: "#020402" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "fadeIn 0.4s ease" }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.4)", animation: "spin 0.7s linear infinite" }} />
        {label && (
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-xs)", color: "rgba(255,255,255,0.28)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function SplashScreen({ onReady }: Props) {
  const [status,      setStatus]      = useState<Status>("animating");
  const [banReason,   setBanReason]   = useState("");
  const [usingCache,  setUsingCache]  = useState(false);
  const [pendingReady, setPendingReady] = useState<{ config: GameConfig; fromCache: boolean } | null>(null);

  // ── Decide whether this tier gets the branded reveal or skips straight through
  const finishBoot = useCallback((config: GameConfig, fromCache: boolean) => {
    const tier = config.profile?.licenseType ?? "solo"; // undefined defaults to the safest/most-restrictive
    if (tier === "solo") {
      setUsingCache(fromCache);
      setPendingReady({ config, fromCache });
      setStatus("brand-reveal");
    } else {
      setStatus("ok");
      setTimeout(() => onReady(config, fromCache), 180);
    }
  }, [onReady]);

  // Once the brand-reveal has played long enough, actually proceed.
  useEffect(() => {
    if (status !== "brand-reveal" || !pendingReady) return;
    const t = setTimeout(() => {
      setStatus("ok");
      setTimeout(() => onReady(pendingReady.config, pendingReady.fromCache), 180);
    }, BRAND_REVEAL_MS);
    return () => clearTimeout(t);
  }, [status, pendingReady, onReady]);

  useEffect(() => {
    const t = setTimeout(() => setStatus("checking"), 350);
    return () => clearTimeout(t);
  }, []);

  const proceedWithCache = useCallback((cached: NonNullable<Awaited<ReturnType<typeof loadConfigCache>>>) => {
    const theme = getTheme(cached.config.profile?.themeId ?? "terminal");
    applyTheme(theme);
    finishBoot(cached.config, true);
  }, [finishBoot]);

  const runChecks = useCallback(async () => {
    const cached = await loadConfigCache(GAME_ID);

    if (!navigator.onLine) {
      if (cached) { proceedWithCache(cached); return; }
      setStatus("no-internet");
      return;
    }

    try {
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

      const [ipBan, macBan] = await Promise.all([
        checkIPBan(ip),
        macInfo?.mac ? checkMACBan(macInfo.mac) : Promise.resolve({ banned: false, reason: undefined }),
      ]);

      if (ipBan.banned) { setBanReason(ipBan.reason ?? ""); setStatus("banned"); return; }
      if (macBan.banned) { setBanReason(macBan.reason ?? ""); setStatus("banned"); return; }

      const config = await fetchGameConfig();
      if (!config) {
        if (cached) { proceedWithCache(cached); return; }
        setStatus("no-internet");
        return;
      }

      applyTheme(getTheme(config.profile?.themeId ?? "terminal"));
      finishBoot(config, false);

    } catch {
      if (cached) { proceedWithCache(cached); return; }
      setStatus("no-internet");
    }
  }, [proceedWithCache, finishBoot]);

  useEffect(() => {
    if (status === "checking") runChecks();
  }, [status, runChecks]);

  // ── Status screens ──────────────────────────────────────────────────────────
  if (status === "no-internet") return (
    <StatusScreen
      Icon={WifiOff} iconColor="#ef4444"
      title="No Internet Connection"
      body="This launcher needs an internet connection to start for the first time. Check your connection and try again."
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

  // ── Default: neutral, unbranded loading (animating / checking / ok-fade) ────
  if (status === "animating" || status === "checking" || status === "ok") {
    return (
      <div style={{ opacity: status === "ok" ? 0 : 1, transition: status === "ok" ? "opacity 0.25s ease" : "none" }}>
        <NeutralLoader label={status === "checking" ? "loading..." : undefined} />
        {usingCache && status === "checking" && (
          <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 99, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.18)" }}>
              <Clock size={11} color="#eab308" />
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-2xs)", color: "#eab308", letterSpacing: "0.1em" }}>offline · cached data</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Solo-tier branded reveal — the ONLY place the Deploy logo still shows ───
  return (
    <div style={{ ...FULL, background: "#020402", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        animation: "fadeInScale 0.9s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, overflow: "hidden", background: "#020402", animation: "pulse-glow 3s ease-in-out infinite", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/images/logo-icon.png" alt="Deploy" style={{ width: 72, height: 72, objectFit: "contain", mixBlendMode: "screen" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <img src="/images/logo-title.png" alt="Deploy" style={{ height: 28, width: "auto", objectFit: "contain", mixBlendMode: "screen", opacity: 0.9 }} />
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: "var(--text-2xs)", color: "#22c55e", opacity: 0.5, letterSpacing: "0.26em", textTransform: "uppercase" }}>
            Launcher
          </span>
        </div>
      </div>
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
  fontFamily: "'Syne',sans-serif", fontSize: "var(--text-sm)", fontWeight: 700, cursor: "pointer",
};
