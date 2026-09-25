import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Gauge } from "lucide-react";
import { GameEvents } from "@/core/GameEvents";

/**
 * Tells the player, once, that their device is not keeping up and that
 * effects were reduced (CLI-20). Without it a slow device just made the game
 * feel wrong, with no hint why.
 */
export function PerfNotice() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWarning = (data: { fps: number }) => {
      setFps(data.fps);
      clearTimeout(timer);
      timer = setTimeout(() => setFps(null), 7000);
    };
    GameEvents.on("perf_warning", onWarning);
    return () => {
      GameEvents.off("perf_warning", onWarning);
      clearTimeout(timer);
    };
  }, []);

  // Kept clear of the board: bottom left on wide screens, where nothing is
  // drawn; one short line above the spawn point on phones. At top centre it
  // used to cover the piece as it spawned.
  return (
    <div className="fixed z-[120] pointer-events-none left-1/2 -translate-x-1/2 top-2 sm:top-auto sm:bottom-4 sm:left-4 sm:translate-x-0">
      <AnimatePresence>
        {fps !== null && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-xs sm:text-sm text-white/85 whitespace-nowrap sm:whitespace-normal sm:max-w-xs"
          >
            <Gauge className="w-4 h-4 shrink-0" style={{ color: "var(--pl-state-warning)" }} />
            <span className="sm:hidden">About {fps} fps: effects reduced</span>
            <span className="hidden sm:inline">
              Running at about {fps} fps, so effects are reduced. Closing other tabs or apps helps.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
