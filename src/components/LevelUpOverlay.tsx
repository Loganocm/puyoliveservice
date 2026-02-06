import { motion } from 'motion/react';
import { Star, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { SoundManager } from '../core/SoundManager';

interface LevelUpOverlayProps {
  level: number;
  onComplete: () => void;
}

export function LevelUpOverlay({ level, onComplete }: LevelUpOverlayProps) {
  useEffect(() => {
    // Play sound if available
    // SoundManager.play('level_up'); 
    
    // Auto dismiss after animation
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      
      <div className="relative flex flex-col items-center justify-center">
        {/* Burst Effect */}
        <motion.div
           className="absolute"
           initial={{ scale: 0, opacity: 0 }}
           animate={{ scale: [0, 1.5, 2], opacity: [1, 0.5, 0] }}
           transition={{ duration: 1.5, ease: "easeOut" }}
        >
             <div className="w-96 h-96 rounded-full bg-gradient-to-r from-yellow-400 to-indigo-500 blur-3xl opacity-30" />
        </motion.div>

        {/* Level Up Text */}
        <motion.div
          initial={{ y: 50, opacity: 0, scale: 0.5 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative z-10 text-center"
        >
           <motion.h1 
             className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 mb-4 filter drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]"
             animate={{ 
               textShadow: [
                 "0 0 20px rgba(234,179,8,0.5)",
                 "0 0 50px rgba(234,179,8,0.8)",
                 "0 0 20px rgba(234,179,8,0.5)"
               ]
             }}
             transition={{ duration: 2, repeat: Infinity }}
           >
             LEVEL UP!
           </motion.h1>
           
           <motion.div 
             className="flex items-center justify-center gap-4"
             initial={{ scale: 0 }}
             animate={{ scale: 1 }}
             transition={{ delay: 0.3, type: "spring" }}
           >
             <Star className="w-12 h-12 text-yellow-400 fill-yellow-400" />
             <span className="text-6xl font-black text-white">{level}</span>
             <Star className="w-12 h-12 text-yellow-400 fill-yellow-400" />
           </motion.div>
        </motion.div>

        {/* Particles */}
        {[...Array(12)].map((_, i) => (
           <motion.div
             key={i}
             className="absolute"
             initial={{ x: 0, y: 0, opacity: 0 }}
             animate={{ 
               x: (Math.random() - 0.5) * 400,
               y: (Math.random() - 0.5) * 400,
               opacity: [1, 0],
               scale: [0, 1, 0]
             }}
             transition={{ 
               duration: 2, 
               delay: 0.2,
               ease: "easeOut"
             }}
           >
             <Sparkles className="w-6 h-6 text-yellow-200" />
           </motion.div>
        ))}
      </div>
    </div>
  );
}
