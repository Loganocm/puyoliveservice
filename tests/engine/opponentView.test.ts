import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { OpponentView } from '../../src/core/OpponentView';
import { MatchClock, FRAME_MS } from '../../src/core/MatchClock';
import type { InputType } from '../../src/core/ReplayEngine';
import { COLS, TOTAL_ROWS, PuyoColor } from '../../src/core/Constants';
import { GOLDEN_SEEDS, pinSettings } from '../helpers/scriptedRun';

/**
 * OPPONENT VIEW
 *
 * The claim: relaying a player's inputs is enough to reproduce their board
 * exactly on the other machine, so the opponent panel is a real view of them
 * playing rather than a rate-limited slideshow.
 *
 * These tests play a match, capture the input stream the way the wire carries
 * it, feed ONLY that stream to an OpponentView, and require the resulting
 * board to match the sender's grid cell for cell.
 *
 * See docs/adr/0004-opponent-simulation.md.
 */

/** Drive the shared clock from fake timers so frame numbers are deterministic. */
function setClockToFrame(startAt: number, frame: number): void {
    vi.setSystemTime(startAt + Math.ceil(frame * FRAME_MS) + 1);
}

function columnTop(grid: number[][], c: number): number {
    for (let r = 0; r < TOTAL_ROWS; r++) if (grid[c][r] !== PuyoColor.None) return r;
    return TOTAL_ROWS;
}

interface Recorded {
    inputs: { f: number; i: InputType; a?: number }[];
    grid: number[][];
    frames: number;
}

