import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Music, Play, Pause, SkipForward } from 'lucide-react';
import { GameEvents } from '../core/GameEvents';
import { BGMManager } from '../core/BGMManager';

interface BGMState {
  isPlaying: boolean;
  songName: string;
  artist: string;
}

/** The current track, or null when nothing is playing. */
function useBgmState(): BGMState | null {
  const [state, setState] = useState<BGMState | null>(null);
  useEffect(() => {
    GameEvents.on('bgm_state_change', setState);
    return () => { GameEvents.off('bgm_state_change', setState); };
  }, []);
  return state;
}

function Controls({ state, compact = false }: { state: BGMState; compact?: boolean }) {
  const size = compact ? 'w-8 h-8' : 'w-9 h-9';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={state.isPlaying ? 'Pause music' : 'Play music'}
        onClick={e => { e.stopPropagation(); if (state.isPlaying) BGMManager.pause(); else BGMManager.resume(); }}
        className={`${size} rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors`}
      >
        {state.isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>
      <button
        type="button"
        aria-label="Next track"
        onClick={e => { e.stopPropagation(); BGMManager.next(); }}
        className={`${size} rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors`}
      >
        <SkipForward size={15} fill="currentColor" />
      </button>
    </div>
  );
}

/**
 * The music control as a footer item, for screens with a footer (the menu).
 * Docked rather than floating, so it can never cover anything.
 */
export function MusicChip() {
  const state = useBgmState();
  if (!state) return null;
  return (
    <div className="flex items-center gap-2 pl-3 pr-1 py-1 rounded-full border border-white/10 bg-white/[0.03] min-w-0">
      <Music className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--pl-accent-secondary)' }} aria-hidden="true" />
      <span className="text-xs font-semibold text-white/75 truncate max-w-[9rem]" title={`${state.songName} by ${state.artist}`}>
        {state.songName}
      </span>
      <Controls state={state} compact />
    </div>
  );
}

/**
 * The music control everywhere else: a small button in the corner that opens
 * the controls, and a short "now playing" note when the track changes. It
 * used to open itself in full on every track change and sat over the footer
 * and, on smaller screens, the board.
 */
export function BGMPlayer() {
  const state = useBgmState();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const lastSong = useRef<string | null>(null);

  useEffect(() => {
    if (!state || state.songName === lastSong.current) return;
    lastSong.current = state.songName;
    setToast(true);
    const t = setTimeout(() => setToast(false), 3000);
    return () => clearTimeout(t);
  }, [state]);

  if (!state) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] pointer-events-auto flex items-center gap-2" onMouseLeave={() => setOpen(false)}>
      <AnimatePresence>
        {(open || toast) && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10"
            role="status"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate max-w-[10rem]">{state.songName}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/45">{state.artist}</div>
            </div>
            {open && <Controls state={state} />}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label={open ? 'Hide music controls' : 'Show music controls'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-black/75 transition-colors"
      >
        <Music className="w-5 h-5" />
      </button>
    </div>
  );
}
