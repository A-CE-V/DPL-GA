/**
 * MediaGallery.tsx
 *
 * Shared media display for both the Canvas Editor's media-carousel
 * component and the Classic layout's media section. Three layout modes,
 * dev-configurable in the dashboard (profile.mediaDisplayMode):
 *
 *   - "carousel" (default): one image at a time, arrow buttons on both
 *     sides, dot indicators below.
 *   - "big-row":  one big image with the rest as a thumbnail row below it.
 *   - "big-left": same, but thumbnails stacked in a column on the left.
 *
 * All three support optional auto-advance (profile.mediaAutoAdvance +
 * mediaAutoAdvanceSeconds) on top of the manual controls, never instead of
 * them.
 */
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CachedImage } from "./CachedImage";
import type { GameMedia } from "../types";

export type MediaDisplayMode = "carousel" | "big-row" | "big-left";

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute", top: "50%", [side]: 8, transform: "translateY(-50%)",
    width: 30, height: 30, borderRadius: "50%", border: "none",
    background: "rgba(0,0,0,0.45)", color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
    backdropFilter: "blur(4px)", padding: 0,
  };
}

const THUMB_BTN: React.CSSProperties = {
  flexShrink: 0, borderRadius: 6, overflow: "hidden", padding: 0, cursor: "pointer",
};

export function MediaGallery({
  media, mode = "carousel", accent,
  autoAdvance = false, autoAdvanceSeconds = 5,
  activeIdx, onActiveIdxChange,
  style,
}: {
  media:               GameMedia[];
  mode?:               MediaDisplayMode;
  accent:              string;
  autoAdvance?:        boolean;
  autoAdvanceSeconds?: number;
  activeIdx:           number;
  onActiveIdxChange:   (i: number) => void;
  style?:              React.CSSProperties;
}) {
  const safeIdx = media.length ? ((activeIdx % media.length) + media.length) % media.length : 0;
  const goPrev  = () => onActiveIdxChange((safeIdx - 1 + media.length) % media.length);
  const goNext  = () => onActiveIdxChange((safeIdx + 1) % media.length);

  useEffect(() => {
    if (!autoAdvance || media.length <= 1) return;
    const id = setInterval(goNext, Math.max(1, autoAdvanceSeconds) * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, autoAdvanceSeconds, safeIdx, media.length]);

  if (!media.length) {
    return <div style={{ width: "100%", height: "100%", borderRadius: 8, background: "linear-gradient(135deg, var(--accent-1), var(--bg-base))", ...style }} />;
  }

  const current = media[safeIdx];

  const Arrows = () => media.length > 1 ? (
    <>
      <button onClick={goPrev} aria-label="Previous image" style={arrowStyle("left")}><ChevronLeft size={16} /></button>
      <button onClick={goNext} aria-label="Next image" style={arrowStyle("right")}><ChevronRight size={16} /></button>
    </>
  ) : null;

  const Dots = () => media.length > 1 ? (
    <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4, zIndex: 2 }}>
      {media.map((_, i) => (
        <button key={i} onClick={() => onActiveIdxChange(i)} aria-label={`Go to image ${i + 1}`} style={{ width: i === safeIdx ? 16 : 6, height: 6, borderRadius: 3, border: "none", padding: 0, background: i === safeIdx ? accent : "rgba(255,255,255,0.35)", cursor: "pointer", transition: "all 0.2s" }} />
      ))}
    </div>
  ) : null;

  if (mode === "big-row") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", height: "100%", ...style }}>
        <div style={{ position: "relative", flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" }}>
          <CachedImage src={current.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <Arrows />
        </div>
        {media.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, height: "22%" }}>
            {media.map((m, i) => (
              <button key={m.id} onClick={() => onActiveIdxChange(i)} style={{ ...THUMB_BTN, height: "100%", aspectRatio: "16/9", border: i === safeIdx ? `2px solid ${accent}` : "2px solid transparent", opacity: i === safeIdx ? 1 : 0.6 }}>
                <CachedImage src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (mode === "big-left") {
    return (
      <div style={{ display: "flex", gap: 6, width: "100%", height: "100%", ...style }}>
        {media.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flexShrink: 0, width: "22%" }}>
            {media.map((m, i) => (
              <button key={m.id} onClick={() => onActiveIdxChange(i)} style={{ ...THUMB_BTN, width: "100%", aspectRatio: "16/9", border: i === safeIdx ? `2px solid ${accent}` : "2px solid transparent", opacity: i === safeIdx ? 1 : 0.6 }}>
                <CachedImage src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        )}
        <div style={{ position: "relative", flex: 1, minWidth: 0, borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)" }}>
          <CachedImage src={current.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <Arrows />
        </div>
      </div>
    );
  }

  // "carousel" — default
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", ...style }}>
      <CachedImage src={current.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <Arrows />
      <Dots />
    </div>
  );
}
