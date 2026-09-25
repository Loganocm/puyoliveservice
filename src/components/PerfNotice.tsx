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

  return (
    <AnimatePresence>
      {fps !== null && (
        <motion.div
          role="status"
          className="fixed left-1/2 top-4 z-[120] -translate-x-1/2 pointer-events-none"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
        >
          <div className="flex items-start gap-3 max-w-[92vw] sm:max-w-md px-4 py-3 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 text-sm text-white/85">
            <Gauge className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--pl-state-warning, #FFB23F)" }} />
            <p>
              Running at about {fps} fps, so effects are reduced. Closing other tabs or apps helps the game run smoothly.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
