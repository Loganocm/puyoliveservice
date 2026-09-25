import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { RotateCcw, LogOut, Trophy, Zap, Timer, Sparkles } from 'lucide-react';
import { GameButton } from '../components/GameButton';
import type { Submission } from '../core/PersonalBests';

interface GameOverScreenProps {
  score: number;
  message: string;
  isTimeTrial?: boolean;
  isMultiplayer?: boolean;
  maxChain?: number;
  puyosCleared?: number;
  durationSeconds?: number;
  /** Single player: this game against the player's best in the mode. */
  personal?: Submission;
  onRestart: () => void;
  onExit: () => void;
  xpGained?: number;
}

/**
 * Keys are ignored for this long after the screen appears, so a hard drop
 * mashed at the moment of topping out does not skip straight past it.
 */
const KEY_GUARD_MS = 700;

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The results screen, for every mode. Single player shows the whole game
 * (score, best chain, puyos cleared, time) against the player's personal
 * best; it used to show those only for timed games. Enter or R plays again
 * and Escape leaves, so a run can be retried without reaching for the mouse.
 */
export function GameOverScreen({
  score,
  message,
  isTimeTrial = false,
  isMultiplayer = false,
  maxChain = 0,
  puyosCleared = 0,
  durationSeconds = 0,
  personal,
  onRestart,
  onExit,
  xpGained,
}: GameOverScreenProps) {
  const isWin = message === 'YOU WIN!';
  const titleColor = isTimeTrial || !isMultiplayer
    ? 'var(--pl-accent-secondary)'
    : isWin
      ? 'var(--pl-state-success, #3DDC97)'
      : 'var(--pl-state-danger, #FF5A5A)';
  const title = isMultiplayer ? message : isTimeTrial ? 'TIME UP' : 'GAME OVER';
  const restartLabel = isMultiplayer ? 'QUEUE AGAIN' : 'PLAY AGAIN';

  const shownAt = useRef(performance.now());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || performance.now() - shownAt.current < KEY_GUARD_MS) return;
      if (e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); onRestart(); }
      else if (e.code === 'Escape') { e.preventDefault(); onExit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRestart, onExit]);

  const stats = [
    { label: 'MAX CHAIN', value: maxChain, icon: Zap, best: personal?.newBestChain },
    { label: 'CLEARED', value: puyosCleared, icon: Trophy },
    ...(isMultiplayer ? [] : [{ label: 'TIME', value: formatDuration(durationSeconds), icon: Timer }]),
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        className="relative w-full max-w-md mx-4"
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <div
          className="rounded-3xl p-7 sm:p-8 backdrop-blur-xl border"
          style={{
            background: 'color-mix(in srgb, var(--pl-bg-raised) 94%, transparent)',
            borderColor: 'rgba(255,255,255,0.1)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          }}
        >
          <motion.h1
            id="results-title"
            className="text-4xl sm:text-5xl font-bold text-center tracking-wide"
            style={{ color: titleColor }}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 }}
          >
            {title}
          </motion.h1>

          <motion.div
            className="text-center mt-6 mb-6"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.16 }}
          >
            <p className="text-xs font-bold tracking-[0.25em]" style={{ color: 'var(--pl-text-muted)' }}>SCORE</p>
            <p className="text-5xl font-bold tabular-nums mt-1" style={{ color: 'var(--pl-text-primary)' }}>
              {score.toLocaleString()}
            </p>
            {personal && (
              personal.newBestScore ? (
                <motion.div
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider"
                  style={{ background: 'color-mix(in srgb, var(--pl-accent-primary) 22%, transparent)', color: 'var(--pl-accent-primary)' }}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.45, type: 'spring' }}
                >
                  <Sparkles size={13} /> NEW PERSONAL BEST
                </motion.div>
              ) : personal.previous && (
                <p className="mt-2 text-sm tabular-nums" style={{ color: 'var(--pl-text-muted)' }}>
                  Best {personal.best.score.toLocaleString()}
                </p>
              )
            )}
            {xpGained !== undefined && (
              <motion.div
                className="mt-3 ml-2 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider border"
                style={{ borderColor: 'color-mix(in srgb, var(--pl-accent-secondary) 40%, transparent)', color: 'var(--pl-accent-secondary)' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
              >
                XP <span style={{ color: 'var(--pl-text-primary)' }}>+{xpGained}</span>
              </motion.div>
            )}
          </motion.div>

          <motion.div
            className={`grid gap-3 mb-7 ${stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.24 }}
          >
            {stats.map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <s.icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: s.best ? 'var(--pl-accent-primary)' : 'var(--pl-text-muted)' }} />
                <p className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--pl-text-muted)' }}>{s.label}</p>
                <p className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--pl-text-primary)' }}>{s.value}</p>
              </div>
            ))}
          </motion.div>

          <motion.div
            className="space-y-3"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.32 }}
          >
            <GameButton variant="primary" onClick={onRestart} icon={RotateCcw}>
              {restartLabel}
            </GameButton>
            <GameButton variant={isMultiplayer ? 'danger' : 'secondary'} onClick={onExit} icon={LogOut}>
              EXIT
            </GameButton>
          </motion.div>

          <p className="hidden sm:block mt-5 text-center text-xs" style={{ color: 'var(--pl-text-muted)' }}>
            <kbd className="font-mono">Enter</kbd> or <kbd className="font-mono">R</kbd> to play again · <kbd className="font-mono">Esc</kbd> to leave
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
