import { describe, it, expect } from 'vitest';
import { COLS, TOTAL_ROWS, PuyoColor, GameEngine } from '@puyolive/engine';
import { PuyoSimulator } from '../../server/PuyoSimulator';
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
 *
 * Two drivers, because one is not enough:
 *
 *   - The ADVERSARIAL driver hammers every input path at random. It reaches
 *     wall kicks, the glide buffer and the garbage drop quickly, but it stacks
 *     junk and tops out in a couple of hundred frames, so it never reaches
 *     CHECK_MATCH, chain scoring or the offset arithmetic at all.
 *   - The HEURISTIC driver plays well enough to build chains, which is what
 *     puts scoring, cascades and the nuisance tray under comparison.
 *
 * See website/src/content/docs/reference/testing.md ("Coverage floors").
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

// ---------------------------------------------------------------------------
// Adversarial driver
// ---------------------------------------------------------------------------

/**
 * The adversarial input script, as a pure function of the seed. Kept
 * deliberately separate from the engines' own randomness so that changing
 * engine randomness cannot silently change the script.
 */
interface ScriptStep { act: number; amount: number }

function makeAdversarialScript(seed: number, frames: number): ScriptStep[] {
  let r = seed >>> 0;
  const rnd = () => {
    let t = (r += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const script: ScriptStep[] = new Array(frames);
  for (let f = 0; f < frames; f++) {
    const act = Math.floor(rnd() * 14);
    // Garbage amounts span the single-rock case, the partial-row case and the
    // multi-row cap. The second draw happens only on a garbage frame, exactly
    // as it did when this script was inlined in the divergence loop.
    const amount = act === 9 ? 1 + Math.floor(rnd() * 30) : 0;
    script[f] = { act, amount };
  }
  return script;
}

// ---------------------------------------------------------------------------
// Heuristic driver
//
// Ported from tests/helpers/scriptedRun.ts, which drives a GameEngine through
// its typed API. The simulator only accepts wire symbols through executeInput,
// so the same decisions are expressed as inputs here. Both drivers must make
// identical decisions from identical boards, which is the point of the test.
// ---------------------------------------------------------------------------

function columnTop(grid: number[][], c: number): number {
  for (let r = 0; r < TOTAL_ROWS; r++) if (grid[c][r] !== PuyoColor.None) return r;
  return TOTAL_ROWS;
}

function topColour(grid: number[][], c: number): number {
  const r = columnTop(grid, c);
  return r < TOTAL_ROWS ? grid[c][r] : PuyoColor.None;
}

function scorePlacement(grid: number[][], c: number, main: number, sub: number): number {
  const top = columnTop(grid, c);
  if (top <= 2) return -Infinity; // refuse to build into the vanish zone
  const onTop = topColour(grid, c);
  let score = top * 1.0;
  if (onTop === main) score += 8;
  if (onTop === main && main === sub) score += 6;
  if (c > 0 && topColour(grid, c - 1) === main) score += 3;
  if (c < COLS - 1 && topColour(grid, c + 1) === main) score += 3;
  return score;
}

function bestColumn(grid: number[][], main: number, sub: number, fallback: number): number {
  let best = -Infinity;
  let bestCol = fallback;
  for (let c = 0; c < COLS; c++) {
    const s = scorePlacement(grid, c, main, sub);
    if (s > best) { best = s; bestCol = c; }
  }
  return bestCol;
}

/**
 * How much garbage the heuristic run injects, and when.
 *
 * A heuristic game that receives nothing never populates the nuisance tray, so
 * the offset arithmetic and the column-shuffle drop go uncompared. A steady
 * trickle keeps them live without burying the board before it can chain.
 */
const GARBAGE_EVERY = 240;
const GARBAGE_AMOUNT = 6;

describe('client engine vs server simulator', () => {
  /**
   * Run both implementations against the adversarial script and return the
   * first frame at which any shared observable disagrees, plus how far the
   * comparison actually got.
   */
  function compareAdversarial(seed: number, frames: number, sdf: number) {
    const e = new GameEngine(seed);
    const s = new PuyoSimulator(seed);
    // Both sides take handling settings from their own config now, so set them
    // explicitly on each rather than through a shared global.
    e.config.sdf = sdf;
    e.config.softDropProtection = true;
    s.sdf = sdf;
    s.softDropProtection = true;

    const script = makeAdversarialScript(seed, frames);

    for (let f = 0; f < frames; f++) {
      const { act, amount } = script[f];
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
        e.addGarbage(amount);
        s.executeInput({ i: 'G', a: amount });
      }

      e.update();
      s.update();

      const d = compareState(e, s, f);
      if (d) return d;
      if (e.state === 6) return { frames: f + 1, diverged: null as string | null };
    }
    return { frames, diverged: null as string | null };
  }

  /**
   * Run both implementations under the heuristic placer, which is what gets
   * them into chains, cascades and the garbage economy.
   */
  function compareHeuristic(seed: number, frames: number, sdf: number) {
    const e = new GameEngine(seed);
    const s = new PuyoSimulator(seed);
    e.config.sdf = sdf;
    e.config.softDropProtection = true;
    s.sdf = sdf;
    s.softDropProtection = true;

    for (let f = 0; f < frames; f++) {
      if (f > 0 && f % GARBAGE_EVERY === 0) {
        e.addGarbage(GARBAGE_AMOUNT);
        s.executeInput({ i: 'G', a: GARBAGE_AMOUNT });
      }

      // Place the piece the frame it becomes actionable. Decided independently
      // on each side from that side's own board: if the boards had drifted, the
      // drivers would drift with them and the run would diverge loudly.
      if (e.state === 1 && e.activePiece) {
        const { mainColor, subColor } = e.activePiece;
        const target = bestColumn(e.board.grid as unknown as number[][], mainColor, subColor, e.activePiece.x);
        while (e.activePiece.x > target && e.movePiece(-1)) { /* slide */ }
        while (e.activePiece.x < target && e.movePiece(1)) { /* slide */ }
        e.hardDrop();
      }
      if ((s.state as number) === 1 && s.activePiece) {
        const { mainColor, subColor } = s.activePiece;
        const target = bestColumn(s.board.grid, mainColor, subColor, s.activePiece.x);
        // executeInput returns nothing, so bound the slide by the board width
        // and stop as soon as a move is refused.
        for (let k = 0; k < COLS && s.activePiece.x !== target; k++) {
          const before = s.activePiece.x;
          s.executeInput({ i: s.activePiece.x > target ? 'L' : 'R' });
          if (s.activePiece.x === before) break;
        }
        s.executeInput({ i: 'HD' });
      }

      e.update();
      s.update();

      const d = compareState(e, s, f);
      if (d) return d;
      if (e.state === 6) return { frames: f + 1, diverged: null as string | null };
    }
    return { frames, diverged: null as string | null };
  }

  /** Compare every observable the two implementations claim to share. */
  function compareState(e: GameEngine, s: PuyoSimulator, f: number) {
    const eOver = e.state === 6;
    const sOver = s.isGameOver;
    const fail = (field: string, a: unknown, b: unknown) => ({
      frames: f + 1,
      diverged: `frame ${f} on ${field} (engine=${a} sim=${b})` as string | null,
    });

    if (eOver !== sOver) return fail('gameOver', eOver, sOver);
    if (eOver && sOver) return null;
    if (e.stats.score !== s.stats.score) return fail('score', e.stats.score, s.stats.score);
    if (e.garbageQueue !== s.garbageQueue) return fail('garbageQueue', e.garbageQueue, s.garbageQueue);
    if (e.nuisanceTray !== s.nuisanceTray) return fail('nuisanceTray', e.nuisanceTray, s.nuisanceTray);
    if (e.state !== (s.state as number)) return fail('state', e.state, s.state);
    if (e.stats.maxChain !== s.stats.maxChain) return fail('maxChain', e.stats.maxChain, s.stats.maxChain);
    if (e.stats.garbageSent !== s.stats.garbageSent) return fail('garbageSent', e.stats.garbageSent, s.stats.garbageSent);
    const eh = engineHash(e);
    const sh = simHash(s);
    if (eh !== sh) return fail('boardHash', eh, sh);
    return null;
  }

  it('reports where the two implementations diverge', () => {
    const results: string[] = [];
    let adversarialFrames = 0;
    let heuristicFrames = 0;

    // SDF is a per-player setting the two implementations read from different
    // places (SettingsManager vs a field the server sets from record_settings),
    // so parity is checked across its range, not just at the shared default.
    for (const sdf of [1, 10, 40]) {
      for (const seed of GOLDEN_SEEDS) {
        const a = compareAdversarial(seed, 3000, sdf);
        const h = compareHeuristic(seed, 3000, sdf);
        adversarialFrames += a.frames;
        heuristicFrames += h.frames;
        // Report the frames actually compared, not the frame budget. Both
        // drivers stop at game over, and the adversarial one tops out in a
        // couple of hundred frames -- reporting the budget as if it were the
        // comparison overstated the evidence considerably.
        results.push(
          `sdf=${sdf} seed ${seed}: ` +
          (a.diverged ? `DIVERGED adversarial ${a.diverged}` : `adversarial identical for ${a.frames}f`) +
          ', ' +
          (h.diverged ? `DIVERGED heuristic ${h.diverged}` : `heuristic identical for ${h.frames}f`),
        );
      }
    }

    // Printed unconditionally: this suite is a measurement instrument first and
    // an assertion second. The output is the input to the unification work.
    console.log(
      `[engine parity] ${adversarialFrames} adversarial + ${heuristicFrames} heuristic frames compared\n  ` +
      results.join('\n  '),
    );

    // Match the marker the failure branch actually writes. This filtered for a
    // lowercase 'diverged' against an uppercase 'DIVERGED' message, so the
    // assertion could not fire whatever the loop measured.
    const diverged = results.filter((r) => r.includes('DIVERGED'));
    expect(
      diverged.join('\n'),
      'client and server engines disagree; unification must resolve each case deliberately',
    ).toBe('');

    // Coverage floor. A driver that tops out immediately compares almost
    // nothing and still reports green, which is exactly the failure this suite
    // exists to prevent. The heuristic runs total ~16k frames across the 30
    // combinations; this floor is set below that so ordinary variation does not
    // trip it, but far above what the adversarial driver alone reaches (~3k).
    expect(heuristicFrames, 'heuristic runs must reach real games, not instant top-outs').toBeGreaterThan(12_000);
  }, 120_000);

  it('agrees on the opening piece sequence', () => {
    // Piece order is the single most load-bearing shared behaviour: replays and
    // the opponent view both assume both sides generate the same pieces.
    for (const seed of GOLDEN_SEEDS) {
      const e = new GameEngine(seed);
      const s = new PuyoSimulator(seed);
      const ep = e.nextPieces.map((p) => `${p.mainColor}${p.subColor}`).join(' ');
      const sp = s.nextPieces.map((p) => `${p.mainColor}${p.subColor}`).join(' ');
      expect(sp, `seed ${seed} opening queue`).toBe(ep);
    }
  });

  it('agrees on the board hash of a fresh engine', () => {
    for (const seed of GOLDEN_SEEDS) {
      expect(new PuyoSimulator(seed).computeBoardHash()).toBe(new GameEngine(seed).computeBoardHash());
    }
  });
});

// ---------------------------------------------------------------------------
// Recording surface
//
// The simulator is not only a simulation: it is the server's replay recorder.
// `spawnedPieces`, `garbageColumnLog` and the seven deterministic-event hooks
// feed straight into GameRoom.recordDeterministicEvent, so the FRAME each hook
// fires on and the ORDER they fire in end up in the stored replay. They are a
// format contract, not an implementation detail.
//
// The divergence check above cannot cover any of it, because the client engine
// has no equivalent to compare against. These goldens capture it from the
// hand-mirrored simulator instead, so that a simulator rewritten as an adapter
// over the shared engine has to reproduce the hook stream exactly rather than
// merely the board.
// ---------------------------------------------------------------------------

/** Drive a simulator with the heuristic placer, injecting garbage on schedule. */
function driveSimulator(s: PuyoSimulator, frames: number): void {
  for (let f = 0; f < frames; f++) {
    if (f > 0 && f % GARBAGE_EVERY === 0) s.executeInput({ i: 'G', a: GARBAGE_AMOUNT });

    if ((s.state as number) === 1 && s.activePiece) {
      const { mainColor, subColor } = s.activePiece;
      const target = bestColumn(s.board.grid, mainColor, subColor, s.activePiece.x);
      for (let k = 0; k < COLS && s.activePiece.x !== target; k++) {
        const before = s.activePiece.x;
        s.executeInput({ i: s.activePiece.x > target ? 'L' : 'R' });
        if (s.activePiece.x === before) break;
      }
      s.executeInput({ i: 'HD' });
    }

    s.update();
    if (s.isGameOver) break;
  }
}

function newSimulator(seed: number, sdf: number): PuyoSimulator {
  const s = new PuyoSimulator(seed);
  s.sdf = sdf;
  s.softDropProtection = true;
  return s;
}

/** Every hook firing, in order, tagged with the frame it fired on. */
function recordEventStream(seed: number, frames: number, sdf: number): string[] {
  const s = newSimulator(seed, sdf);
  const log: string[] = [];
  const at = () => s.frameCount;

  s.onPieceSpawn = (m, sub) => log.push(`${at()} spawn ${m},${sub}`);
  s.onPieceLock = (x, y, rot, m, sub) => log.push(`${at()} lock ${x},${y},${rot},${m},${sub}`);
  s.onMatchFound = (groups, chainStep) => log.push(`${at()} match groups=${groups.length} step=${chainStep}`);
  s.onGarbageDrop = (cols, amount) => log.push(`${at()} garbage_drop [${cols.join('')}] x${amount}`);
  s.onChainEnd = (maxChain, score, cleared) => log.push(`${at()} chain_end ${maxChain},${score},${cleared}`);
  s.onSimGameOver = () => log.push(`${at()} gameover`);
  s.onBagGenerated = (bag) => log.push(`${at()} bag_gen ${bag.length}`);
  s.onGarbageGenerated = (amount) => log.push(`${at()} garbage_sent ${amount}`);
  s.onGarbageOffset = (amount) => log.push(`${at()} garbage_offset ${amount}`);

  driveSimulator(s, frames);
  return log;
}

/** Collapse a run's whole recording surface into one comparable row. */
function fingerprintRecording(seed: number, frames: number, sdf: number) {
  const s = newSimulator(seed, sdf);
  let matches = 0;
  let chainEnds = 0;
  s.onMatchFound = () => { matches++; };
  s.onChainEnd = () => { chainEnds++; };
  driveSimulator(s, frames);

  return {
    run: `sdf=${sdf} seed=${seed}`,
    frames: s.frameCount,
    gameOver: s.isGameOver,
    hash: s.computeBoardHash(),
    score: s.stats.score,
    maxChain: s.stats.maxChain,
    garbageSent: s.stats.garbageSent,
    matches,
    chainEnds,
    pieces: s.spawnedPieces.length,
    pieceDigest: s.spawnedPieces.join('').slice(0, 40),
    garbageDrops: s.garbageColumnLog.length,
    garbageColumnDigest: s.garbageColumnLog.map((c) => c.join('')).join('|').slice(0, 60),
  };
}

describe('server simulator recording surface', () => {
  it('pins the deterministic event stream frame by frame', () => {
    // One seed, in full. The frame each hook fires on is exactly what GameRoom
    // stamps into the replay's event log.
    const stream = recordEventStream(42, 1500, 10);
    expect(stream.join('\n')).toMatchSnapshot();

    // Coverage floor for the golden itself: a stream with no chains and no
    // garbage pins the easy half of the recorder and protects nothing.
    const kinds = (k: string) => stream.filter((l) => l.includes(` ${k} `) || l.endsWith(` ${k}`)).length;
    expect(kinds('match'), 'golden must reach a chain').toBeGreaterThan(0);
    expect(kinds('chain_end'), 'golden must reach a chain end').toBeGreaterThan(0);
    expect(kinds('garbage_drop'), 'golden must reach a garbage drop').toBeGreaterThan(0);
    expect(kinds('garbage_sent'), 'golden must send garbage').toBeGreaterThan(0);
  });

  it('pins the recorded piece and garbage logs across seeds and SDF', () => {
    const rows = [];
    for (const sdf of [1, 10, 40]) {
      for (const seed of GOLDEN_SEEDS) rows.push(fingerprintRecording(seed, 3000, sdf));
    }
    expect(rows).toMatchSnapshot();

    expect(rows.every((r) => r.matches > 0), 'every run must reach CHECK_MATCH').toBe(true);
    expect(rows.some((r) => r.garbageDrops > 0), 'some run must drop garbage').toBe(true);
  }, 60_000);
});
