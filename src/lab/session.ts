/**
 * LabSession: drives one scenario against one engine and records a trace.
 *
 * Pure: no DOM, no renderer. The same session runs headless under Vitest
 * (src/lab/run.ts) and inside the real GameScene in the browser
 * (src/lab/LabDriver.ts), so the tests and the recorded videos describe the
 * same simulation, and the recorder checks that they agree.
 *
 * Per logical frame the caller does:
 *
 *     session.beforeStep(engine);   // notes anything the input layer changed
 *     engine.update();
 *     const keys = session.afterStep(engine);  // records, applies due inputs
 *     // (browser only) dispatch `keys` as real keyboard events
 *
 * Inputs stamped frame N are applied AFTER the update of frame N, exactly as
 * live play and ReplaySimulator order them (website/src/content/docs/reference/replay-format.md, "The ordering invariant",
 * now website/src/content/docs/reference/replay-format.md).
 */

import { COLS, HIDDEN_ROWS, TOTAL_ROWS, PuyoColor, GameState, DEFAULT_ENGINE_CONFIG } from '@puyolive/engine';
import type { GameEngine, InputType, PuyoPair } from '@puyolive/engine';
import { parseBoard, parsePair } from './board';
import type { Scenario, ScriptStep, KeyAction } from './scenarios';

export type StateName = keyof typeof GameState;
const STATE_NAME: Record<number, StateName> = Object.fromEntries(
    Object.entries(GameState).map(([k, v]) => [v, k as StateName]),
) as Record<number, StateName>;
export const stateName = (s: number): StateName => STATE_NAME[s];

export type InputEffect =
    | 'moved' | 'blocked'
    | 'rotated' | 'wallKick' | 'floorKick' | 'diagonalKick' | 'rotateBlocked'
    | 'applied' | 'ignored';

/** One observed moment. `f` is the engine frame it happened on. */
export type TraceEvent =
    | { f: number; t: 'state'; from: StateName; to: StateName }
    | { f: number; t: 'spawn'; piece: number; pair: string; softDropHeld: boolean }
    | { f: number; t: 'lock'; piece: number; cells: { c: number; r: number }[]; groundedFrames: number; glideFrames: number; resets: number; softDrop: boolean; hardDrop: boolean }
    | { f: number; t: 'hardDrop' }
    | { f: number; t: 'fall'; rows: number; softDrop: boolean }
    | { f: number; t: 'split'; cells: number }
    | { f: number; t: 'gravityLanded'; cells: number; afterPop: boolean }
    | { f: number; t: 'chainStep'; chain: number; groups: number[]; colours: number; garbageCleared: number; hiddenRow: boolean; duration: number }
    | { f: number; t: 'allClear' }
    | { f: number; t: 'garbageSent'; amount: number }
    | { f: number; t: 'offset'; amount: number }
    | { f: number; t: 'garbageDrop'; amount: number; unevenStack: boolean; remaining: number }
    | { f: number; t: 'sound'; sound: string; value?: number }
    | { f: number; t: 'input'; i: InputType; a?: number; effect: InputEffect }
    | { f: number; t: 'meter'; rocks: number }
    | { f: number; t: 'ghostUneven'; piece: number }
    | { f: number; t: 'clientMove'; dx: number; onSpawnFrame: boolean }
    | { f: number; t: 'key'; action: KeyAction; down: boolean }
    | { f: number; t: 'tap'; action: KeyAction }
    | { f: number; t: 'client'; what: 'timeUp' | 'pauseOpen' | 'pauseClose' | 'xMarker' | 'timer' | 'arrZero' };

/** A keyboard action for the browser to dispatch, in order. */
export interface KeyDispatch { action: KeyAction; down: boolean }

/** Cells a pair occupies. */
function pairCells(p: { x: number; y: number; rot: number }) {
    const off = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.rot];
    return [{ c: p.x, r: p.y }, { c: p.x + off[0], r: p.y + off[1] }];
}

