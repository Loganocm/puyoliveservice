import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Keyboard, Gamepad2 } from 'lucide-react';
import { ControlsManager } from '@/core/ControlsManager';
import type { GameAction } from '@/core/ControlsManager';
import { SoundManager } from '@/core/SoundManager';

interface ControlsScreenProps {
  onBack: () => void;
}

export function ControlsScreen({ onBack }: ControlsScreenProps) {
  const [mode, setMode] = useState<'keyboard' | 'controller'>('keyboard');

  const [listeningFor, setListeningFor] = useState<string | null>(null);
  // const [bindings, setBindings] = useState(...) // Unused, direct manager access used in render
  // const [bindings, setBindings] = useState(() => mode === 'keyboard' ? ControlsManager.getAllBindings() : ControlsManager.getAllControllerBindings());

  // Force refresh bindings when mode changes
  // Force refresh bindings when mode changes
  const [, setUpdateTrigger] = useState(0);

  const handleReset = () => {
    ControlsManager.resetToDefaults();
    setUpdateTrigger(prev => prev + 1);
    SoundManager.play('click');
  };

  const handleBindClick = (action: string) => {
    if (listeningFor === action) {
        setListeningFor(null); // Toggle off
    } else {
        setListeningFor(action); // Set listening
        SoundManager.play('click');
    }
  };

  // Key Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!listeningFor || mode !== 'keyboard') return;
        
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
            setListeningFor(null);
            return;
        }

        // Bind it
        // We know listeningFor is a valid action key string, but TS might not.
        // Cast to GameAction
        ControlsManager.setKey(listeningFor as any, e.code);
        SoundManager.play('click'); // Need confirm sound?
        setListeningFor(null);
        setUpdateTrigger(prev => prev + 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningFor, mode]);

  // Controller Listener (Simple Polling or Event)
  // For now we only implement Keyboard re-binding fully requested in prompt "click on inputs to bind them".
  // Controller binding usually requires Gamepad API polling. 
  // I will focus on Keyboard binding first as it's the most common request context here.

  const actions: GameAction[] = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotateCCW', 'rotateCW'];

  const controls = actions.map(action => {
      const isListening = listeningFor === action;
      let keyDisplay = '---';
      if (mode === 'keyboard') {
          keyDisplay = ControlsManager.getKeyName(ControlsManager.getKey(action));
      } else {
          keyDisplay = ControlsManager.getKeyName(ControlsManager.getControllerKey(action));
      }

      return {
          action: ControlsManager.getActionName(action).toUpperCase(),
          key: isListening ? 'PRESS KEY...' : keyDisplay,
          rawAction: action,
          highlight: isListening
      };
  });

  return (
    <div className="size-full relative overflow-hidden bg-transparent flex items-center justify-center">
      {/* Background effects */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-xl px-8">
        <motion.h1 
          className="text-3xl font-black text-white mb-8 tracking-tight text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          CONTROLS
        </motion.h1>

        {/* Mode Toggle */}
        <motion.div
          className="flex gap-3 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <button
            className={`flex-1 py-3 px-4 rounded-lg font-black text-sm tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
              mode === 'keyboard'
                ? 'bg-[#FF5733] text-white border-2 border-[#FF5733]'
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            }`}
            onClick={() => setMode('keyboard')}
          >
            <Keyboard className="w-4 h-4" />
            KEYBOARD
          </button>
          <button
            className={`flex-1 py-3 px-4 rounded-lg font-black text-sm tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
              mode === 'controller'
                ? 'bg-[#FF5733] text-white border-2 border-[#FF5733]'
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            }`}
            onClick={() => setMode('controller')}
          >
            <Gamepad2 className="w-4 h-4" />
            CONTROLLER
          </button>
        </motion.div>

        {/* Info Text for Controller */}
        {mode === 'controller' && (
          <motion.div
            className="text-xs text-white/40 text-center mb-6 font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            PRESS WHAT YOU WANT!
          </motion.div>
        )}

        {/* Controls List */}
        <motion.div
          className="space-y-3 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {controls.map((control, index) => (
            <motion.div
              key={control.rawAction}
              onClick={() => handleBindClick(control.rawAction as string)}
              className={`flex items-center justify-between p-4 bg-white/5 border rounded-lg transition-all duration-200 cursor-pointer ${
                  control.highlight 
                  ? 'border-[#FF5733] bg-[#FF5733]/10' 
                  : 'border-white/10 hover:bg-white/10'
              }`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 + index * 0.03 }}
            >
              <div className="text-sm font-bold text-white tracking-wider">{control.action}</div>
              <div className={`px-4 py-2 rounded font-black text-sm min-w-[120px] text-center transition-colors ${
                  control.highlight
                  ? 'bg-[#FF5733] text-white animate-pulse'
                  : 'bg-black/30 border border-[#FF5733]/30 text-[#FF5733]'
              }`}>
                {control.key}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Buttons */}
        <div className="space-y-4">
          <motion.button
            className="w-full px-6 py-3 bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white hover:bg-white/10 font-bold text-sm tracking-wider uppercase transition-all duration-200 cursor-pointer"
            onClick={handleReset}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.4 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            RESET TO DEFAULTS
          </motion.button>

          <motion.button
            className="w-full px-6 py-3 text-white/60 hover:text-white font-bold text-sm tracking-wider uppercase transition-colors duration-200 cursor-pointer"
            onClick={onBack}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            BACK
          </motion.button>
        </div>
      </div>
    </div>
  );
}
