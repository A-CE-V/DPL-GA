/**
 * Watermark.tsx
 *
 * Shown on HomeScreen for Indie/Studio tier games (Solo tier shows the
 * bigger branded splash reveal instead — see SplashScreen.tsx — and does
 * NOT also get this persistent mark, one or the other, not both).
 *
 * - Position is dev-configurable (profile.settings.watermarkPosition),
 *   defaulting to bottom-left.
 * - Cannot be disabled or removed by the dev — always renders when the
 *   tier requires it.
 * - Color auto-inverts based on the launcher's background brightness
 *   (white on dark themes, black on light themes) using the same WCAG
 *   luminance approach already used for the dashboard's TopBar logo.
 * - Links out to a placeholder URL for now (google.com) — swap
 *   PLACEHOLDER_URL for the real destination when ready.
 */
import type { WatermarkPosition } from "../types";

const PLACEHOLDER_URL = "https://www.google.com";

// ─── Luminance helper — identical approach to the dashboard's TopBar ─────────
function hexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const POSITION_STYLE: Record<WatermarkPosition, React.CSSProperties> = {
  "bottom-left":  { left: "var(--safe-margin)",  bottom: "var(--safe-margin)" },
  "bottom-right": { right: "var(--safe-margin)", bottom: "var(--safe-margin)" },
  "top-left":     { left: "var(--safe-margin)",  top: "var(--safe-margin)" },
  "top-right":    { right: "var(--safe-margin)", top: "var(--safe-margin)" },
};

interface WatermarkProps {
  position:  WatermarkPosition | undefined;
  bgColorHex: string; // the launcher's current effective background color, for luminance check
}

export function Watermark({ position, bgColorHex }: WatermarkProps) {
  const resolvedPosition = position ?? "bottom-left";
  const isLight = hexLuminance(bgColorHex) > 0.4;
  const color   = isLight ? "#000000" : "#ffffff";

  return (
    <a
      href={PLACEHOLDER_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "absolute",
        ...POSITION_STYLE[resolvedPosition],
        zIndex: 99998,
        fontFamily: "'DM Mono',monospace",
        fontSize: "var(--text-2xs)",
        color,
        opacity: 0.55,
        textDecoration: "underline",
        textUnderlineOffset: 2,
        letterSpacing: "0.02em",
        pointerEvents: "auto",
        transition: "opacity 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "0.55"; }}
    >
      Made with Deploy's technology
    </a>
  );
}
