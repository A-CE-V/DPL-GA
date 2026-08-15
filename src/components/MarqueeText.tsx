/**
 * MarqueeText.tsx
 *
 * Renders text normally (truncated with an ellipsis) when it fits its
 * container, and switches to a smooth looping horizontal scroll only when
 * it actually overflows — for long game titles that would otherwise get
 * cut off with no way to read the rest.
 *
 * A hidden measuring copy is always rendered so overflow can be detected
 * regardless of which visible variant (static vs scrolling) is currently
 * showing, and re-measures on container resize (canvas components can be
 * resized by the dev in the editor, and window/font-load timing can shift
 * text width after first render).
 */
import { useState, useEffect, useRef } from "react";

export function MarqueeText({
  text, style, speed = 40,
}: {
  text:   string;
  style?: React.CSSProperties;
  speed?: number; // px/sec
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef   = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [duration,    setDuration]    = useState(10);

  useEffect(() => {
    const check = () => {
      if (!containerRef.current || !measureRef.current) return;
      const textWidth = measureRef.current.scrollWidth;
      const boxWidth   = containerRef.current.clientWidth;
      const over = textWidth > boxWidth + 1; // +1 avoids flicker right at the boundary
      setOverflowing(over);
      if (over) setDuration(Math.max(4, (textWidth + 48) / speed));
    };
    check();
    const ro = new ResizeObserver(check);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text, speed]);

  return (
    <div ref={containerRef} style={{ overflow: "hidden", whiteSpace: "nowrap", position: "relative", ...style }}>
      {/* Hidden measuring copy */}
      <span ref={measureRef} style={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap", left: 0, top: 0 }}>
        {text}
      </span>

      {overflowing ? (
        <div style={{ display: "inline-flex", animation: `marquee ${duration}s linear infinite` }}>
          <span style={{ whiteSpace: "nowrap", paddingRight: 48 }}>{text}</span>
          <span aria-hidden style={{ whiteSpace: "nowrap", paddingRight: 48 }}>{text}</span>
        </div>
      ) : (
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {text}
        </span>
      )}
    </div>
  );
}
