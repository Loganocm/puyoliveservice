import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, Play, Pause, SkipForward } from 'lucide-react';
import { GameEvents } from '../core/GameEvents';
import { BGMManager } from '../core/BGMManager';

interface BGMState {
  isPlaying: boolean;
  songName: string;
  artist: string;
}

export const BGMPlayer: React.FC = () => {
  const [bgmState, setBgmState] = useState<BGMState | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Ref to hold the hide timeout so we can reset it on hover
  const [hideTimeout, setHideTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    const timeout = setTimeout(() => {
      setIsExpanded(false);
    }, 5000);
    setHideTimeout(timeout);
  };

  const clearHideTimer = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      setHideTimeout(null);
    }
  };

  useEffect(() => {
    const handleStateChange = (state: BGMState | null) => {
      setBgmState(state);
      if (state) {
        setIsExpanded(true);
        // Start auto-collapse timer
        resetHideTimer();
      } else {
        setIsExpanded(false);
      }
    };

    GameEvents.on('bgm_state_change', handleStateChange);
    return () => {
      GameEvents.off('bgm_state_change', handleStateChange);
      clearHideTimer();
    };
  }, [hideTimeout]); // include hideTimeout in deps because resetHideTimer uses it

  if (!bgmState) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] pointer-events-auto flex items-end justify-end">
      <AnimatePresence initial={false} mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4 border-b-2 border-b-indigo-500"
            onMouseEnter={clearHideTimer}
            onMouseLeave={resetHideTimer}
          >
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-inner relative overflow-hidden">
              {/* Spinning record / disc element effect inside the album art area */}
              <motion.div 
                animate={{ rotate: bgmState.isPlaying ? 360 : 0 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="w-8 h-8 rounded-full border-2 border-white/20 border-dashed opacity-50" />
              </motion.div>
              <Music className="text-white w-5 h-5 relative z-10" />
            </div>
            
            <div className="flex-1 min-w-[140px] pr-4 border-r border-white/10">
              <div className="text-white font-bold text-sm tracking-wide truncate max-w-[140px]">
                {bgmState.songName}
              </div>
              <div className="text-white/50 text-[10px] uppercase font-bold tracking-widest mt-0.5">
                {bgmState.artist}
              </div>
            </div>
            
            <div className="flex items-center gap-2 pl-2">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (bgmState.isPlaying) BGMManager.pause();
                  else BGMManager.resume();
                }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors border border-white/5 shadow-sm"
              >
                {bgmState.isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-1" />}
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  BGMManager.next();
                }}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
              >
                <SkipForward size={16} fill="currentColor" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsExpanded(true)}
            className="w-12 h-12 bg-indigo-600/80 backdrop-blur-md border border-white/20 rounded-full shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white hover:bg-indigo-500 transition-colors"
          >
            <Music className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