function cellFree(grid: number[][], c: number, r: number): boolean {
    if (c < 0 || c >= COLS) return false;
    if (r < 0) return true;
    if (r >= TOTAL_ROWS) return false;
    return grid[c][r] === PuyoColor.None;
}

/** True when the active pair cannot move down (mirrors GameEngine.canMove). */
export function isGrounded(engine: GameEngine): boolean {
    const p = engine.activePiece;
    if (!p) return false;
    return !pairCells({ ...p, y: p.y + 1 }).every(({ c, r }) => cellFree(engine.board.grid, c, r));
}

function columnHeight(grid: number[][], c: number): number {
    for (let r = 0; r < TOTAL_ROWS; r++) if (grid[c][r] !== PuyoColor.None) return TOTAL_ROWS - r;
    return 0;
}

const pairText = (p: PuyoPair) => 'xRGBYPO'[p.mainColor] + 'xRGBYPO'[p.subColor];

interface PieceAnchors { spawn?: number; grounded?: number; lock?: number; y: Map<number, number> }

export class LabSession {
    readonly trace: TraceEvent[] = [];
    private engine!: GameEngine;
    private piece = 0;
    private anchors = new Map<number, PieceAnchors>();
    private done = new Set<number>();
    private prevState: number = GameState.SPAWN;

    // Per-piece lock bookkeeping
    private groundedFrames = 0;
    private glideFrames = 0;
    private resets = 0;
    private lastHardDrop = false;
    private sawGhostUneven = false;

    // Motion bookkeeping
    private afterSnapshot: { x: number; y: number; rot: number } | null = null;
    private beforeUpdateY: number | null = null;
    /** True between beforeStep and afterStep: hooks firing now fire inside engine.update(). */
    private inUpdate = false;
    private spawnedThisFrame = false;
    private turnHadPop = false;
    private splitCheckPending = false;
    private maxMeter = 0;

    readonly scenario: Scenario;

    constructor(scenario: Scenario) {
        this.scenario = scenario;
    }

    get frame(): number { return this.engine ? this.engine.currentFrame : 0; }
    get finished(): boolean { return this.frame >= this.scenario.frames; }

