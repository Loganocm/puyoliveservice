import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import {
  runScripted,
  runHeuristic,
  makeScript,
  GOLDEN_SEEDS,
} from '../helpers/scriptedRun';

/**
 * CHARACTERIZATION SUITE
 *
 * These tests do not assert that the engine is *correct*. They assert that its
 * observable behaviour does not change. They were captured against the engine
 * as it existed before the refactor, and they are the gate the shared-engine
 * extraction must pass: if the extracted engine reproduces every snapshot here,
 * the extraction was behaviour-preserving.
 *
 * When a snapshot legitimately needs to change (a deliberate rules change), the
 * change must be accompanied by an ADR in docs/adr/ explaining why. Never run
 * `vitest -u` to make a red suite green without understanding what moved.
 *
 * See README §"Testing" -> "Characterization goldens".
 */
describe('piece sequence', () => {
  /**
   * The piece order a seed produces is the single most load-bearing property in
   * the project: every stored replay is just a seed plus inputs, so if this
   * sequence ever changes, every replay ever recorded silently plays a
   * different game. This snapshot makes that impossible to do by accident.
   */
  it('is stable for a fixed seed', () => {
    // Observe spawns through the engine's own callback rather than draining
    // nextPieces by hand: the queue is only refilled inside spawnPiece, so
    // manual draining can spin without ever advancing.
    const engine = new GameEngine(42);
    const pairs: string[] = [];

    engine.onPieceSpawn = () => {
      const p = engine.activePiece;
      if (p) pairs.push(`${p.mainColor}${p.subColor}`);
    };

    // Cycle each piece across columns before dropping. Dropping every piece in
    // the spawn column tops the board out after ~7 pieces, which is correct
    // engine behaviour but would stop the queue before the bag rolls over.
    // Bounded so a stall fails the test instead of hanging the suite.
    let placed = 0;
    for (let f = 0; f < 20_000 && pairs.length < 20; f++) {
      engine.update();
      if (engine.state === 1 /* ACTIVE */ && engine.activePiece) {
        const target = placed % 6;
        while (engine.activePiece.x > target && engine.movePiece(-1)) { /* slide */ }
        while (engine.activePiece.x < target && engine.movePiece(1)) { /* slide */ }
        engine.hardDrop();
        placed++;
      }
      if (engine.state === 6 /* GAMEOVER */) break;
    }

    expect(pairs.length).toBeGreaterThanOrEqual(20);
    expect(pairs.slice(0, 20).join(' ')).toMatchSnapshot();
  });

  it('differs between seeds', () => {
    const a = new GameEngine(1).nextPieces.map((p) => `${p.main}${p.sub}`).join('');
    const b = new GameEngine(2).nextPieces.map((p) => `${p.main}${p.sub}`).join('');
    expect(a).not.toBe(b);
  });

  it('opens with no duplicate-colour pairs in the first two hands', () => {
    // The start bag deliberately repairs doubles so neither player opens with a
    // dead piece. Regression guard for that repair loop.
    for (const seed of GOLDEN_SEEDS) {
      const engine = new GameEngine(seed);
      const first = engine.nextPieces[0];
      const second = engine.nextPieces[1];
      expect(first.main, `seed ${seed} hand 1`).not.toBe(first.sub);
      expect(second.main, `seed ${seed} hand 2`).not.toBe(second.sub);
    }
  });
});

