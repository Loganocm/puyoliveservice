// ═══════════════════════════════════════════════════════════════════════════════
// PuyoSimulator — the server's view of a player's game.
//
// This used to be 960 lines of hand-mirrored simulation, headed by a comment
// reading "Must match client GameEngine logic exactly". It does not implement
// the rules any more: it is an adapter over @puyolive/engine, which is now the
// single implementation the client also runs.
//
// What is left here is genuinely server-specific and does NOT belong in the
// engine:
//
//   - `executeInput`, which turns a wire symbol into an engine call. The
//     engine has a typed API; the wire has a ten-symbol alphabet. Translating
//     between them is the server's job.
//   - The replay RECORDING surface: `spawnedPieces`, `garbageColumnLog` and
//     seven event hooks, each shaped the way GameRoom wants to record it. The
//     engine reports the moments; this decides what to keep.
//
// The public surface is unchanged, so server/index.ts and server/MinesRoom.ts
// call it exactly as before.
//
// See docs/adr/0006-shared-engine-package.md.
// ═══════════════════════════════════════════════════════════════════════════════

import { GameEngine, GameState, type InputType, type PuyoPair } from '@puyolive/engine';

export class PuyoSimulator {
  /** The shared engine. Public so callers can read board state directly. */
  private readonly engine: GameEngine;

  constructor(seed: number) {
    this.engine = new GameEngine(seed);
    // Deliberately left unwired: `onSound`. An unset hook is a silent engine,
    // which is how the server stays quiet without a "headless" flag.
    this.wireRecording();
  }

  // ── Simulation surface ────────────────────────────────────────────────────
  // Thin pass-throughs. Everything below reads or writes engine state; none of
  // it reimplements any of it.

  get board(): { grid: number[][] } {
    return this.engine.board as unknown as { grid: number[][] };
  }

  get state(): GameState {
    return this.engine.state;
  }

  get stats() {
    return this.engine.stats;
  }

  get frameCount(): number {
    return this.engine.currentFrame;
  }

  get garbageQueue(): number {
    return this.engine.garbageQueue;
  }

  get nuisanceTray(): number {
    return this.engine.nuisanceTray;
  }

  get activePiece() {
    return this.engine.activePiece;
  }

  get nextPieces(): PuyoPair[] {
    return this.engine.nextPieces;
  }

  get isGameOver(): boolean {
    return this.engine.state === GameState.GAMEOVER;
  }

  /**
   * Per-player handling, set by the server from the client's `record_settings`.
   *
   * These forward to the engine's injected config rather than shadowing it.
   * The mirrored copy used to hold its own `sdf` / `softDropProtection` fields
   * that had to be kept in step with the client's SettingsManager by hand;
   * there is now one place the value lives.
   */
  get sdf(): number {
    return this.engine.config.sdf;
  }
  set sdf(value: number) {
    this.engine.config.sdf = value;
  }

  get softDropProtection(): boolean {
    return this.engine.config.softDropProtection;
  }
  set softDropProtection(value: boolean) {
    this.engine.config.softDropProtection = value;
  }

  /** Horizontal key held. Drives the glide buffer; fed by HH/HU inputs. */
  get horizontalMoveHeld(): boolean {
    return this.engine.horizontalMoveHeld;
  }
  set horizontalMoveHeld(value: boolean) {
    this.engine.horizontalMoveHeld = value;
  }

  /** Advance exactly one logical frame. */
  update(): void {
    this.engine.update();
  }

  addGarbage(amount: number): void {
    this.engine.addGarbage(amount);
  }

  computeBoardHash(): string {
    return this.engine.computeBoardHash();
  }

  /** Expose current PRNG state for debugging */
  getSeed(): number {
    return this.engine.getSeed();
  }

  // ── Wire input ────────────────────────────────────────────────────────────