    /**
     * Apply the scenario's fixture and wrap the engine's hooks. Existing hooks
     * (the renderer's, in the browser) are preserved and still called.
     */
    attach(engine: GameEngine): void {
        this.engine = engine;
        const s = this.scenario;

        engine.config = { ...DEFAULT_ENGINE_CONFIG, ...s.config };
        if (s.board) engine.board.grid = parseBoard(s.board);
        if (s.queue) {
            const pairs = s.queue.map(parsePair);
            // The next queue is public; the bag behind it is private until the
            // engine gains a proper fixture/snapshot API (ENG-01). Tooling only.
            engine.nextPieces = [...pairs.slice(0, 3), ...engine.nextPieces].slice(0, 3);
            (engine as unknown as { currentBag: PuyoPair[] }).currentBag = pairs.slice(3);
        }

        const wrap = <K extends keyof GameEngine>(name: K, spy: (...args: any[]) => void) => {
            const original = engine[name] as unknown as ((...a: any[]) => void) | undefined;
            (engine as any)[name] = (...args: any[]) => { spy(...args); original?.(...args); };
        };

        wrap('onStateChange', (to: number) => {
            this.trace.push({ f: this.frame, t: 'state', from: stateName(this.prevState), to: stateName(to) });
            if (this.prevState === GameState.ACTIVE && to === GameState.FALLING) this.splitCheckPending = true;
            if (to === GameState.SPAWN) this.turnHadPop = false;
            this.prevState = to;
        });
        wrap('onPieceSpawn', () => {
            this.piece++;
            const p = engine.activePiece!;
            this.anchors.set(this.piece, { spawn: this.frame, y: new Map() });
            this.groundedFrames = 0; this.glideFrames = 0; this.resets = 0; this.lastHardDrop = false; this.sawGhostUneven = false;
            this.spawnedThisFrame = true;
            this.trace.push({ f: this.frame, t: 'spawn', piece: this.piece, pair: pairText(p), softDropHeld: engine.softDrop });
        });
        wrap('onHardDrop', () => { this.lastHardDrop = true; this.trace.push({ f: this.frame, t: 'hardDrop' }); });
        wrap('onPieceLock', (cells: { c: number; r: number }[]) => {
            const p = engine.activePiece;
            // A soft or sonic drop can land and lock inside one update, before
            // afterStep can see the piece move, so record the fall here.
            if (this.inUpdate && p && this.beforeUpdateY !== null && p.y > this.beforeUpdateY) {
                this.trace.push({ f: this.frame, t: 'fall', rows: p.y - this.beforeUpdateY, softDrop: engine.softDrop });
            }
            const anchors = this.anchors.get(this.piece);
            if (anchors) anchors.lock = this.frame;
            this.trace.push({
                f: this.frame, t: 'lock', piece: this.piece, cells: cells.map(c => ({ ...c })),
                groundedFrames: this.groundedFrames, glideFrames: this.glideFrames, resets: this.resets,
                softDrop: engine.softDrop, hardDrop: this.lastHardDrop,
            });
        });
        wrap('onGravityLanded', (cells: unknown[]) => {
            this.trace.push({ f: this.frame, t: 'gravityLanded', cells: cells.length, afterPop: this.turnHadPop });
        });
        wrap('onChainStep', (chain: number) => {
            this.turnHadPop = true;
            const groups = engine.matchedPuyos;
            const colourGroups = groups.filter(g => g.length && engine.board.grid[g[0].c][g[0].r] !== PuyoColor.Garbage);
            const colours = new Set(colourGroups.map(g => engine.board.grid[g[0].c][g[0].r])).size;
            const garbageCleared = groups
                .filter(g => g.length && engine.board.grid[g[0].c][g[0].r] === PuyoColor.Garbage)
                .reduce((n, g) => n + g.length, 0);
            const hiddenRow = colourGroups.some(g => g.some(p => p.r < HIDDEN_ROWS));
            this.trace.push({
                f: this.frame, t: 'chainStep', chain, groups: colourGroups.map(g => g.length),
                colours, garbageCleared, hiddenRow,
                duration: engine.getChainScaledDuration(engine.POP_ANIM_DURATION),
            });
        });
        wrap('onAllClear', () => this.trace.push({ f: this.frame, t: 'allClear' }));
        wrap('onGarbageGenerated', (amount: number) => this.trace.push({ f: this.frame, t: 'garbageSent', amount }));
        wrap('onGarbageOffset', (amount: number) => this.trace.push({ f: this.frame, t: 'offset', amount }));
        wrap('onGarbageDrop', (_cols: number[], amount: number) => {
            const heights = Array.from({ length: COLS }, (_, c) => columnHeight(engine.board.grid, c));
            this.trace.push({
                f: this.frame, t: 'garbageDrop', amount,
                unevenStack: Math.max(...heights) > 0 && new Set(heights).size > 1,
                remaining: engine.garbageQueue - amount,
            });
        });
        wrap('onSound', (sound: string, value?: number) => this.trace.push({ f: this.frame, t: 'sound', sound, value }));
    }

    /** Call immediately before engine.update(). */
    beforeStep(engine: GameEngine): void {
        // Anything that changed since afterStep was done by the client's input
        // layer (keyboard-driven scenarios in the browser).
        const p = engine.activePiece;
        if (p && this.afterSnapshot && p.x !== this.afterSnapshot.x) {
            this.trace.push({ f: this.frame, t: 'clientMove', dx: p.x - this.afterSnapshot.x, onSpawnFrame: this.spawnedThisFrame });
        }
        this.spawnedThisFrame = false;
        this.beforeUpdateY = p ? p.y : null;
        this.inUpdate = true;
    }

