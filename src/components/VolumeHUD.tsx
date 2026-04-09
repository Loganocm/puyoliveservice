import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, Music } from "lucide-react";
import { SettingsManager } from "@/core/SettingsManager";
import { SoundManager } from "@/core/SoundManager";
import { BGMManager } from "@/core/BGMManager";

/**
 * VolumeHUD — Global scroll-wheel volume control overlay.
 *
 * Scroll anywhere to adjust master volume. Hold Shift+scroll for BGM volume.
 * Shows a compact HUD that auto-hides after inactivity.
 */
export function VolumeHUD() {
  const [masterVol, setMasterVol] = useState(SettingsManager.masterVolume);
  const [bgmVol, setBgmVol] = useState(SettingsManager.bgmVolume);
  const [visible, setVisible] = useState(false);
  const [activeChannel, setActiveChannel] = useState<"master" | "bgm">(
    "master",
  );
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const showHUD = useCallback((channel: "master" | "bgm") => {
    setActiveChannel(channel);
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1500);
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Don't intercept if user is scrolling an actual scrollable element
      const target = e.target as HTMLElement;
      if (target.closest(".custom-scrollbar, [data-no-volume-scroll]")) return;

      // Don't intercept if user is in an input field
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      )
        return;

      const delta = e.deltaY > 0 ? -5 : 5;
      const isBGM = e.shiftKey;

      if (isBGM) {
        const newVal = Math.max(
          0,
          Math.min(100, SettingsManager.bgmVolume + delta),
        );
        SettingsManager.bgmVolume = newVal;
        SettingsManager.save();
        setBgmVol(newVal);
        BGMManager.updateVolume();
        showHUD("bgm");
      } else {
        const newVal = Math.max(
          0,
          Math.min(100, SettingsManager.masterVolume + delta),
        );
        SettingsManager.masterVolume = newVal;
        SettingsManager.save();
        setMasterVol(newVal);
        SoundManager.updateActiveVolumes();
        BGMManager.updateVolume();
        showHUD("master");
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showHUD]);

  // Sync if settings change externally (e.g., from SettingsScreen)
  useEffect(() => {
    const interval = setInterval(() => {
      if (SettingsManager.masterVolume !== masterVol)
        setMasterVol(SettingsManager.masterVolume);
      if (SettingsManager.bgmVolume !== bgmVol)
        setBgmVol(SettingsManager.bgmVolume);
    }, 500);
    return () => clearInterval(interval);
  }, [masterVol, bgmVol]);

  const vol = activeChannel === "master" ? masterVol : bgmVol;
  const isMuted = vol === 0;
  const Icon = activeChannel === "bgm" ? Music : isMuted ? VolumeX : Volume2;
  const label = activeChannel === "master" ? "VOLUME" : "MUSIC";
  const barColor =
    activeChannel === "master" ? "bg-indigo-500" : "bg-violet-500";
  const glowColor =
    activeChannel === "master"
      ? "shadow-indigo-500/30"
      : "shadow-violet-500/30";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none select-none`}
        >
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 shadow-lg ${glowColor}`}
          >
            <Icon className="w-5 h-5 text-white/80 shrink-0" />
            <div className="flex flex-col gap-1.5 min-w-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  {label}
                </span>
                <span className="text-xs font-bold text-white/70 tabular-nums">
                  {vol}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${barColor}`}
                  initial={false}
                  animate={{ width: `${vol}%` }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