/** Play a match, recording inputs exactly as the client relays them. */
function playAndRecord(seed: number, maxFrames: number): Recorded {
    pinSettings();
    const engine = new GameEngine(seed);
    const inputs: { f: number; i: InputType; a?: number }[] = [];
    const rec = (i: InputType) => inputs.push({ f: engine.currentFrame, i });

    for (let f = 0; f < maxFrames; f++) {
        engine.update();

        if (engine.state === 1 /* ACTIVE */ && engine.activePiece) {
            let best = -Infinity;
            let bestCol = engine.activePiece.x;
            const { mainColor } = engine.activePiece;
            for (let c = 0; c < COLS; c++) {
                const top = columnTop(engine.board.grid, c);
                if (top <= 2) continue;
                let s = top * 1.0;
                if (top < TOTAL_ROWS && engine.board.grid[c][top] === mainColor) s += 8;
                if (s > best) { best = s; bestCol = c; }
            }
            while (engine.activePiece.x > bestCol && engine.movePiece(-1)) rec('L');
            while (engine.activePiece.x < bestCol && engine.movePiece(1)) rec('R');
            // Rotate sometimes so the stream is not only movement + drops.
            if (engine.currentFrame % 7 === 0 && engine.rotate(1)) rec('CW');
            engine.hardDrop();
            rec('HD');
        }

        if (engine.state === 6 /* GAMEOVER */) break;
    }

    return {
        inputs,
        grid: engine.board.grid.map((col) => [...col]),
        frames: engine.currentFrame,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    MatchClock.reset();
    (MatchClock as any).offsetMs = 0;
    (MatchClock as any).synced = false;
    (MatchClock as any).bestRttMs = Number.POSITIVE_INFINITY;
    pinSettings();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('reconstruction from the input stream', () => {
    /**
     * The core claim. If this holds, the opponent panel is showing the real
     * board, not an approximation of it.
     */
    it('reproduces the sender\'s board exactly for every golden seed', () => {
        const failures: string[] = [];

        for (const seed of GOLDEN_SEEDS) {
            const match = playAndRecord(seed, 6000);

            const startAt = Date.now();
            MatchClock.startMatch(startAt);
            const view = new OpponentView(seed);

            // Deliver every input up front, as if the network were instant, then
            // run the clock past the end of the match so the view catches up.
            for (const inp of match.inputs) view.receiveInput(inp.f, inp.i, inp.a);

            // Advance in rendered-frame-sized steps, honouring the catch-up clamp.
            for (let f = 0; f <= match.frames + 200; f++) {
                setClockToFrame(startAt, f);
                view.update();
            }
            // Drain any residual catch-up the clamp deferred.
            for (let i = 0; i < 500 && view.frame < match.frames; i++) view.update();

            const mine = view.board.grid;
            let mismatched = 0;
            for (let c = 0; c < COLS; c++) {
                for (let r = 0; r < TOTAL_ROWS; r++) {
                    if (mine[c][r] !== match.grid[c][r]) mismatched++;
                }
            }
            if (mismatched > 0) {
                failures.push(`seed ${seed}: ${mismatched} cells differ (view frame ${view.frame}, sender ${match.frames})`);
            }
        }

        console.log(
            `[opponent view] ${GOLDEN_SEEDS.length - failures.length}/${GOLDEN_SEEDS.length} boards reproduced exactly`,
        );
        expect(failures.join('\n')).toBe('');
    }, 60_000);

    it('produces a non-trivial board, so the comparison means something', () => {
        // A test that compares two empty boards passes for the wrong reason.
        const match = playAndRecord(42, 6000);
        const filled = match.grid.flat().filter((v) => v !== PuyoColor.None).length;
        expect(match.inputs.length).toBeGreaterThan(50);
        expect(filled).toBeGreaterThan(10);
    });
});

describe('display lag', () => {
    it('renders behind the shared clock by the jitter buffer', () => {
        // Their inputs cannot arrive before they happen, so trailing slightly is
        // correct. What matters is that it is bounded and steady.
        const startAt = Date.now();
        MatchClock.startMatch(startAt);
        const view = new OpponentView(1);

        setClockToFrame(startAt, 120);
        view.update();

        const behind = MatchClock.targetFrame() - view.frame;
        expect(behind).toBeGreaterThan(0);
        expect(view.displayLagMs).toBeLessThanOrEqual(400);
    });

    it('sizes the buffer from measured round-trip time', () => {
        // A fast connection should get a tighter view than a slow one rather
        // than a fixed pessimistic delay.
        const t0 = Date.now();
        MatchClock.addSample(t0, t0, t0 + 20); // 20ms RTT
        MatchClock.startMatch(t0);
        const fast = new OpponentView(1).displayLagMs;

        (MatchClock as any).bestRttMs = Number.POSITIVE_INFINITY;
        MatchClock.addSample(t0, t0, t0 + 300); // 300ms RTT
        const slow = new OpponentView(1).displayLagMs;

        expect(slow).toBeGreaterThan(fast);
    });
});

describe('resilience', () => {
    it('still applies inputs that arrive after their frame', () => {
        // Dropping a late input would leave the simulation permanently wrong.
        // Applying it slightly out of time is the lesser error.
        const startAt = Date.now();
        MatchClock.startMatch(startAt);
        const view = new OpponentView(42);

        setClockToFrame(startAt, 300);
        view.update();
        const before = view.stats.lateArrivals;

        view.receiveInput(1, 'HD'); // long past
        expect(view.stats.lateArrivals).toBe(before + 1);
    });

    it('reconciles only when the reported grid actually differs', () => {
        // The simulation is the mechanism; snapshots are a safety net. Writing
        // on every snapshot would reintroduce the visual popping this replaced.
        const startAt = Date.now();
        MatchClock.startMatch(startAt);
        const view = new OpponentView(42);

        const identical = view.board.grid.map((c) => [...c]);
        view.reconcile(identical);
        expect(view.stats.corrections).toBe(0);

        const different = view.board.grid.map((c) => [...c]);
        different[0][TOTAL_ROWS - 1] = PuyoColor.Red;
        view.reconcile(different);
        expect(view.stats.corrections).toBe(1);
        expect(view.board.grid[0][TOTAL_ROWS - 1]).toBe(PuyoColor.Red);
    });

    it('ignores malformed grids rather than corrupting the view', () => {
        const startAt = Date.now();
        MatchClock.startMatch(startAt);
        const view = new OpponentView(42);

        view.reconcile([] as any);
        view.reconcile([[1, 2], [3]] as any);
        view.reconcile(null as any);
        expect(view.stats.corrections).toBe(0);
        expect(view.board.grid.length).toBe(COLS);
    });

    it('does not advance before the match starts', () => {
        const view = new OpponentView(42);
        view.update();
        expect(view.frame).toBe(0);
    });
});