    /**
     * Call immediately after engine.update(). Records what the frame did,
     * applies the scenario's engine inputs due on this frame, and returns the
     * keyboard actions due on this frame for the browser to dispatch.
     */
    afterStep(engine: GameEngine): KeyDispatch[] {
        this.inUpdate = false;
        const f = this.frame;
        const p = engine.activePiece;

        // Natural or soft-drop fall during this update.
        if (p && this.beforeUpdateY !== null && p.y > this.beforeUpdateY && engine.state === GameState.ACTIVE) {
            this.trace.push({ f, t: 'fall', rows: p.y - this.beforeUpdateY, softDrop: engine.softDrop });
        }

        // A split: the first FALLING frame after a lock has puyos to drop.
        if (this.splitCheckPending && engine.state === GameState.FALLING) {
            this.splitCheckPending = false;
            if (engine.fallingDestinations.length > 0) this.trace.push({ f, t: 'split', cells: engine.fallingDestinations.length });
        } else if (this.splitCheckPending && engine.state !== GameState.FALLING) {
            this.splitCheckPending = false;
        }

        if (p && engine.state === GameState.ACTIVE) {
            if (isGrounded(engine)) {
                this.groundedFrames++;
                if (engine.horizontalMoveHeld) this.glideFrames++;
            }
            const anchors = this.anchors.get(this.piece);
            if (anchors) {
                if (anchors.grounded === undefined && isGrounded(engine)) anchors.grounded = f;
                for (let y = -1; y <= p.y; y++) if (!anchors.y.has(y)) anchors.y.set(y, f);
            }
            if (!this.sawGhostUneven && p.rot % 2 === 1) {
                const [a, b] = pairCells(p);
                if (columnHeight(engine.board.grid, a.c) !== columnHeight(engine.board.grid, b.c)) {
                    this.sawGhostUneven = true;
                    this.trace.push({ f, t: 'ghostUneven', piece: this.piece });
                }
            }
        }

        const rocks = engine.garbageQueue + Math.floor(engine.nuisanceTray / 70);
        if (rocks > this.maxMeter) { this.maxMeter = rocks; this.trace.push({ f, t: 'meter', rocks }); }

        const keys: KeyDispatch[] = [];
        this.scenario.script.forEach((step, idx) => {
            if (this.done.has(idx) || !this.isDue(step, f)) return;
            this.done.add(idx);
            if ('i' in step) this.applyInput(engine, step.i, step.a);
            else if ('tap' in step) {
                keys.push({ action: step.tap, down: true }, { action: step.tap, down: false });
                this.trace.push({ f, t: 'tap', action: step.tap });
            } else {
                keys.push({ action: step.key, down: step.down });
                this.trace.push({ f, t: 'key', action: step.key, down: step.down });
            }
        });

        const q = engine.activePiece;
        this.afterSnapshot = q ? { x: q.x, y: q.y, rot: q.rot } : null;
        return keys;
    }

    /** Record a client-side moment (browser only). */
    note(what: Extract<TraceEvent, { t: 'client' }>['what']): void {
        this.trace.push({ f: this.frame, t: 'client', what });
    }

    private isDue(step: ScriptStep, f: number): boolean {
        if ('f' in step) return f === step.f;
        const a = this.anchors.get(step.piece);
        if (!a) return false;
        const at = step.on === 'spawn' ? a.spawn
            : step.on === 'grounded' ? a.grounded
            : step.on === 'lock' ? a.lock
            : 'y' in step ? a.y.get(step.y) : undefined;
        return at !== undefined && f === at + (step.plus ?? 0);
    }

