import { motion } from 'motion/react';
import { Lock, LucideIcon } from 'lucide-react';

interface MenuBannerProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  color?: string; // Hex or tailwind class for border/accents
  gradient?: string; // CSS background style
  delay?: number;
  playerCount?: number;
}

export function MenuBanner({ 
  title, 
  description, 
  icon: Icon, 
  onClick, 
  disabled = false, 
  color = "#ffffff", 
  gradient = "linear-gradient(to right, rgba(255,255,255,0.05), transparent)", 
  delay = 0,
  playerCount
}: MenuBannerProps) {
  
  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      className={`w-full relative group overflow-hidden rounded-xl border border-white/10 text-left transition-all duration-300 ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:border-white/30 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] cursor-pointer'}`}
      style={{
        background: `linear-gradient(90deg, ${color}15 0%, transparent 100%)`, // Fallback
      }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={!disabled ? { scale: 1.02, x: 10 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
    >
      {/* Background Gradient/Image Container */}
      <div 
        className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500"
        style={{ background: gradient }}
      />
      
      {/* Color Accent Bar */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 transition-all duration-300 group-hover:w-3"
        style={{ backgroundColor: color }}
      />

      <div className="relative p-6 pl-10 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
             <h3 className="text-3xl font-black italic tracking-tighter text-white uppercase drop-shadow-md" style={{ textShadow: `0 0 20px ${color}40` }}>
                {title}
             </h3>
             {disabled && <Lock className="w-5 h-5 text-white/50" />}
          </div>
          <p className="text-white/60 font-medium text-sm tracking-wide uppercase">
            {description}
          </p>
        </div>

        {/* Right Side Info */}
        <div className="flex items-center gap-6">
            {playerCount !== undefined && (
                <div className="flex flex-col items-end">
                    <span className="text-2xl font-black text-white">{playerCount}</span>
                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Players</span>
                </div>
            )}
            
            {Icon && (
                <div className="p-4 rounded-lg bg-black/20 border border-white/5 text-white/20 group-hover:text-white group-hover:bg-white/10 group-hover:border-white/20 transition-all duration-300">
                    <Icon className="w-8 h-8" />
                </div>
            )}
        </div>
      </div>
      
      {/* Hover Light Sweep */}
      {!disabled && (
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12" />
      )}
    </motion.button>
  );
}
