// A small placement bot for end-to-end tests and recordings.
//
// It plans with the real engine (packages/engine/dist, so run
// `npm run build:engine` first): for each piece it tries every column and
// rotation, looks one piece ahead, and scores the resulting board. It is not a
// strong player and does not need to be; it needs to play legal, varied,
// reproducible games that attack, defend and eventually top out.

import { GameEngine, GameState, COLS, TOTAL_ROWS } from '../../packages/engine/dist/index.js';

/** Simulate placing `pair` at column `x` with rotation `rot` on `grid`. */
export function simulate(grid, pair, x, rot) {
    const e = new GameEngine(1);
    e.board.grid = grid.map(col => [...col]);
    e.nextPieces = [pair, ...e.nextPieces].slice(0, 3);
    e.update(); // spawns `pair`
    if (!e.activePiece) return null;
    // Same presses keysFor() will send: three clockwise turns are one counter-clockwise turn.
    if (rot === 3) e.rotate(-1); else for (let k = 0; k < rot; k++) e.rotate(1);
    const dx = x - e.activePiece.x;
    for (let k = 0; k < Math.abs(dx); k++) e.movePiece(Math.sign(dx));
    if (e.activePiece.x !== x || e.activePiece.rot !== rot) return null;
    e.hardDrop();
    for (let f = 0; f < 3000 && e.state !== GameState.ACTIVE && e.state !== GameState.GAMEOVER; f++) e.update();
    return {
        grid: e.board.grid.map(col => [...col]),
        sent: e.stats.garbageSent,
        chain: e.stats.maxChain,
        dead: e.state === GameState.GAMEOVER,
    };
}

const heights = grid => grid.map(col => { for (let r = 0; r < TOTAL_ROWS; r++) if (col[r]) return TOTAL_ROWS - r; return 0; });

const OBJECTIVES = {
    /** Send as much garbage as possible, without dying. */
    attack: (res) => {
        const h = heights(res.grid);
        return res.sent * 1000 + res.chain * 150 - Math.max(...h) * 8 - h[2] * 12;
    },
    /** Stay low and alive; take small pops when they come. */
    survive: (res) => {
        const h = heights(res.grid);
        return res.sent * 60 - Math.max(...h) * 25 - h.reduce((a, b) => a + b, 0) * 2 - h[2] * 30;
    },
};

/**
 * Choose a placement for `current`, looking one piece (`next`) ahead.
 * Returns { x, rot } or null if nothing is legal.
 */
export function plan(grid, current, next, objective = 'attack') {
    const score = OBJECTIVES[objective];
    let best = null;
    for (let x = 0; x < COLS; x++) for (let rot = 0; rot < 4; rot++) {
        const a = simulate(grid, current, x, rot);
        if (!a) continue;
        let value = a.dead ? -1e9 : score(a);
        if (!a.dead && next) {
            let bestNext = -1e9;
            for (let x2 = 0; x2 < COLS; x2++) for (let r2 = 0; r2 < 4; r2++) {
                const b = simulate(a.grid, next, x2, r2);
                if (b) bestNext = Math.max(bestNext, b.dead ? -1e9 : score({ ...b, sent: a.sent + b.sent, chain: Math.max(a.chain, b.chain) }));
            }
            value = Math.max(value, bestNext);
        }
        if (!best || value > best.value) best = { x, rot, value };
    }
    return best;
}

/** Key presses that realise a placement from the spawn position (x = 2, rot = 0). */
export function keysFor({ x, rot }) {
    const keys = [];
    // Clockwise is X, counter-clockwise Z (default bindings). Three clockwise
    // turns are one counter-clockwise turn.
    if (rot === 3) keys.push('KeyZ'); else for (let k = 0; k < rot; k++) keys.push('KeyX');
    const dx = x - 2;
    for (let k = 0; k < Math.abs(dx); k++) keys.push(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    keys.push('Space');
    return keys;
}
