import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { ReplaySimulator } from '../../src/core/ReplaySimulator';
import type { ReplayFileV3, ReplayInput } from '../../src/core/ReplayEngine';
import { ENGINE_VERSION } from '../../src/core/ReplayEngine';
import { COLS, TOTAL_ROWS, PuyoColor } from '../../src/core/Constants';
import { GOLDEN_SEEDS, pinSettings } from '../helpers/scriptedRun';

/**
 * REPLAY FIDELITY
 *
 * The claim the whole replay feature rests on: a match stored as a seed plus
 * an input log can be reconstructed exactly. This suite proves it end to end
 * rather than assuming it.
 *
 * Each test plays a real game, records inputs the way the live client does
 * (frame-stamped edges through the same alphabet the wire uses), captures the
 * board hash at checkpoints, then feeds ONLY the seed and the input log to
 * ReplaySimulator and requires every checkpoint to match.
 *
 * Two faults previously made this impossible, and both are regression-guarded
 * here:
 *
 *   1. The scene advanced the engine twice per rendered frame, so inputs were
 *      stamped on a ~120 Hz clock while replays ran at 60.
 *   2. The glide buffer depends on held-key state, which movement edges alone
 *      cannot express, so playback force-disabled it and nearly every piece
 *      locked on a different frame.
 *
 * See docs/adr/0002-replay-determinism.md.
 */

beforeEach(() => {
  pinSettings();
});

const CHECKPOINT_EVERY = 300;

/** Row index of the topmost filled cell in a column, or TOTAL_ROWS if empty. */
function columnTop(grid: number[][], c: number): number {
  for (let r = 0; r < TOTAL_ROWS; r++) if (grid[c][r] !== PuyoColor.None) return r;
  return TOTAL_ROWS;
}

interface RecordedMatch {
  seed: number;
  inputs: ReplayInput[];
  checkpoints: Map<number, string>;
  frames: number;
  finalHash: string;
  score: number;
  maxChain: number;
}

/**
 * Play a game while recording inputs exactly as GameScene does: an input taken
 * on frame N is stamped with engine.currentFrame AFTER update(N) has run.
 * ReplaySimulator applies inputs with `f < currentFrame`, i.e. before
 * update(N+1) — the two must agree or nothing below is meaningful.
 *
 * `holdPattern` toggles the horizontal-held flag on a fixed cadence so the
 * glide buffer is genuinely exercised; a fidelity test that never holds a key
 * would pass even with the old force-disabled behaviour.
 */
function recordMatch(seed: number, maxFrames: number, holdPattern: boolean): RecordedMatch {
  pinSettings();
  const engine = new GameEngine(seed);
  const inputs: ReplayInput[] = [];
  const checkpoints = new Map<number, string>();

  const record = (i: ReplayInput['i']) => {
    inputs.push({ f: engine.currentFrame, p: 0, i });
  };

  let frames = 0;
  for (let f = 0; f < maxFrames; f++) {
    engine.update();
    frames = engine.currentFrame;

    // Checkpoint BEFORE this frame's inputs are applied.
    //
    // This ordering is load-bearing and mirrors GameScene exactly: the live
    // client calls recordHash() after update() but before handleInput(), so a
    // hash stamped frame N describes the board *before* the inputs also
    // stamped frame N. ReplaySimulator reproduces that by applying inputs with
    // `f < currentFrame` at the top of the next iteration. Capturing after
    // input here instead makes every checkpoint appear to diverge at frame 1.
    if (engine.currentFrame % CHECKPOINT_EVERY === 0) {
      checkpoints.set(engine.currentFrame, engine.computeBoardHash());
    }

    if (holdPattern) {
      // Deterministic hold cadence: held for 40 frames out of every 60.
      const shouldHold = engine.currentFrame % 60 < 40;
      if (shouldHold !== engine.horizontalMoveHeld) {
        engine.horizontalMoveHeld = shouldHold;
        record(shouldHold ? 'HH' : 'HU');
      }
    }

    if (engine.state === 1 /* ACTIVE */ && engine.activePiece) {
      // Same placement heuristic as the characterization driver, but every
      // action is recorded so the replay can reproduce it.
      let best = -Infinity;
      let bestCol = engine.activePiece.x;
      const { mainColor } = engine.activePiece;
      for (let c = 0; c < COLS; c++) {
        const top = columnTop(engine.board.grid, c);
        if (top <= 2) continue;
        let s = top * 1.0;
        const onTop = top < TOTAL_ROWS ? engine.board.grid[c][top] : PuyoColor.None;
        if (onTop === mainColor) s += 8;
        if (s > best) { best = s; bestCol = c; }
      }
      while (engine.activePiece.x > bestCol && engine.movePiece(-1)) record('L');
      while (engine.activePiece.x < bestCol && engine.movePiece(1)) record('R');
      engine.hardDrop();
      record('HD');
    }

    if (engine.state === 6 /* GAMEOVER */) break;
  }

  return {
    seed,
    inputs,
    checkpoints,
    frames,
    finalHash: engine.computeBoardHash(),
    score: engine.stats.score,
    maxChain: engine.stats.maxChain,
  };
}

