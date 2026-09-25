/**
 * Piece handling (src/input/Handling.ts): DAS, ARR, taps, spawn behaviour
 * and the order inputs are recorded in. Every expectation is in logical
 * frames, which is the point: the same key timings give the same result on
 * any monitor.
 */
import { describe, expect, it } from 'vitest';
import { HandlingController } from '../../src/input/Handling';
import type { FrameInput, HandlingEngine, InputCode, PlayAction } from '../../src/input/Handling';

/** A board six columns wide with one piece that only moves sideways. */
class FakeEngine implements HandlingEngine {
    activePiece: { x: number } | null = { x: 2 };
    softDrop = false;
    horizontalMoveHeld = false;
    rotations = 0;
    drops = 0;
    movePiece(dx: number): boolean {
        if (!this.activePiece) return false;
        const x = this.activePiece.x + dx;
        if (x < 0 || x > 5) return false;
        this.activePiece.x = x;
        return true;
    }
    rotate(): boolean { this.rotations++; return true; }
    hardDrop(): boolean { this.drops++; return true; }
}

const input = (pressed: PlayAction[] = [], held: PlayAction[] = []): FrameInput => ({ pressed: new Set(pressed), held: new Set(held) });

/** Run `frames` frames with a key held from frame 0, returning the frames on which the piece moved. */
function holdRight(frames: number, das: number, arr: number, engine = new FakeEngine()) {
    const h = new HandlingController();
    const moves: number[] = [];
    for (let f = 0; f < frames; f++) {
        const x = engine.activePiece!.x;
        h.frame(engine, f === 0 ? input(['moveRight'], ['moveRight']) : input([], ['moveRight']), { das, arr });
        if (engine.activePiece!.x !== x) moves.push(f);
    }
    return moves;
}

describe('HandlingController', () => {
    it('moves once on a press, then waits DAS frames, then repeats every ARR frames', () => {
        const engine = new FakeEngine();
        engine.activePiece = { x: 0 };
        expect(holdRight(20, 10, 2, engine)).toEqual([0, 10, 12, 14, 16]);
    });

    it('with ARR 0, goes straight to the wall when DAS charges', () => {
        const engine = new FakeEngine();
        engine.activePiece = { x: 0 };
        const moves = holdRight(15, 10, 0, engine);
        expect(moves).toEqual([0, 10]);
        expect(engine.activePiece.x).toBe(5);
    });

    it('counts a tap that was pressed and released between two frames', () => {
        const engine = new FakeEngine();
        const h = new HandlingController();
        h.frame(engine, input(['moveLeft'], []), { das: 10, arr: 2 });
        expect(engine.activePiece!.x).toBe(1);
        h.frame(engine, input(['hardDrop'], []), { das: 10, arr: 2 });
        expect(engine.drops).toBe(1);
    });

    it('does not move when both directions are pressed in the same frame', () => {
        const engine = new FakeEngine();
        const h = new HandlingController();
        h.frame(engine, input(['moveLeft', 'moveRight'], ['moveLeft', 'moveRight']), { das: 10, arr: 2 });
        expect(engine.activePiece!.x).toBe(2);
    });

    it('hands back to a still-held direction as a fresh press when the newer one is released', () => {
        const engine = new FakeEngine();
        const h = new HandlingController();
        const s = { das: 10, arr: 2 };
        h.frame(engine, input(['moveLeft'], ['moveLeft']), s);            // x 1
        h.frame(engine, input(['moveRight'], ['moveLeft', 'moveRight']), s); // x 2
        h.frame(engine, input([], ['moveLeft']), s);                       // right released: left again, x 1
        expect(engine.activePiece!.x).toBe(1);
    });

    it('moves a new piece on its first frame when DAS is already charged, then keeps ARR', () => {
        const engine = new FakeEngine();
        engine.activePiece = null;
        const h = new HandlingController();
        const s = { das: 5, arr: 3 };
        h.frame(engine, input(['moveRight'], ['moveRight']), s);
        for (let f = 1; f < 20; f++) h.frame(engine, input([], ['moveRight']), s); // charged, no piece
        engine.activePiece = { x: 0 };
        const moves: number[] = [];
        for (let f = 0; f < 8; f++) {
            const x = engine.activePiece.x;
            h.frame(engine, input([], ['moveRight']), s);
            if (engine.activePiece.x !== x) moves.push(f);
        }
        expect(moves).toEqual([0, 3, 6]);
    });

    it('rotates only while there is a piece', () => {
        const engine = new FakeEngine();
        engine.activePiece = null;
        const h = new HandlingController();
        h.frame(engine, input(['rotateCW'], []), { das: 10, arr: 2 });
        expect(engine.rotations).toBe(0);
        engine.activePiece = { x: 2 };
        h.frame(engine, input(['rotateCW', 'rotateCCW'], []), { das: 10, arr: 2 });
        expect(engine.rotations).toBe(2);
    });

    it('records every change, in the order the replay format expects', () => {
        const engine = new FakeEngine();
        const h = new HandlingController();
        const log: InputCode[] = [];
        h.frame(engine, input(['moveLeft', 'rotateCW', 'softDrop', 'hardDrop'], ['moveLeft', 'softDrop']), { das: 10, arr: 2 }, { record: c => log.push(c) });
        h.frame(engine, input([], []), { das: 10, arr: 2 }, { record: c => log.push(c) });
        expect(log).toEqual(['L', 'CW', 'SD', 'HH', 'HD', 'SU', 'HU']);
    });

    it('leaves the glide buffer alone when glide is off (Puyo Mines)', () => {
        const engine = new FakeEngine();
        const h = new HandlingController({ glide: false });
        const log: InputCode[] = [];
        h.frame(engine, input(['moveLeft'], ['moveLeft']), { das: 10, arr: 2 }, { record: c => log.push(c) });
        expect(log).toEqual(['L']);
        expect(engine.horizontalMoveHeld).toBe(false);
    });

    it('does not record a move that the board refused', () => {
        const engine = new FakeEngine();
        engine.activePiece = { x: 0 };
        const h = new HandlingController();
        const log: InputCode[] = [];
        h.frame(engine, input(['moveLeft'], []), { das: 10, arr: 2 }, { record: c => log.push(c) });
        expect(log).not.toContain('L');
    });
});
