import { createPortal } from "react-dom";

/**
 * Modal.tsx
 *
 * Small reusable centered overlay dialog. Used for:
 *   - Launcher/game update notifications (see HomeScreen.tsx) — previously
 *     just a dismissible banner at the top of the screen; this is the more
 *     prominent "window" treatment.
 *   - The download confirmation prompt (see HomeScreen.tsx handleDownload).
 *   - The changelog "dropdown + modal" style's history/detail views.
 *
 * Click on the dark backdrop closes it (calls onClose) unless onClose is
 * omitted, in which case the modal can only be dismissed by an explicit
 * action inside it (used for cases where a stray click shouldn't lose
 * state, e.g. mid-download-confirmation with a checkbox already ticked).
 *
 * FIX — portals to document.body rather than rendering in place. The
 * Canvas Editor's layout renders inside a CSS transform:scale() wrapper
 * (for responsive resizing — see LayoutCanvas). A transform on any
 * ancestor creates a new containing block for position:fixed descendants,
 * so a modal triggered from something inside that scaled tree (the
 * changelog dropdown's history modal, specifically) would otherwise be
 * constrained to the canvas's own coordinate space — squished and
 * mispositioned — instead of covering the real window. Portaling sidesteps
 * this regardless of where a Modal gets triggered from, now or later.
 */
export function Modal({
  children, onClose, maxWidth = 420,
}: {
  children:  React.ReactNode;
  onClose?:  () => void;
  maxWidth?: number;
}) {
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 999999,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, animation: "fadeIn 0.15s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%", maxWidth,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 14, padding: 22,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          animation: "fadeInScale 0.18s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
