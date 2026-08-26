import { GameEngine } from '@puyolive/engine';

/**
 * Deterministic test harness for the game engine.
 *
 * Every value here is a pure function of an explicit seed. Nothing reads the
 * wall clock, Math.random, or ambient localStorage — a characterization golden
 * that depends on the environment is worthless as a refactor gate.
 *
 * See README §"Testing" and docs/adr/0002-replay-determinism.md.
 */

/** Mulberry32, kept deliberately separate from the engine's own PRNG so that
 *  changing engine randomness cannot silently change the input script. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The engine's full input alphabet, matching ReplayEngine's InputType. */
export type ScriptedAction = 'L' | 'R' | 'CW' | 'CC' | 'SD' | 'SU' | 'HD' | 'NONE';

const WEIGHTED: ScriptedAction[] = [
  // Movement dominates real play; hard drops are comparatively rare.
  'NONE', 'NONE', 'NONE', 'NONE', 'NONE', 'NONE',
  'L', 'L', 'R', 'R',
  'CW', 'CC',
  'SD', 'SU',
  'HD',
];

/**
 * Build a reproducible input script: a fixed-length array where index N is the
 * action taken on frame N. Pure function of the seed.
 */
export function makeScript(seed: number, frames: number): ScriptedAction[] {
  const rng = makeRng(seed);
  const script: ScriptedAction[] = new Array(frames);
  for (let f = 0; f < frames; f++) {
    script[f] = WEIGHTED[Math.floor(rng() * WEIGHTED.length)];
  }
  return script;
}

/** Apply one scripted action to an engine. Mirrors ReplaySimulator.executeInput. */
export function applyAction(engine: GameEngine, action: ScriptedAction): void {
  switch (action) {
    case 'L':  engine.movePiece(-1);      break;
    case 'R':  engine.movePiece(1);       break;
    case 'CW': engine.rotate(1);          break;
    case 'CC': engine.rotate(-1);         break;
    case 'SD': engine.setSoftDrop(true);  break;
    case 'SU': engine.setSoftDrop(false); break;
    case 'HD': engine.hardDrop();         break;
    case 'NONE': break;
  }
}

/**
 * Deterministic engine handling settings shared by every test.
 *
 * This replaced a pinSettings() helper that reached into SettingsManager. The
 * engine takes an injected config now, so tests configure the engine directly
 * and touch no globals -- which is what lets this suite run without a DOM.
 */
export function applyTestConfig(engine: GameEngine, sdf: number = 10): void {
  engine.config.sdf = sdf;
  engine.config.softDropProtection = true;
}

export interface RunResult {
  /** Board hash at each requested checkpoint frame, in order. */
  checkpoints: string[];
  finalHash: string;
  frames: number;
  score: number;
  maxChain: number;
  puyosCleared: number;
  garbageSent: number;
  /** True if the engine reached GAMEOVER before the frame budget ran out. */
  toppedOut: boolean;
}

/**
 * Drive an engine deterministically for `frames` logical frames, sampling the
 * board hash at each checkpoint.
 *
 * Input ordering matches ReplaySimulator exactly: the action for frame N is
 * applied BEFORE update() advances the engine to frame N. Any divergence here
 * would make replay fidelity tests meaningless.
 */
export function runScripted(
  seed: number,
  frames: number,
  checkpointEvery: number,
  script?: ScriptedAction[],
): RunResult {
  const engine = new GameEngine(seed);
  applyTestConfig(engine);
  const actions = script ?? makeScript(seed, frames);
  const checkpoints: string[] = [];

  let executed = 0;
  for (let f = 0; f < frames; f++) {
    applyAction(engine, actions[f] ?? 'NONE');
    engine.update();
    executed = f + 1;
    if ((f + 1) % checkpointEvery === 0) {
      checkpoints.push(engine.computeBoardHash());
    }
    if (engine.state === 6 /* GameState.GAMEOVER */) break;
  }

  return {
    checkpoints,
    finalHash: engine.computeBoardHash(),
    frames: executed,
    score: engine.stats.score,
    maxChain: engine.stats.maxChain,
    puyosCleared: engine.stats.puyosCleared,
    garbageSent: engine.stats.garbageSent,
    toppedOut: engine.state === 6,
  };
}

