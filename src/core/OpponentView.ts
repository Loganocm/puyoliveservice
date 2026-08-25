import { GameEngine } from './GameEngine';
import { MatchClock, FRAME_MS } from './MatchClock';
import type { InputType } from './ReplayEngine';

/**
 * OpponentView — the opponent's board, simulated locally rather than relayed.
 *
 * WHY THIS EXISTS
 *
 * The opponent's board used to arrive as serialised grids pushed on every board
 * change. The server rate-limits that event to 10/s and silently drops the
 * excess, so the view skipped states outright: pieces teleported, chains
 * appeared half-finished, and there was no frame reference to align to. It was
 * a slideshow of whatever packets survived.
 *
 * Both players' engines are seeded identically and the engine is deterministic,
 * so the opponent's board can instead be *reconstructed* from their inputs.
 * This is the same mechanism replays use — one input stream now feeds live
 * spectating, replay playback and the server's mirrored simulation.
 *
 *   - Smooth: renders every frame at 60fps instead of 10 snapshots per second.
 *   - Accurate: reproduces their board exactly rather than approximating it.
 *   - Cheaper: a few input events per second instead of 84-number grids at 10Hz.
 *
 * It depends on MatchClock: reconstruction is only meaningful if frame N means
 * the same instant on both machines. See docs/adr/0003-shared-match-clock.md.
 *
 * ── Display lag ──
 *
 * Their inputs cannot arrive before they happen, so the view is rendered
 * deliberately behind the local clock by a jitter buffer. Roughly one
 * round-trip plus margin — around 100–150ms typically, which reads as
 * "watching them live" rather than as lag. Rendering at the current frame
 * instead would mean constantly simulating frames whose inputs have not
 * arrived, then correcting: visibly worse than a small, steady delay.
 */
export class OpponentView {
    private engine: GameEngine;

    /** Inputs not yet applied, keyed by the frame they were taken on. */
    private pending: { f: number; i: InputType; a?: number }[] = [];

    /** How far behind the shared clock we render, in frames. */
    private jitterFrames = 8;

    /** Inputs that arrived after their frame had already been simulated. */
    private lateArrivals = 0;

    /** Grid corrections applied because simulation drifted from the truth. */
    private corrections = 0;

    private static readonly MIN_JITTER = 6;
    private static readonly MAX_JITTER = 24; // 400ms; beyond this it reads as lag
    private static readonly CATCHUP_LIMIT = 8;

    constructor(seed: number) {
        this.engine = new GameEngine(seed);
        // Suppress sound and the replay-only branches; this engine exists to be
        // looked at, not played.
        this.engine.isReplaying = true;
        this.sizeBufferFromRtt();
    }

    /** The simulated board, for rendering. */
    get board() { return this.engine.board; }

    /** The opponent's active piece, or null between pieces. */
    get activePiece() { return this.engine.activePiece; }

    get garbageQueue() { return this.engine.garbageQueue; }
    get nuisanceTray() { return this.engine.nuisanceTray; }
    get score() { return this.engine.stats.score; }
    get frame() { return this.engine.currentFrame; }

    /** Diagnostics, surfaced by the debug overlay. */
    get stats() {
        return {
            frame: this.engine.currentFrame,
            behind: this.targetFrame() - this.engine.currentFrame,
            jitterFrames: this.jitterFrames,
            pending: this.pending.length,
            lateArrivals: this.lateArrivals,
            corrections: this.corrections,
        };
    }

    /**
     * Queue an input received from the opponent.
     *
     * Inputs whose frame has already been simulated are applied immediately.
     * They are slightly misplaced in time, but dropping them would leave the
     * simulation permanently wrong, which is worse. Repeated late arrivals grow
     * the jitter buffer so the view self-tunes to the connection.
     */
    receiveInput(frame: number, input: InputType, amount?: number): void {
        if (!Number.isFinite(frame) || frame < 0) return;

        if (frame < this.engine.currentFrame) {
            this.lateArrivals++;
            this.applyInput(input, amount);
            // Widen the buffer so the next few land in time. Grows slowly and
            // caps out, so one bad burst does not push the view into real lag.
            if (this.lateArrivals % 4 === 0) {
                this.jitterFrames = Math.min(OpponentView.MAX_JITTER, this.jitterFrames + 1);
            }
            return;
        }

        this.pending.push({ f: frame, i: input, a: amount });
    }