    private applyInput(engine: GameEngine, i: InputType, a?: number): void {
        const before = engine.activePiece ? { ...engine.activePiece } : null;
        const grounded = isGrounded(engine);
        switch (i) {
            case 'L': engine.movePiece(-1); break;
            case 'R': engine.movePiece(1); break;
            case 'CW': engine.rotate(1); break;
            case 'CC': engine.rotate(-1); break;
            case 'SD': engine.softDrop = true; break;
            case 'SU': engine.softDrop = false; break;
            case 'HD': engine.hardDrop(); break;
            case 'HH': engine.horizontalMoveHeld = true; break;
            case 'HU': engine.horizontalMoveHeld = false; break;
            case 'G': engine.addGarbage(a ?? 0); break;
        }
        const after = engine.activePiece;
        let effect: InputEffect = 'applied';
        if (i === 'L' || i === 'R') {
            effect = before && after && after.x !== before.x ? 'moved' : before ? 'blocked' : 'ignored';
            if (effect === 'moved' && grounded) this.resets++;
        } else if (i === 'CW' || i === 'CC') {
            if (!before || !after) effect = 'ignored';
            else if (after.rot === before.rot) effect = 'rotateBlocked';
            else {
                const dx = after.x - before.x, dy = after.y - before.y;
                effect = dx && dy ? 'diagonalKick' : dx ? 'wallKick' : dy ? 'floorKick' : 'rotated';
                if (grounded) this.resets++;
            }
        }
        this.trace.push({ f: this.frame, t: 'input', i, a, effect });
    }
}

// ── Witnesses ────────────────────────────────────────────────────────────────

const has = <T extends TraceEvent['t']>(trace: TraceEvent[], t: T, pred: (e: Extract<TraceEvent, { t: T }>) => boolean = () => true) =>
    trace.some(e => e.t === t && pred(e as Extract<TraceEvent, { t: T }>));

/**
 * The evidence rule for every animation in the inventory. An animation is
 * witnessed by a scenario when its rule holds on that scenario's trace.
 */
