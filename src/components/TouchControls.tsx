import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronsDown, RotateCcw, RotateCw, Pause } from "lucide-react";
import { Input } from "@/core/Input";
import { SceneManager } from "@/core/SceneManager";
import type { GameAction } from "@/core/ControlsManager";

/** Whether to show on-screen controls: touch-first devices, or when forced on. */
export function wantsTouchControls(): boolean {
  try {
    const forced = localStorage.getItem("puyolive_touch_controls");
    if (forced === "1") return true;
    if (forced === "0") return false;
  } catch { /* storage unavailable */ }
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

/**
 * On-screen controls for phones and tablets.
 *
 * Each button is an action held for as long as the finger stays on it, fed
 * through the same latched input path as a key (Input.pressVirtual), so DAS,
 * ARR and taps behave exactly as they do on a keyboard. Pointer capture keeps
 * a hold alive when the finger drifts off the button; `touch-action: none`
 * stops the browser scrolling or zooming mid-game.
 *
 * The controls report their height so the match layout keeps the board above
 * them (SceneManager.reservedBottom).
 */
export function TouchControls({ canPause }: { canPause: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () => SceneManager.setReservedBottom(el.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => {
      observer.disconnect();
      Input.releaseAllVirtual();
      SceneManager.setReservedBottom(0);
    };
  }, []);

  return (
    <>
      {canPause && (
        <div className="fixed right-3 z-40 pointer-events-auto" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <Pad action="pause" label="Pause" fixed={48}><Pause size={22} /></Pad>
        </div>
      )}
      <div
        ref={root}
        className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-between px-3 pt-3 pointer-events-auto select-none"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
          touchAction: "none",
          // One row of six buttons (the drop a size up) always fits the
          // screen's width: 54 px on a 412 px phone, up to 72 px on a tablet.
          ["--pad" as string]: "clamp(42px, calc((100vw - 84px) / 6.3), 72px)",
        }}
      >
        <div className="flex items-end gap-2">
          <Pad action="moveLeft" label="Move left"><ChevronLeft size={28} /></Pad>
          <Pad action="softDrop" label="Soft drop"><ChevronDown size={28} /></Pad>
          <Pad action="moveRight" label="Move right"><ChevronRight size={28} /></Pad>
        </div>
        <div className="flex items-end gap-2">
          <Pad action="rotateCCW" label="Rotate left"><RotateCcw size={24} /></Pad>
          <Pad action="rotateCW" label="Rotate right"><RotateCw size={24} /></Pad>
          <Pad action="hardDrop" label="Hard drop" big accent><ChevronsDown size={32} /></Pad>
        </div>
      </div>
    </>
  );
}

function Pad({ action, label, children, big = false, fixed, accent = false }: {
  action: GameAction; label: string; children: ReactNode; big?: boolean; fixed?: number; accent?: boolean;
}) {
  const size = fixed !== undefined ? `${fixed}px` : big ? "calc(var(--pad) * 1.3)" : "var(--pad)";
  const [down, setDown] = useState(false);
  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    Input.pressVirtual(action);
    setDown(true);
    if (action === "hardDrop") navigator.vibrate?.(8);
  };
  const release = () => {
    Input.releaseVirtual(action);
    setDown(false);
  };
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={e => e.preventDefault()}
      className="flex items-center justify-center rounded-full border transition-transform duration-75"
      style={{
        width: size,
        height: size,
        touchAction: "none",
        WebkitTapHighlightColor: "transparent",
        color: "var(--pl-text-primary)",
        background: down
          ? (accent ? "var(--pl-accent-primary)" : "rgba(255,255,255,0.22)")
          : (accent ? "color-mix(in srgb, var(--pl-accent-primary) 55%, transparent)" : "rgba(255,255,255,0.08)"),
        borderColor: "rgba(255,255,255,0.14)",
        transform: down ? "scale(0.94)" : "scale(1)",
        backdropFilter: "blur(6px)",
      }}
    >
      {children}
    </button>
  );
}
