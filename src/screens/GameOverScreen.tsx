import { motion } from 'motion/react';
import { RotateCcw, LogOut, Trophy, Zap } from 'lucide-react';
import { GameButton } from '../components/GameButton';

interface GameOverScreenProps {
  score: number;
  message: string;
  isTimeTrial?: boolean;
  isMultiplayer?: boolean;
  maxChain?: number;
  puyosCleared?: number;
  onRestart: () => void;
  onExit: () => void;
  xpGained?: number;
}

export function GameOverScreen({
  score,
  message,
  isTimeTrial = false,
  isMultiplayer = false,
  maxChain = 0,
  puyosCleared = 0,
  onRestart,
  onExit,
  xpGained,
}: GameOverScreenProps) {
  const isWin = message === 'YOU WIN!';

  
  // Determine colors based on result
  const titleColor = isTimeTrial 
    ? '#22D3EE' // Cyan for time trial results
    : isWin 
      ? '#22C55E' // Green for win
      : '#EF4444'; // Red for loss
  
  const title = isTimeTrial ? 'RESULTS' : message;
  const restartLabel = isMultiplayer ? 'QUEUE AGAIN' : (isTimeTrial ? 'PLAY AGAIN' : 'RESTART');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Modal */}
      <motion.div
        className="relative w-full max-w-md mx-4"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {/* Card */}
        <div
          className="rounded-3xl p-8 backdrop-blur-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(20,20,30,0.95), rgba(10,10,20,0.98))',
            border: `2px solid ${titleColor}40`,
            boxShadow: `0 0 60px ${titleColor}20, 0 25px 50px rgba(0,0,0,0.5)`,
          }}
        >
          {/* Title */}
          <motion.h1
            className="text-5xl font-black text-center mb-2 tracking-wider"
            style={{ 
              color: titleColor,
              textShadow: `0 0 40px ${titleColor}80`,
            }}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {title}
          </motion.h1>

          {/* Score Section */}
          <motion.div
            className="text-center my-8"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <p className="text-white/60 text-sm font-medium tracking-widest mb-2">
              FINAL SCORE
            </p>
            <p className="text-5xl font-black text-white tabular-nums">
              {score.toLocaleString()}
            </p>
            {xpGained !== undefined && (
              <motion.div 
                className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
              >
                <span className="text-xs font-bold tracking-wider">XP GAINED</span>
                <span className="text-sm font-black text-white">+{xpGained}</span>
              </motion.div>
            )}
          </motion.div>

          {/* Stats for Time Trial */}
          {isTimeTrial && (
            <motion.div
              className="grid grid-cols-2 gap-4 mb-8"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="bg-white/5 rounded-xl p-4 text-center border border-white/10">
                <Zap className="w-5 h-5 mx-auto mb-2 text-yellow-400" />
                <p className="text-white/50 text-xs font-medium tracking-wider">MAX CHAIN</p>
                <p className="text-2xl font-bold text-white">{maxChain}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center border border-white/10">
                <Trophy className="w-5 h-5 mx-auto mb-2 text-purple-400" />
                <p className="text-white/50 text-xs font-medium tracking-wider">CLEARED</p>
                <p className="text-2xl font-bold text-white">{puyosCleared}</p>
              </div>
            </motion.div>
          )}

          {/* Buttons */}
          <motion.div
            className="space-y-3"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <GameButton
              variant="primary"
              onClick={onRestart}
              icon={RotateCcw}
              className={!isWin && !isTimeTrial ? "!from-red-500 !to-red-600 !shadow-red-500/40" : ""}
            >
              {restartLabel}
            </GameButton>

            <GameButton
              variant={isMultiplayer ? "danger" : "secondary"}
              onClick={onExit}
              icon={LogOut}
            >
              EXIT
            </GameButton>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