/** Fixed seeds used across the suite. Never change these — goldens depend on them. */
export const GOLDEN_SEEDS = [
  1, 42, 1337, 20260206, 999999,
  7, 123456, 88888888, 31337, 2147483646,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic driver
//
// Purely random input tops the board out in a few hundred frames without ever
// building a chain, so goldens captured from it never exercise CHECK_MATCH,
// POP_ANIM, chain scoring or the garbage economy. This driver plays well enough
// to produce multi-thousand-frame games with real chains, which is what makes
// the characterization snapshots worth having.
//
// It is deliberately simple and deterministic — no randomness, no lookahead
// beyond the current piece. Its only job is to exercise the engine deeply and
// identically on every run.
// ─────────────────────────────────────────────────────────────────────────────

import { COLS, TOTAL_ROWS, PuyoColor } from '@puyolive/engine';

/** Row the topmost filled cell sits in for a column, or TOTAL_ROWS if empty. */
function columnTop(grid: number[][], c: number): number {
  for (let r = 0; r < TOTAL_ROWS; r++) if (grid[c][r] !== PuyoColor.None) return r;
  return TOTAL_ROWS;
}

/** Colour of the topmost puyo in a column, or None. */
function topColour(grid: number[][], c: number): number {
  const r = columnTop(grid, c);
  return r < TOTAL_ROWS ? grid[c][r] : PuyoColor.None;
}

/**
 * Score a flat (rot 0) placement: both puyos stack in the same column.
 * Higher is better. Rewards colour matches, penalises height and unevenness.
 */
function scorePlacement(grid: number[][], c: number, main: number, sub: number): number {
  const top = columnTop(grid, c);
  if (top <= 2) return -Infinity; // refuse to build into the vanish zone

  // At rotation 0 the sub puyo sits ABOVE the main puyo, so the puyo that
  // actually lands against the existing stack is `main`. Comparing `sub` here
  // (the obvious-looking mistake) makes the placer chase matches that never
  // touch, and it tops out without clearing.
  const onTop = topColour(grid, c);

  // `top` is a row index, so a LARGER top means an emptier column. Height must
  // stay significant or the placer builds towers, but it must not dominate or
  // the placer spreads flat and never completes a group of four.
  let score = top * 1.0;
  if (onTop === main) score += 8;                        // extends a vertical run
  if (onTop === main && main === sub) score += 6;        // extends it by two
  if (c > 0 && topColour(grid, c - 1) === main) score += 3;
  if (c < COLS - 1 && topColour(grid, c + 1) === main) score += 3;
  return score;
}

/**
 * Drive an engine with the heuristic placer for up to `frames` logical frames.
 * Deterministic: same seed always produces the same game.
 */
export function runHeuristic(
  seed: number,
  frames: number,
  checkpointEvery: number,
): RunResult {
  const engine = new GameEngine(seed);
  applyTestConfig(engine);
  const checkpoints: string[] = [];

  let executed = 0;
  for (let f = 0; f < frames; f++) {
    // Place the piece the frame it becomes actionable.
    if (engine.state === 1 /* ACTIVE */ && engine.activePiece) {
      const { mainColor, subColor } = engine.activePiece;
      let best = -Infinity;
      let bestCol = engine.activePiece.x;
      for (let c = 0; c < COLS; c++) {
        const s = scorePlacement(engine.board.grid, c, mainColor, subColor);
        if (s > best) { best = s; bestCol = c; }
      }
      while (engine.activePiece.x > bestCol && engine.movePiece(-1)) { /* slide */ }
      while (engine.activePiece.x < bestCol && engine.movePiece(1)) { /* slide */ }
      engine.hardDrop();
    }

    engine.update();
    executed = f + 1;
    if ((f + 1) % checkpointEvery === 0) checkpoints.push(engine.computeBoardHash());
    if (engine.state === 6 /* GAMEOVER */) break;
  }

  return {
    checkpoints,
    finalHash: engine.computeBoardHash(),
    frames: executed,
    score: engine.stats.score,
    maxChain: engine.stats.maxChain,
    puyosCleared: engine.stats.puyosCleared,
    garbageSent: engine.stats.garbageSent,
    toppedOut: engine.state === 6,
  };
}
