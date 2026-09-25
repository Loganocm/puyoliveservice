import markUrl from "@/resources/brand/mark.svg";

/**
 * The Puyo Live wordmark: the mark plus the name set in the display face.
 * Text, not a picture of text, so it is sharp at any size, themable, and
 * about 1 KB instead of the 505 KB SVG it replaces.
 */
export function Wordmark({ size = 72, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center select-none ${className}`} style={{ gap: size * 0.22 }} role="img" aria-label="Puyo Live">
      <img src={markUrl} alt="" width={size} height={size} draggable={false} />
      <span
        aria-hidden="true"
        className="font-semibold tracking-tight leading-none"
        style={{ fontSize: size * 0.86, textShadow: "0 4px 24px rgba(0,0,0,0.35)" }}
      >
        <span style={{ color: "var(--pl-text-primary)" }}>puyo</span>
        <span style={{ color: "var(--pl-accent-primary)" }}>live</span>
      </span>
    </div>
  );
}
