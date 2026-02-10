import { motion } from 'motion/react';
import { Clock, Target } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { useMenuInput } from '@/hooks/useMenuInput';

interface SinglePlayerModeSelectProps {
  onSelectMode: (mode: '3min' | '5min' | '10min' | 'practice') => void;
  onBack: () => void;
}

export function SinglePlayerModeSelect({ onSelectMode, onBack }: SinglePlayerModeSelectProps) {
  useMenuInput({ onBack }, [onBack]);

  const modes = [
    { id: '3min' as const, label: '3 MINUTES', icon: Clock },
    { id: '5min' as const, label: '5 MINUTES', icon: Clock },
    { id: '10min' as const, label: '10 MINUTES', icon: Clock },
    { id: 'practice' as const, label: 'PRACTICE', icon: Target },
  ];

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
      
      <BackButton onClick={onBack} />

      <div className="w-full max-w-md px-8">
        <motion.h1 
          className="text-5xl font-black text-white mb-12 tracking-tighter text-center italic drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          SINGLE PLAYER
        </motion.h1>

        <div className="flex flex-col gap-4">
          {modes.map((mode, index) => (
            <motion.button
              key={mode.id}
              className="w-full px-8 py-6 bg-white/5 border border-white/10 rounded-xl text-white font-black text-xl tracking-wider hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer group shadow-lg backdrop-blur-sm"
              onClick={() => onSelectMode(mode.id)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/5 rounded-lg group-hover:bg-[#FF5733]/20 group-hover:text-[#FF5733] transition-colors">
                    <mode.icon className="w-6 h-6" />
                  </div>
                  <span className="group-hover:text-[#FF5733] transition-colors">{mode.label}</span>
              </div>
            </motion.button>
          ))}
        </div>


      </div>
    </div>
  );
}