    /**
     * Size the buffer from the measured round trip.
     *
     * Their input needs roughly one one-way trip to reach us, plus margin for
     * jitter. Starting from the real RTT means a player on a fast connection
     * gets a near-live view instead of a fixed pessimistic delay, while a
     * player on a slow one starts wide enough to avoid a burst of late
     * arrivals. Only ever widens after this — see receiveInput.
     */
    private sizeBufferFromRtt(): void {
        const oneWayFrames = Math.ceil(MatchClock.rttMs / 2 / FRAME_MS);
        this.jitterFrames = Math.max(
            OpponentView.MIN_JITTER,
            Math.min(OpponentView.MAX_JITTER, oneWayFrames + 4),
        );
    }

    /** The frame we want to be showing: the shared clock, minus the buffer. */
    private targetFrame(): number {
        return Math.max(0, MatchClock.targetFrame() - this.jitterFrames);
    }

    /**
     * Advance the simulation toward the display frame, applying inputs as their
     * frames come up. Call once per rendered frame.
     */
    update(): void {
        if (!MatchClock.hasMatch) return;

        const target = this.targetFrame();
        let steps = target - this.engine.currentFrame;
        if (steps <= 0) return;

        // Bounded like the local engine: a stall must not turn into a
        // fast-forward that costs more than the frames it reclaims.
        steps = Math.min(steps, OpponentView.CATCHUP_LIMIT);

        for (let i = 0; i < steps; i++) {
            // Inputs are stamped AFTER the update that produced their frame, so
            // an input on frame N is applied before update(N+1). This mirrors
            // ReplaySimulator exactly; diverging here would make the live view
            // and playback disagree about the same input stream.
            const now = this.engine.currentFrame;
            for (let p = 0; p < this.pending.length; ) {
                if (this.pending[p].f <= now) {
                    const { i: input, a } = this.pending[p];
                    this.applyInput(input, a);
                    this.pending.splice(p, 1);
                } else {
                    p++;
                }
            }
            this.engine.update();
        }
    }

    private applyInput(input: InputType, amount?: number): void {
        switch (input) {
            case 'L':  this.engine.movePiece(-1);              break;
            case 'R':  this.engine.movePiece(1);               break;
            case 'CW': this.engine.rotate(1);                  break;
            case 'CC': this.engine.rotate(-1);                 break;
            case 'SD': this.engine.setSoftDrop(true);          break;
            case 'SU': this.engine.setSoftDrop(false);         break;
            case 'HD': this.engine.hardDrop();                 break;
            case 'HH': this.engine.horizontalMoveHeld = true;  break;
            case 'HU': this.engine.horizontalMoveHeld = false; break;
            case 'G':  if (amount) this.engine.addGarbage(amount); break;
        }
    }

    /**
     * Reconcile against a board the opponent actually reported.
     *
     * The simulation should already agree, so this is a safety net rather than
     * the mechanism: it only writes when the grids differ, which keeps the
     * common case free of visual pops. A rising correction count means inputs
     * are being lost, not merely delayed.
     */
    reconcile(grid: number[][]): void {
        if (!Array.isArray(grid) || grid.length !== this.engine.board.grid.length) return;

        let differs = false;
        for (let c = 0; c < grid.length && !differs; c++) {
            const col = grid[c];
            const mine = this.engine.board.grid[c];
            if (!Array.isArray(col) || col.length !== mine.length) return;
            for (let r = 0; r < col.length; r++) {
                if (col[r] !== mine[r]) { differs = true; break; }
            }
        }
        if (!differs) return;

        this.corrections++;
        this.engine.board.updateFromData(grid);
    }

    /** Milliseconds the view currently trails real time by. */
    get displayLagMs(): number {
        return this.jitterFrames * FRAME_MS;
    }

    dispose(): void {
        this.pending.length = 0;
    }
}
