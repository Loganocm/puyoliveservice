import { motion } from 'motion/react';
import { Play, RotateCcw, LogOut } from 'lucide-react';

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
            border: '2px solid rgba(255,255,255,0.2)',
            boxShadow: '0 0 60px rgba(255,255,255,0.1), 0 25px 50px rgba(0,0,0,0.5)',
          }}
        >
          {/* Title */}
          <motion.h1
            className="text-4xl font-black text-center mb-8 tracking-wider text-white"
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
            <motion.button
              className="relative w-full h-14 rounded-xl font-bold text-lg tracking-wider flex items-center justify-center bg-gradient-to-r from-emerald-500 to-green-500 text-black"
              style={{
                boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)',
              }}
              whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(34, 197, 94, 0.6)' }}
              whileTap={{ scale: 0.98 }}
              onClick={onResume}
            >
              <div className="absolute left-6">
                <Play className="w-5 h-5" />
              </div>
              RESUME
            </motion.button>

            <motion.button
              className="relative w-full h-12 rounded-xl font-bold tracking-wider flex items-center justify-center bg-white/10 text-white/80 border border-white/20"
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.15)' }}
              whileTap={{ scale: 0.98 }}
              onClick={onRestart}
            >
              <div className="absolute left-6">
                <RotateCcw className="w-4 h-4" />
              </div>
              RESTART
            </motion.button>

            <motion.button
              className="relative w-full h-12 rounded-xl font-bold tracking-wider flex items-center justify-center bg-red-500/20 text-red-400 border border-red-500/30"
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(239, 68, 68, 0.3)' }}
              whileTap={{ scale: 0.98 }}
              onClick={onExit}
            >
              <div className="absolute left-6">
                <LogOut className="w-4 h-4" />
              </div>
              EXIT
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
