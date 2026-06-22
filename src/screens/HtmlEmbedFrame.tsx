/**
 * HtmlEmbedFrame.tsx — Launcher component for html-embed canvas items
 *
 * Renders user-supplied HTML inside a sandboxed iframe.
 * Drop this into the canvas layout renderer in HomeScreen.tsx.
 *
 * Sandbox allows:
 *   - allow-same-origin: lets the iframe read its own content
 *   - allow-forms:       lets embedded forms work
 *   - allow-popups:      lets Discord widgets open invite links
 *
 * Sandbox blocks (by omission):
 *   - allow-scripts:   NO JavaScript execution
 *   - allow-top-navigation: can't redirect the launcher window
 *   - allow-downloads: can't trigger downloads from the widget
 */

interface HtmlEmbedFrameProps {
  htmlContent: string;
  htmlLabel?:  string;
  width:       number;
  height:      number;
}

export function HtmlEmbedFrame({
  htmlContent, htmlLabel, width, height,
}: HtmlEmbedFrameProps) {
  if (!htmlContent?.trim()) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.12)",
        borderRadius: 6,
      }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
          {htmlLabel || "HTML Widget"}
        </span>
      </div>
    );
  }

  // Wrap the user HTML in a minimal document with no external resources
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: transparent;
    color: inherit;
    font-family: inherit;
  }
</style>
</head>
<body>${htmlContent}</body>
</html>`;

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-forms allow-popups"
      title={htmlLabel || "HTML Widget"}
      style={{
        width:  "100%",
        height: "100%",
        border: "none",
        background: "transparent",
        borderRadius: 6,
        display: "block",
      }}
      scrolling="no"
    />
  );
}

/**
 * HOW TO USE IN HomeScreen.tsx
 * ─────────────────────────────
 * In the canvas component renderer (renderComponent / LayoutCanvas),
 * add this case to the switch statement:
 *
 *   import { HtmlEmbedFrame } from "./HtmlEmbedFrame";
 *
 *   case "html-embed":
 *     return (
 *       <div key={comp.id} style={{ position:"absolute", left:comp.x, top:comp.y, width:comp.w, height:comp.h, zIndex:comp.zIndex, overflow:"hidden" }}>
 *         <HtmlEmbedFrame
 *           htmlContent={comp.htmlContent ?? ""}
 *           htmlLabel={comp.htmlLabel}
 *           width={comp.w}
 *           height={comp.h}
 *         />
 *       </div>
 *     );
 *
 * That's the only change needed in HomeScreen.tsx.
 */
