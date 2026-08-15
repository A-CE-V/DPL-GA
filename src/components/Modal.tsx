/**
 * Modal.tsx
 *
 * Small reusable centered overlay dialog. Used for:
 *   - Launcher/game update notifications (see HomeScreen.tsx) — previously
 *     just a dismissible banner at the top of the screen; this is the more
 *     prominent "window" treatment.
 *   - The download confirmation prompt (see HomeScreen.tsx handleDownload).
 *
 * Click on the dark backdrop closes it (calls onClose) unless onClose is
 * omitted, in which case the modal can only be dismissed by an explicit
 * action inside it (used for cases where a stray click shouldn't lose
 * state, e.g. mid-download-confirmation with a checkbox already ticked).
 */
export function Modal({
  children, onClose, maxWidth = 420,
}: {
  children:  React.ReactNode;
  onClose?:  () => void;
  maxWidth?: number;
}) {
  return (
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
    </div>
  );
}
