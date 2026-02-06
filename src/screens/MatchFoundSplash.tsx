import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';

interface MatchFoundSplashProps {
  playerName: string;
  playerElo: number;
  opponentName: string;
  opponentElo: number;
  onCountdownComplete?: () => void;
}

export function MatchFoundSplash({ 
  playerName, 
  playerElo, 
  opponentName, 
  opponentElo,
  onCountdownComplete 
}: MatchFoundSplashProps) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onCountdownComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onCountdownComplete]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        />

        {/* Content */}
        <motion.div
          className="relative z-10"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Match Starting Header */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="text-sm font-bold text-white/60 tracking-[0.3em] mb-2">MATCH STARTING</div>
            <div className="w-32 h-1 bg-gradient-to-r from-transparent via-[#FF5733] to-transparent mx-auto" />
          </motion.div>

          {/* Players Matchup */}
          <div className="flex items-center gap-12 mb-12">
            {/* Player 1 */}
            <motion.div
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center mb-3 border-2 border-white/20">
                <span className="text-3xl font-black text-white">P</span>
              </div>
              <div className="text-base font-black text-white mb-1">{playerName}</div>
              <div className="text-xs font-bold text-white/60">({playerElo === 0 ? 'UNRANKED' : playerElo})</div>
            </motion.div>

            {/* VS */}
            <motion.div
              className="flex flex-col items-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5, type: 'spring', stiffness: 200 }}
            >
              <div className="text-4xl font-black text-[#FF5733] tracking-wider">VS</div>
            </motion.div>

            {/* Player 2 */}
            <motion.div
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#EC4899] to-[#F472B6] flex items-center justify-center mb-3 border-2 border-white/20">
                <span className="text-3xl font-black text-white">P</span>
              </div>
              <div className="text-base font-black text-white mb-1">{opponentName}</div>
              <div className="text-xs font-bold text-white/60">({opponentElo === 0 ? 'UNRANKED' : opponentElo})</div>
            </motion.div>
          </div>

          {/* Countdown */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <motion.div
              key={countdown}
              className="text-8xl font-black text-white mb-2"
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                textShadow: '0 0 40px rgba(255, 87, 51, 0.8)',
              }}
            >
              {countdown}
            </motion.div>
            <div className="text-sm font-bold text-white/40 tracking-widest">GET READY</div>
          </motion.div>
        </motion.div>

        {/* Animated particles/glow effect */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255, 87, 51, 0.15), transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
