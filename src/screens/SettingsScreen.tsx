import { motion } from 'motion/react';
import { useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { SettingsManager } from '@/core/SettingsManager';
import { SoundManager } from '@/core/SoundManager';

interface SettingsScreenProps {
  onOpenControls: () => void;
  onBack: () => void;
}

import { BackButton } from '@/components/BackButton';
import { useMenuInput } from '@/hooks/useMenuInput';

// ...

export function SettingsScreen({ onOpenControls, onBack }: SettingsScreenProps) {
  useMenuInput({ onBack }, [onBack]);

  // ... existing state and logic ...
  const [das, setDas] = useState(SettingsManager.das);
  const [arr, setArr] = useState(SettingsManager.arr);
  const [softDrop, setSoftDrop] = useState(SettingsManager.sdf);
  const [masterVol, setMasterVol] = useState(SettingsManager.masterVolume);

  const updateSetting = (setter: (val: number) => void, key: keyof typeof SettingsManager, value: number) => {
    setter(value);
    // @ts-ignore - Dynamic access to static properties
    SettingsManager[key] = value;
    
    if (key === 'masterVolume') {
      SoundManager.updateActiveVolumes();
    }
  };

  const saveSettings = () => {
    SettingsManager.save();
  };

  const settings = [
    { 
      id: 'das', 
      label: 'DAS', 
      description: 'DELAYED AUTO SHIFT', 
      value: das, 
      setValue: (v: number) => updateSetting(setDas, 'das', v), 
      min: 0, 
      max: 100,
      color: '#FF5733'
    },
    { 
      id: 'arr', 
      label: 'ARR', 
      description: 'AUTO REPEAT RATE', 
      value: arr, 
      setValue: (v: number) => updateSetting(setArr, 'arr', v), 
      min: 0, 
      max: 100,
      color: '#FF5733'
    },
    { 
      id: 'softDrop', 
      label: 'SOFT DROP', 
      description: 'VELOCITY', 
      value: softDrop, 
      setValue: (v: number) => updateSetting(setSoftDrop, 'sdf', v), 
      min: 0, 
      max: 100,
      color: '#FF5733'
    },
    { 
      id: 'masterVol', 
      label: 'MASTER VOL.', 
      description: '', 
      value: masterVol, 
      setValue: (v: number) => updateSetting(setMasterVol, 'masterVolume', v), 
      min: 0, 
      max: 100,
      color: '#FF5733'
    },
  ];

  return (
    <div className="size-full relative overflow-hidden bg-transparent flex items-center justify-center">
      {/* Background effects */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      
      <BackButton onClick={onBack} />

      <div className="w-full max-w-xl px-8 relative z-10">
        <motion.h1 
          className="text-5xl font-black text-white mb-12 tracking-tighter text-center italic drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          SETTINGS
        </motion.h1>

        {/* Settings Sliders */}
        <motion.div
          className="space-y-8 mb-12 p-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm shadow-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {settings.map((setting, index) => (
            <motion.div
              key={setting.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-base font-black text-white tracking-widest">{setting.label}</div>
                  {setting.description && (
                    <div className="text-[10px] font-bold text-white/40 tracking-[0.2em] mt-1">{setting.description}</div>
                  )}
                </div>
                <div className="text-2xl font-black" style={{ color: setting.color }}>
                  {setting.value}
                </div>
              </div>
              <div className="relative h-4 flex items-center">
                <input
                  type="range"
                  min={setting.min}
                  max={setting.max}
                  value={setting.value}
                  onChange={(e) => setting.setValue(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, ${setting.color} 0%, ${setting.color} ${setting.value}%, rgba(255,255,255,0.1) ${setting.value}%, rgba(255,255,255,0.1) 100%)`,
                  }}
                  onMouseUp={saveSettings}
                  onTouchEnd={saveSettings}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Buttons */}
        <div className="space-y-4">
          <motion.button
            className="w-full px-8 py-5 bg-white/5 border border-white/10 rounded-xl text-white font-black text-lg tracking-widest hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer shadow-lg group"
            onClick={onOpenControls}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            whileTap={{ scale: 0.98 }}
          >
            <Gamepad2 className="w-6 h-6 group-hover:text-[#FF5733] transition-colors" />
            CONTROLS
          </motion.button>
        </div>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #FF5733;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255, 87, 51, 0.5);
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #FF5733;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 10px rgba(255, 87, 51, 0.5);
        }
      `}</style>
    </div>
  );
}
