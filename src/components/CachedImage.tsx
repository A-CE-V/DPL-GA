/**
 * CachedImage.tsx
 *
 * Drop-in replacement for `<img src={url}>` wherever the launcher displays a
 * dev-supplied image URL (logo, screenshots) — whether that URL points at
 * Firebase Storage or an arbitrary external host the dev pasted in the
 * dashboard. The first time a given URL is seen, it's fetched once and
 * cached to disk on the Rust side (see get_cached_image in media.rs); every
 * later view of that same URL — including across app restarts — is served
 * straight from disk with zero network involved. That's the behavior asked
 * for: "once they see the images the first time, they stay loaded."
 *
 * Falls back to the raw URL when not running inside Tauri (e.g. previewing
 * the launcher in a plain browser), since there's no Rust backend to cache
 * through in that context.
 */
import { useState, useEffect } from "react";
import { getCachedImage, isTauri } from "../lib/ipc";

// In-memory cache on top of the disk cache — avoids a redundant IPC round
// trip when the same URL appears more than once in a single render (e.g.
// the logo shown in two places at once), without waiting on disk I/O again.
const memCache = new Map<string, string>();

export function CachedImage({
  src, alt, style, className, onError,
}: {
  src?:        string | null;
  alt?:        string;
  style?:      React.CSSProperties;
  className?:  string;
  onError?:    () => void;
}) {
  const [resolved, setResolved] = useState<string | null>(src ? memCache.get(src) ?? null : null);
  const [failed,   setFailed]   = useState(false);

  useEffect(() => {
    setFailed(false);

    if (!src) { setResolved(null); return; }

    const cached = memCache.get(src);
    if (cached) { setResolved(cached); return; }

    if (!isTauri()) { setResolved(src); return; } // browser preview — no backend to cache through

    let cancelled = false;
    setResolved(null);
    getCachedImage(src)
      .then(dataUrl => {
        if (cancelled) return;
        memCache.set(src, dataUrl);
        setResolved(dataUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [src]);

  if (!src || failed || !resolved) return null;

  return (
    <img
      src={resolved}
      alt={alt ?? ""}
      style={style}
      className={className}
      onError={() => { setFailed(true); onError?.(); }}
    />
  );
}