/** Wrap a recorded match in the on-disk replay format. */
function toReplayFile(m: RecordedMatch): ReplayFileV3 {
  return {
    version: 3,
    engineVersion: ENGINE_VERSION,
    seed: m.seed,
    players: [
      { id: 'p0', username: 'recorder' },
      { id: 'p1', username: 'idle' },
    ],
    winner: 0,
    duration: m.frames,
    fps: 60,
    inputs: m.inputs,
    playerSettings: [
      { sdf: 10, softDropProtection: true },
      { sdf: 10, softDropProtection: true },
    ],
    roomSettings: { garbageMultiplier: 1, marginTime: 96 },
    pieceSequences: [[], []],
    garbageColumns: [[], []],
    events: [],
    stateHashes: [...m.checkpoints].map(([f, h]) => ({ f, p: 0 as const, h })),
  };
}

describe('replay fidelity', () => {
  it('reproduces every checkpoint of a recorded match', () => {
    const report: string[] = [];
    let totalCheckpoints = 0;
    let matched = 0;

    for (const seed of GOLDEN_SEEDS) {
      const m = recordMatch(seed, 12_000, false);
      const snapshots = new ReplaySimulator(toReplayFile(m)).simulate();

      for (const [frame, expected] of m.checkpoints) {
        totalCheckpoints++;
        const snap = snapshots[frame];
        expect(snap, `seed ${seed}: no snapshot at frame ${frame}`).toBeDefined();

        // Recompute the hash from the replayed board the same way the live
        // engine does, so this compares simulation state, not snapshot shape.
        const replayed = new GameEngine(seed);
        replayed.board.grid = snap.boards[0].grid.map((col) => [...col]) as any;
        replayed.stats.score = snap.boards[0].score;
        replayed.garbageQueue = snap.boards[0].garbageQueue;
        replayed.nuisanceTray = snap.boards[0].nuisanceTray;

        const actual = replayed.computeBoardHash();
        if (actual === expected) matched++;
        else report.push(`seed ${seed} frame ${frame}: expected ${expected}, got ${actual}`);
      }
    }

    // Report the metric, not just pass/fail — a fidelity number is the whole
    // point of this suite.
    const pct = totalCheckpoints ? ((matched / totalCheckpoints) * 100).toFixed(1) : 'n/a';
    console.log(
      `[replay fidelity] ${matched}/${totalCheckpoints} checkpoints reproduced (${pct}%)`,
    );

    expect(totalCheckpoints, 'checkpoints compared').toBeGreaterThan(10);
    expect(report.join('\n')).toBe('');
    expect(matched).toBe(totalCheckpoints);
  }, 60_000);

  it('reproduces a match played with the glide buffer engaged', () => {
    // Regression guard for the force-disabled glide buffer. Before HH/HU
    // recording, held-key state was invisible to playback and this failed.
    let totalCheckpoints = 0;
    let matched = 0;
    const failures: string[] = [];

    for (const seed of GOLDEN_SEEDS.slice(0, 5)) {
      const m = recordMatch(seed, 12_000, true);
      expect(
        m.inputs.some((i) => i.i === 'HH'),
        `seed ${seed} recorded no hold edges — test would be vacuous`,
      ).toBe(true);

      const snapshots = new ReplaySimulator(toReplayFile(m)).simulate();

      for (const [frame, expected] of m.checkpoints) {
        totalCheckpoints++;
        const snap = snapshots[frame];
        if (!snap) { failures.push(`seed ${seed} frame ${frame}: missing snapshot`); continue; }

        const replayed = new GameEngine(seed);
        replayed.board.grid = snap.boards[0].grid.map((col) => [...col]) as any;
        replayed.stats.score = snap.boards[0].score;
        replayed.garbageQueue = snap.boards[0].garbageQueue;
        replayed.nuisanceTray = snap.boards[0].nuisanceTray;

        const actual = replayed.computeBoardHash();
        if (actual === expected) matched++;
        else failures.push(`seed ${seed} frame ${frame}: expected ${expected}, got ${actual}`);
      }
    }

    console.log(
      `[replay fidelity / glide] ${matched}/${totalCheckpoints} checkpoints reproduced`,
    );
    expect(totalCheckpoints).toBeGreaterThan(5);
    expect(failures.join('\n')).toBe('');
  }, 60_000);
});
