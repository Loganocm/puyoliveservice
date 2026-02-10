import { motion } from 'motion/react';
import { Play, RotateCcw, LogOut } from 'lucide-react';
import { GameButton } from '../components/GameButton';

interface PauseScreenProps {
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export function PauseScreen({
  onResume,
  onRestart,
  onExit,
}: PauseScreenProps) {
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
        className="relative w-full max-w-sm mx-4"
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
            border: '2px solid rgba(255,255,255,0.1)',
            boxShadow: '0 0 60px rgba(255,255,255,0.05), 0 25px 50px rgba(0,0,0,0.5)',
          }}
        >
          {/* Title */}
          <motion.h1
            className="text-4xl font-black text-center mb-8 tracking-wider text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            PAUSED
          </motion.h1>

          {/* Buttons */}
          <motion.div
            className="space-y-3"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <GameButton
              variant="primary"
              onClick={onResume}
              icon={Play}
            >
              RESUME
            </GameButton>

            <GameButton
              variant="secondary"
              onClick={onRestart}
              icon={RotateCcw}
            >
              RESTART
            </GameButton>

            <GameButton
              variant="danger"
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
