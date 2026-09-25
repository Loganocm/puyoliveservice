import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { MusicChip } from "@/components/BGMPlayer";
import { NetworkManager } from "@/core/NetworkManager";

/** Whether the game server connection is up, following connects and drops. */
function useOnline(): boolean {
  const [online, setOnline] = useState(NetworkManager.isConnected);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    NetworkManager.on("connect", up);
    NetworkManager.on("disconnect", down);
    return () => {
      NetworkManager.off("connect", up);
      NetworkManager.off("disconnect", down);
    };
  }, []);
  return online;
}

export function PuyoFooter() {
  const online = useOnline();
  return (
    <motion.footer
      className="relative z-10 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 bg-black/80"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.6 }}
    >
      {/* Competitive Top Border Blend */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent blur-sm" />
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-transparent to-black/50 pointer-events-none -translate-y-full" />
      {/* Left side - Version info */}
      <div className="flex items-center gap-3">
        <motion.div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10"
          style={{
            background: "rgba(99, 102, 241, 0.05)",
            backdropFilter: "blur(10px)",
          }}
          whileHover={{
            scale: 1.02,
            borderColor: "rgba(99, 102, 241, 0.2)",
          }}
          transition={{ duration: 0.2 }}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-white/70">v{__APP_VERSION__}</span>
        </motion.div>
        <span className="hidden sm:inline text-xs text-white/40">© 2026 PUYO LIVE</span>
      </div>

      {/* Center - Social/Links */}
      <div className="flex items-center gap-2">
        {/* Discord */}
        <motion.a
          href="https://discord.gg/PkPdZJufDN"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-md text-xs font-bold text-white/60 hover:text-white border border-white/5 cursor-pointer no-underline"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(10px)",
          }}
          whileHover={{
            scale: 1.03,
            background: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.7 }}
        >
          Discord
        </motion.a>
        {/* About / Legal Link */}
        <motion.a
          href="/about"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-md text-xs font-bold text-white/60 hover:text-white border border-white/5 cursor-pointer flex items-center justify-center no-underline"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(10px)",
          }}
          whileHover={{
            scale: 1.03,
            background: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.8 }}
        >
          About
        </motion.a>
      </div>

      {/* Right side - music and the real connection state (this used to be
          a hard-coded "All systems operational" that was always green). */}
      <div className="flex items-center gap-3 min-w-0">
        <MusicChip />
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: online ? "var(--pl-state-success, #3DDC97)" : "var(--pl-state-danger, #FF5A5A)",
              boxShadow: `0 0 6px ${online ? "rgba(61,220,151,0.6)" : "rgba(255,90,90,0.6)"}`,
            }}
          />
          <span className="text-xs font-bold text-white/60">{online ? "Online" : "Offline"}</span>
        </div>
      </div>
    </motion.footer>
  );
}
