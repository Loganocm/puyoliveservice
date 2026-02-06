import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

export function PuyoFooter() {
  return (
    <motion.footer
      className="relative z-10 px-8 py-5 flex items-center justify-between bg-black"
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
            background: 'rgba(99, 102, 241, 0.05)',
            backdropFilter: 'blur(10px)',
          }}
          whileHover={{ 
            scale: 1.02,
            borderColor: 'rgba(99, 102, 241, 0.2)',
          }}
          transition={{ duration: 0.2 }}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-bold text-white/70">v0.1.1</span>
        </motion.div>
        <span className="text-xs text-white/40">© 2026 PUYO LIVE</span>
      </div>

      {/* Center - Social/Links */}
      <div className="flex items-center gap-2">
        {/* Discord & Twitter (Buttons) */}
        {['Discord', 'Twitter'].map((link, index) => (
          <motion.button
            key={link}
            className="px-3 py-1.5 rounded-md text-xs font-bold text-white/60 hover:text-white border border-white/5 cursor-pointer"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              backdropFilter: 'blur(10px)',
            }}
            whileHover={{ 
              scale: 1.03,
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.7 + index * 0.05 }}
          >
            {link}
          </motion.button>
        ))}
        {/* About / Legal Link */}
        <motion.a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md text-xs font-bold text-white/60 hover:text-white border border-white/5 cursor-pointer flex items-center justify-center no-underline"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              backdropFilter: 'blur(10px)',
            }}
            whileHover={{ 
              scale: 1.03,
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.8 }}
        >
            About
        </motion.a>
      </div>

      {/* Right side - Status */}
      <div className="flex items-center gap-2">
        <motion.div
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [1, 0.6, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)',
          }}
        />
        <span className="text-xs font-bold text-white/60">All systems operational</span>
      </div>
    </motion.footer>
  );
}
