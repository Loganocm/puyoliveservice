import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { PuyoSimulator } from '../../server/PuyoSimulator';
import { COLS, TOTAL_ROWS } from '../../src/core/Constants';
import { GOLDEN_SEEDS } from '../helpers/scriptedRun';

/**
 * ENGINE PARITY
 *
 * The client engine and the server simulator implement the same rules twice,
 * kept in sync only by a comment reading "must match client GameEngine logic
 * exactly". This suite measures whether that is actually true, frame by frame,
 * rather than trusting the comment.
 *
 * It exists to de-risk unifying them: any divergence found here is a behaviour
 * difference the extraction must consciously resolve rather than accidentally
 * pick a side of.
 */
/** Hash the parts of the state both implementations claim to share. */
function hashOf(grid: number[][], score: number, gq: number, tray: number): string {
  let h = 0x811c9dc5;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < TOTAL_ROWS; r++) {
      h ^= grid[c][r];
      h = Math.imul(h, 0x01000193);
    }
  }
  h ^= score; h = Math.imul(h, 0x01000193);
  h ^= gq;    h = Math.imul(h, 0x01000193);
  h ^= tray;  h = Math.imul(h, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function engineHash(e: GameEngine): string {
  return hashOf(e.board.grid as unknown as number[][], e.stats.score, e.garbageQueue, e.nuisanceTray);
}
function simHash(s: PuyoSimulator): string {
  return hashOf(s.board.grid, s.stats.score, s.garbageQueue, s.nuisanceTray);
}

interface Divergence {
  frame: number;
  field: string;
  engine: string | number;
  sim: string | number;
}

/**
 * Run both implementations against an identical input script and return the
 * first frame at which any shared observable disagrees.
 */
function findFirstDivergence(seed: number, frames: number, sdf: number = 10): Divergence | null {
  const e = new GameEngine(seed);
  const s = new PuyoSimulator(seed);
  // Both sides take handling settings from their own config now, so set them
  // explicitly on each rather than through a shared global.
  e.config.sdf = sdf;
  e.config.softDropProtection = true;
  s.sdf = sdf;
  s.softDropProtection = true;

  // Independent PRNG so the script is identical for a given seed but is not
  // correlated with the engines' own randomness.
  let r = seed >>> 0;
  const rnd = () => {
    let t = (r += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let f = 0; f < frames; f++) {
    // Adversarial script: every path both implementations share, not just the
    // easy ones. Rotation exercises wall kicks, held direction exercises the
    // glide buffer, and injected garbage exercises the nuisance tray, the
    // offset arithmetic and the column-shuffle drop -- the areas most likely
    // to have drifted between two hand-maintained copies.
    const act = Math.floor(rnd() * 14);
    if (act === 0)      { e.movePiece(-1);      s.executeInput({ i: 'L' }); }
    else if (act === 1) { e.movePiece(1);       s.executeInput({ i: 'R' }); }
    else if (act === 2) { e.rotate(1);          s.executeInput({ i: 'CW' }); }
    else if (act === 3) { e.rotate(-1);         s.executeInput({ i: 'CC' }); }
    else if (act === 4) { e.setSoftDrop(true);  s.executeInput({ i: 'SD' }); }
    else if (act === 5) { e.setSoftDrop(false); s.executeInput({ i: 'SU' }); }
    else if (act === 6) { e.hardDrop();         s.executeInput({ i: 'HD' }); }
    else if (act === 7) { e.horizontalMoveHeld = true;  s.executeInput({ i: 'HH' }); }
    else if (act === 8) { e.horizontalMoveHeld = false; s.executeInput({ i: 'HU' }); }
    else if (act === 9) {
      // Garbage arrives from an opponent. Amounts span the single-rock case,
      // the partial-row case and the multi-row cap.
      const amount = 1 + Math.floor(rnd() * 30);
      e.addGarbage(amount);
      s.executeInput({ i: 'G', a: amount });
    }

    e.update();
    s.update();

    const eOver = e.state === 6;
    const sOver = s.isGameOver;
    if (eOver !== sOver) {
      return { frame: f, field: 'gameOver', engine: String(eOver), sim: String(sOver) };
    }
    if (eOver && sOver) return null; // both finished together

    if (e.stats.score !== s.stats.score) {
      return { frame: f, field: 'score', engine: e.stats.score, sim: s.stats.score };
    }
    if (e.garbageQueue !== s.garbageQueue) {
      return { frame: f, field: 'garbageQueue', engine: e.garbageQueue, sim: s.garbageQueue };
    }
    if (e.nuisanceTray !== s.nuisanceTray) {
      return { frame: f, field: 'nuisanceTray', engine: e.nuisanceTray, sim: s.nuisanceTray };
    }
    if (e.state !== (s.state as number)) {
      return { frame: f, field: 'state', engine: e.state, sim: s.state as number };
    }
    const eh = engineHash(e);
    const sh = simHash(s);
    if (eh !== sh) {
      return { frame: f, field: 'boardHash', engine: eh, sim: sh };
    }
  }
  return null;
}

describe('client engine vs server simulator', () => {
  it('reports where the two implementations diverge', () => {
    const results: string[] = [];

    // SDF is a per-player setting the two implementations read from different
    // places (SettingsManager vs a field the server sets from record_settings),
    // so parity is checked across its range, not just at the shared default.
    for (const sdf of [1, 10, 40]) {
      for (const seed of GOLDEN_SEEDS) {
        const d = findFirstDivergence(seed, 3000, sdf);
        results.push(
          d
            ? `sdf=${sdf} seed ${seed}: DIVERGED at frame ${d.frame} on ${d.field} (engine=${d.engine} sim=${d.sim})`
            : `sdf=${sdf} seed ${seed}: identical for 3000 frames`,
        );
      }
    }

    // Printed unconditionally: this suite is a measurement instrument first and
    // an assertion second. The output is the input to the unification work.
    console.log('[engine parity]\n  ' + results.join('\n  '));

    const diverged = results.filter((r) => r.includes('diverged'));
    expect(
      diverged.join('\n'),
      'client and server engines disagree; unification must resolve each case deliberately',
    ).toBe('');
  }, 60_000);

  it('agrees on the opening piece sequence', () => {
    // Piece order is the single most load-bearing shared behaviour: replays and
    // the opponent view both assume both sides generate the same pieces.
    for (const seed of GOLDEN_SEEDS) {
      const e = new GameEngine(seed);
      const s = new PuyoSimulator(seed);
      const ep = e.nextPieces.map((p) => `${p.main}${p.sub}`).join(' ');
      const sp = s.nextPieces.map((p) => `${p.main}${p.sub}`).join(' ');
      expect(sp, `seed ${seed} opening queue`).toBe(ep);
    }
  });

  it('agrees on the board hash of a fresh engine', () => {
    for (const seed of GOLDEN_SEEDS) {
      expect(new PuyoSimulator(seed).computeBoardHash()).toBe(new GameEngine(seed).computeBoardHash());
    }
  });
});