export const WITNESS: Record<string, (trace: TraceEvent[], engine: GameEngine) => boolean> = {
    'piece.spawn': t => has(t, 'spawn'),
    'queue.advance': t => t.filter(e => e.t === 'spawn').length >= 2,
    'piece.gravity-step': t => has(t, 'fall', e => !e.softDrop && e.rows === 1),
    'piece.soft-drop': t => has(t, 'fall', e => e.softDrop && e.rows === 1),
    'piece.sonic-drop': t => has(t, 'fall', e => e.rows >= 2),
    'piece.hard-drop': t => has(t, 'hardDrop'),
    'piece.move': t => has(t, 'input', e => e.effect === 'moved'),
    'piece.move-blocked': t => has(t, 'input', e => e.effect === 'blocked'),
    'piece.rotate': t => has(t, 'input', e => e.effect === 'rotated'),
    'piece.wall-kick': t => has(t, 'input', e => e.effect === 'wallKick'),
    'piece.floor-kick': t => has(t, 'input', e => e.effect === 'floorKick'),
    'piece.diagonal-kick': t => has(t, 'input', e => e.effect === 'diagonalKick'),
    'piece.rotate-blocked': t => has(t, 'input', e => e.effect === 'rotateBlocked'),
    'piece.same-colour': t => has(t, 'spawn', e => e.pair[0] === e.pair[1]),
    'piece.ghost': t => has(t, 'ghostUneven'),
    'piece.lock-delay': t => has(t, 'lock', e => !e.hardDrop && !e.softDrop && e.resets === 0 && e.groundedFrames >= 15),
    'piece.lock-reset': t => has(t, 'lock', e => e.resets >= 3 && e.groundedFrames > 30),
    'piece.glide': t => has(t, 'lock', e => e.glideFrames > 30),
    'piece.soft-drop-protection': t => has(t, 'spawn', e => e.softDropHeld && e.piece > 1),
    'piece.soft-drop-lock': t => has(t, 'lock', e => e.softDrop && !e.hardDrop),
    'piece.lock-jiggle': t => has(t, 'lock'),
    'piece.split': t => has(t, 'split'),

    'clear.pop': t => has(t, 'chainStep'),
    'clear.group-bonus': t => has(t, 'chainStep', e => e.groups.some(n => n >= 5)),
    'clear.multi-group': t => has(t, 'chainStep', e => e.groups.length >= 2),
    'clear.multi-colour': t => has(t, 'chainStep', e => e.colours >= 2),
    'clear.cascade-fall': t => has(t, 'gravityLanded', e => e.afterPop),
    'clear.cascade-jiggle': t => has(t, 'gravityLanded'),
    'clear.chain-text': t => has(t, 'chainStep', e => e.chain >= 2),
    'clear.long-chain': t => has(t, 'chainStep', e => e.chain >= 6),
    'clear.garbage-clear': t => has(t, 'chainStep', e => e.garbageCleared > 0),
    'clear.all-clear': t => has(t, 'allClear'),
    'clear.hidden-row-pop': t => has(t, 'chainStep', e => e.hiddenRow),

    'garbage.receive': t => has(t, 'input', e => e.i === 'G'),
    'garbage.tray-rock': t => has(t, 'meter', e => e.rocks >= 30),
    'garbage.fall-partial': t => has(t, 'garbageDrop', e => e.amount < 6),
    'garbage.fall-rows': t => has(t, 'garbageDrop', e => e.amount >= 6 && e.amount % 6 === 0),
    'garbage.fall-capped': t => has(t, 'garbageDrop', e => e.amount === 24 && e.remaining > 0),
    'garbage.on-stack': t => has(t, 'garbageDrop', e => e.unevenStack),
    'garbage.offset': t => has(t, 'offset'),
    'garbage.send': t => has(t, 'garbageSent'),
    'garbage.large-attack': t => has(t, 'sound', e => e.sound === 'garbageLarge'),

    'end.topout-spawn': t => has(t, 'state', e => e.from === 'SPAWN' && e.to === 'GAMEOVER'),
    'end.topout-lock': t => has(t, 'state', e => e.from === 'ACTIVE' && e.to === 'GAMEOVER'),
    'end.hidden-row-stack': (t, engine) => has(t, 'lock', e => e.cells.some(c => c.r >= 0 && c.r < HIDDEN_ROWS)) && engine.state !== GameState.GAMEOVER,
    'end.time-up': t => has(t, 'client', e => e.what === 'timeUp'),

    'hud.score': (_t, engine) => engine.stats.score > 0,
    'hud.x-marker': t => has(t, 'client', e => e.what === 'xMarker'),
    'hud.timer': t => has(t, 'client', e => e.what === 'timer'),
    'hud.pause': t => has(t, 'client', e => e.what === 'pauseOpen') && has(t, 'client', e => e.what === 'pauseClose'),

    'input.das-arr': t => t.filter(e => e.t === 'clientMove' && Math.abs(e.dx) === 1).length >= 3,
    'input.arr-zero': t => has(t, 'clientMove', e => Math.abs(e.dx) >= 2),
    'input.spawn-das': t => has(t, 'clientMove', e => e.onSpawnFrame),
    'input.tap': t => has(t, 'tap'),
};

/** Every animation id witnessed by a trace. */
export function witnessed(trace: TraceEvent[], engine: GameEngine): string[] {
    return Object.entries(WITNESS).filter(([, rule]) => rule(trace, engine)).map(([id]) => id);
}

/** Every state-machine transition seen in a trace, as "FROM>TO". */
export function transitions(trace: TraceEvent[]): string[] {
    return [...new Set(trace.filter(e => e.t === 'state').map(e => {
        const s = e as Extract<TraceEvent, { t: 'state' }>;
        return `${s.from}>${s.to}`;
    }))];
}