describe('board evolution', () => {
  /**
   * The board hash folds the whole grid plus score, garbage queue and nuisance
   * tray. Snapshotting it at intervals pins the entire simulation: gravity,
   * matching, scoring, the garbage economy and all state-machine timing.
   *
   * Driven by the heuristic placer rather than random input. Random input tops
   * the board out before a single chain forms, so goldens captured from it
   * would pin almost nothing.
   */
  it('produces stable checkpoint hashes under heuristic play', () => {
    const table = GOLDEN_SEEDS.map((seed) => {
      const r = runHeuristic(seed, 12_000, 600);
      return {
        seed,
        frames: r.frames,
        checkpoints: r.checkpoints.join(','),
        finalHash: r.finalHash,
        score: r.score,
        maxChain: r.maxChain,
        puyosCleared: r.puyosCleared,
        garbageSent: r.garbageSent,
        toppedOut: r.toppedOut,
      };
    });
    expect(table).toMatchSnapshot();
  });

  /**
   * Coverage floor, not a behaviour assertion. If a future change makes the
   * driver stop reaching chains and garbage, the goldens above silently stop
   * testing anything meaningful — this fails loudly instead.
   *
   * Thresholds sit well below observed values (min frames ~726, min cleared
   * ~50, min sent ~12) so ordinary variation does not cause flakes.
   */
  it('exercises matching, chains and garbage deeply enough to be meaningful', () => {
    const runs = GOLDEN_SEEDS.map((seed) => runHeuristic(seed, 12_000, 600));

    const totalCleared = runs.reduce((n, r) => n + r.puyosCleared, 0);
    const totalSent = runs.reduce((n, r) => n + r.garbageSent, 0);
    const chainedRuns = runs.filter((r) => r.maxChain >= 2).length;
    const shortest = Math.min(...runs.map((r) => r.frames));

    expect(shortest, 'shortest game in frames').toBeGreaterThan(400);
    expect(totalCleared, 'puyos cleared across all seeds').toBeGreaterThan(600);
    expect(totalSent, 'garbage sent across all seeds').toBeGreaterThan(200);
    expect(chainedRuns, 'seeds reaching a 2+ chain').toBeGreaterThanOrEqual(7);
  });

  it('random input is retained as a separate, shallower shape', () => {
    // Kept deliberately: random play exercises rotation, wall kicks and
    // soft-drop paths that the hard-dropping heuristic never touches.
    const table = GOLDEN_SEEDS.map((seed) => {
      const r = runScripted(seed, 1800, 300);
      return { seed, frames: r.frames, finalHash: r.finalHash, score: r.score };
    });
    expect(table).toMatchSnapshot();
  });
});

describe('self-determinism', () => {
  /**
   * The property the whole replay system rests on: identical seed plus
   * identical inputs must produce an identical board, every time.
   */
  it('two runs of the same seed and script agree exactly', () => {
    for (const seed of GOLDEN_SEEDS) {
      const script = makeScript(seed, 1200);
      const a = runScripted(seed, 1200, 200, script);
      const b = runScripted(seed, 1200, 200, script);

      expect(b.checkpoints, `seed ${seed} checkpoints`).toEqual(a.checkpoints);
      expect(b.finalHash, `seed ${seed} final hash`).toBe(a.finalHash);
      expect(b.frames, `seed ${seed} frame count`).toBe(a.frames);
      expect(b.score, `seed ${seed} score`).toBe(a.score);
    }
  });

  it('a different script on the same seed produces a different board', () => {
    // Guards against the hash being insensitive to input — a hash that never
    // changes would make every other test in this file vacuous.
    const seed = 1337;
    const a = runScripted(seed, 1200, 200, makeScript(seed, 1200));
    const b = runScripted(seed, 1200, 200, makeScript(seed + 1, 1200));
    expect(b.finalHash).not.toBe(a.finalHash);
  });
});

describe('board hash', () => {
  it('is an 8-character lowercase hex string', () => {
    const engine = new GameEngine(42);
    expect(engine.computeBoardHash()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when the grid changes', () => {
    const engine = new GameEngine(42);
    const before = engine.computeBoardHash();
    engine.board.grid[0][13] = 1;
    expect(engine.computeBoardHash()).not.toBe(before);
  });

  it('changes when only the garbage queue changes', () => {
    // Garbage state is folded into the hash deliberately: two boards that look
    // identical but hold different pending garbage are NOT the same state.
    const engine = new GameEngine(42);
    const before = engine.computeBoardHash();
    engine.garbageQueue += 6;
    expect(engine.computeBoardHash()).not.toBe(before);
  });
});