  /**
   * Apply one input from the wire.
   *
   * The alphabet is validated upstream in server/index.ts before anything
   * reaches here, and unknown symbols are ignored rather than thrown on: a
   * malformed packet must not be able to kill a room.
   */
  executeInput(input: { i: string; a?: number }): void {
    switch (input.i as InputType) {
      case 'L':  this.engine.movePiece(-1); break;
      case 'R':  this.engine.movePiece(1);  break;
      case 'CW': this.engine.rotate(1);     break;
      case 'CC': this.engine.rotate(-1);    break;
      // setSoftDrop, not the `softDrop` setter: the setter also fires the
      // engine's input-recording path, which the server does not want here.
      case 'SD': this.engine.setSoftDrop(true);  break;
      case 'SU': this.engine.setSoftDrop(false); break;
      case 'HD': this.engine.hardDrop();         break;
      case 'HH': this.engine.horizontalMoveHeld = true;  break;
      case 'HU': this.engine.horizontalMoveHeld = false; break;
      case 'G':  if (input.a) this.engine.addGarbage(input.a); break;
    }
  }

  // ── Replay recording ──────────────────────────────────────────────────────
  //
  // Set by server/index.ts, which stamps each one into the room's deterministic
  // event log with the frame it fired on. Signatures are unchanged from the
  // hand-mirrored simulator, so the recorded events keep their existing shape.

  onGarbageGenerated?: (amount: number) => void;
  onGarbageOffset?: (amount: number) => void;

  onPieceSpawn?: (mainColor: number, subColor: number) => void;
  onPieceLock?: (x: number, y: number, rot: number, mainColor: number, subColor: number) => void;
  onMatchFound?: (groups: { c: number; r: number }[][], chainStep: number) => void;
  onGarbageDrop?: (columnOrder: number[], amount: number) => void;
  onChainEnd?: (maxChain: number, score: number, puyosCleared: number) => void;
  onSimGameOver?: () => void;
  onBagGenerated?: (bag: PuyoPair[]) => void;

  /** Explicit log of every piece spawned. Flattened: [main, sub, main, sub, ...] */
  spawnedPieces: number[] = [];

  /** Column order used for each garbage drop, one entry per drop. */
  garbageColumnLog: number[][] = [];

  /**
   * Attach to the engine's recording hooks.
   *
   * Done once in the constructor rather than lazily, because two of these
   * (`spawnedPieces`, `garbageColumnLog`) accumulate whether or not the server
   * has attached a listener -- server/index.ts reads them off the simulator
   * directly at match end.
   *
   * The engine's own hooks are read here and re-emitted through this object's,
   * which is what lets the server keep the signatures it already records with:
   * the engine reports "a piece spawned", the server wants "a piece spawned,
   * and these were its colours".
   */
  private wireRecording(): void {
    const e = this.engine;

    e.onBagGenerated = (bag) => this.onBagGenerated?.(bag);

    e.onPieceSpawn = () => {
      // Fires after the engine has set activePiece from the queue, so the
      // colours are readable here and need not be threaded through the hook.
      const p = e.activePiece;
      if (!p) return;
      this.spawnedPieces.push(p.mainColor, p.subColor);
      this.onPieceSpawn?.(p.mainColor, p.subColor);
    };

    e.onPieceLock = () => {
      // Fires after the piece is written to the grid but before activePiece is
      // cleared, so position and rotation are still readable. The engine passes
      // the landed cells; the server records the piece instead.
      const p = e.activePiece;
      if (!p) return;
      this.onPieceLock?.(p.x, p.y, p.rot, p.mainColor, p.subColor);
    };

    e.onMatchFound = (groups, chainStep) => this.onMatchFound?.(groups, chainStep);
    e.onChainEnd = (maxChain, score, cleared) => this.onChainEnd?.(maxChain, score, cleared);

    e.onGarbageDrop = (columnOrder, amount) => {
      this.garbageColumnLog.push([...columnOrder]);
      this.onGarbageDrop?.([...columnOrder], amount);
    };

    e.onStateChange = (state) => {
      // The engine reaches GAMEOVER from exactly two places, a blocked spawn
      // and an out-of-bounds lock, and both go through changeState. Watching
      // the transition therefore covers both without a dedicated hook.
      if (state === GameState.GAMEOVER) this.onSimGameOver?.();
    };

    e.onGarbageGenerated = (amount) => this.onGarbageGenerated?.(amount);
    e.onGarbageOffset = (amount) => this.onGarbageOffset?.(amount);
  }
}
