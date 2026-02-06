import { motion } from 'motion/react';
import { Trophy, Star, UserPlus, Crown } from 'lucide-react';

interface PlayerStatsPanelProps {
  elo: number;
  level: number;
  currentXp: number;
  maxXp: number;
  rank?: number;
  isGuest?: boolean;
  onSignInClick?: () => void;
}

export function PlayerStatsPanel({ elo, level, currentXp, maxXp, rank, isGuest = false, onSignInClick }: PlayerStatsPanelProps) {
  const xpPercentage = (currentXp / maxXp) * 100;

  return (
    <motion.div
      className="flex items-center gap-4 px-5 py-3 rounded-xl border border-white/10 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08))',
        backdropFilter: 'blur(10px)',
      }}
      whileHover={{
        scale: 1.02,
        borderColor: 'rgba(99, 102, 241, 0.3)',
        boxShadow: '0 0 30px rgba(99, 102, 241, 0.2)',
      }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Subtle glow effect */}
      <div 
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3))',
          filter: 'blur(20px)',
        }}
      />

      {/* Elo Section - conditionally show for guests vs authenticated */}
      <div className="flex items-center gap-2 relative z-10">
        {isGuest ? (
          // Guest message
          <div 
            onClick={onSignInClick}
            className={`flex items-center gap-2 relative z-10 ${onSignInClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
          >
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))',
              }}
            >
              <UserPlus className="w-4 h-4 text-indigo-400" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-white/40 tracking-wider leading-none">RANKED</span>
              <span className="text-[11px] font-semibold text-indigo-300 leading-tight">Sign in to play</span>
            </div>
          </div>
        ) : (
          // Authenticated user Elo display
          <>
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.2))',
              }}
            >
              <Trophy className="w-4 h-4 text-amber-400" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-white/40 tracking-wider leading-none">ELO</span>
              <span className="text-sm font-black text-white tracking-tight leading-none">{elo.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div 
        className="w-px h-10 relative z-10"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)',
        }}
      />

      {/* Rank Section */}
      {rank && !isGuest && (
        <>
          <div className="flex items-center gap-2 relative z-10">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(34, 211, 238, 0.2))',
              }}
            >
              <Crown className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold text-white/40 tracking-wider leading-none">RANK</span>
              <span className="text-sm font-black text-white tracking-tight leading-none">#{rank.toLocaleString()}</span>
            </div>
          </div>

          {/* Divider */}
          <div 
            className="w-px h-10 relative z-10"
            style={{
              background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)',
            }}
          />
        </>
      )}

      {/* Level Section with XP Bar */}
      <div className="flex flex-col gap-1.5 flex-1 relative z-10">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(167, 139, 250, 0.2))',
            }}
          >
            <Star className="w-4 h-4 text-violet-400" strokeWidth={2.5} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-bold text-white/40 tracking-wider">LEVEL</span>
            <span className="text-sm font-black text-white tracking-tight">{level}</span>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="w-full h-1.5 rounded-full overflow-hidden relative bg-white/5">
          {/* Background glow */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.3), rgba(167, 139, 250, 0.3))',
              filter: 'blur(4px)',
            }}
          />
          
          {/* XP Fill */}
          <motion.div
            className="h-full rounded-full relative overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)',
              boxShadow: '0 0 8px rgba(139, 92, 246, 0.6)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${xpPercentage}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              }}
              animate={{
                x: ['-100%', '200%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </motion.div>
        </div>

        {/* XP Text */}
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-bold text-white/30 tracking-wider">
            {currentXp.toLocaleString()} / {maxXp.toLocaleString()} XP
          </span>
          <span className="text-[8px] font-bold text-violet-400/60 tracking-wider">
            {Math.floor(xpPercentage)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}
