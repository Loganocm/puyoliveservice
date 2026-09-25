/**
 * BoardView: draws one Puyo board, with every animation, from a frame of
 * game state.
 *
 * The live game, the opponent's board, Puyo Mines and the replay viewer each
 * used to carry their own copy of the board renderer (about 400 lines apiece)
 * and the copies had drifted: the replay viewer animated pops and cascades at
 * half the engine's speed because it had hard-coded old timings. They now all
 * draw through this one class, so a board looks and moves the same everywhere.
 *
 * It needs nothing but a BoardFrame, which a live GameEngine (engineFrame), an
 * opponent simulation and a replay snapshot all provide. Every animation is
 * derived from how consecutive frames differ -- a cell that was empty and is
 * now filled has landed; a state that has just become POP_ANIM is a pop -- so
 * the renderer never needs engine callbacks and cannot miss or double-count
 * one. Nothing here touches game state: the view decorates the simulation and
 * never delays it.
 *
 * Sprites are pooled (see SpritePool); drawing a frame allocates nothing in
 * the steady state.
 *
 * The look is specified in website/src/content/docs/design/visual-identity.md
 * and the motion in design/game-feel.md.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import {
    COLS, ROWS, HIDDEN_ROWS, TOTAL_ROWS, PuyoColor, GameState,
    POP_ANIM_FRAMES, FALL_STEP_FRAMES, chainScaledDuration,
} from '@puyolive/engine';
import { CELL_SIZE } from '../core/RenderConstants';
import { ResourceManager } from '../core/ResourceManager';
import { SettingsManager } from '../core/SettingsManager';
import type { GarbageIcon } from '../core/PieceArt';
import { FONTS, alphaOf, chainColor, getTheme, prefersReducedMotion, toPixi } from '../theme/tokens';
import type { Theme } from '../theme/tokens';
import { SpritePool } from './SpritePool';

type Cell = { readonly c: number; readonly r: number };

/** What the renderer needs to know about a board at one instant. */
export interface BoardFrame {
    /** Column-major: grid[column][row], row 0 at the top of the hidden rows. */
    readonly grid: ArrayLike<ArrayLike<number>>;
    readonly activePiece: { x: number; y: number; rot: number; mainColor: number; subColor: number } | null;
    readonly state: number;
    readonly stateTimer: number;
    readonly chainCount: number;
    readonly fallingDestinations: readonly { c: number; r: number; destR: number }[];
    readonly fallingGarbage: readonly { c: number; r: number; destR: number; delay: number }[];
    readonly matchedPuyos: readonly (readonly Cell[])[];
    /** Committed garbage, in puyos. */
    readonly garbageQueue: number;
    /** Uncommitted garbage, in score points (70 per puyo). */
    readonly nuisanceTray: number;
}

/** The parts of a GameEngine a frame is read from. */
interface EngineLike {
    readonly board: { readonly grid: number[][] };
    readonly activePiece: BoardFrame['activePiece'];
    readonly state: number;
    readonly stateTimer: number;
    readonly stats: { readonly chainCount: number };
    readonly fallingDestinations: BoardFrame['fallingDestinations'];
    readonly fallingGarbage: BoardFrame['fallingGarbage'];
    readonly matchedPuyos: BoardFrame['matchedPuyos'];
    readonly garbageQueue: number;
    readonly nuisanceTray: number;
}

/** A live, zero-copy frame over an engine. Create once and render it every frame. */
export function engineFrame(engine: EngineLike): BoardFrame {
    return {
        get grid() { return engine.board.grid; },
        get activePiece() { return engine.activePiece; },
        get state() { return engine.state; },
        get stateTimer() { return engine.stateTimer; },
        get chainCount() { return engine.stats.chainCount; },
        get fallingDestinations() { return engine.fallingDestinations; },
        get fallingGarbage() { return engine.fallingGarbage; },
        get matchedPuyos() { return engine.matchedPuyos; },
        get garbageQueue() { return engine.garbageQueue; },
        get nuisanceTray() { return engine.nuisanceTray; },
    };
}

/** A frame for a board known only by its grid, such as a relayed snapshot: no piece, nothing moving. */
export function gridFrame(grid: () => ArrayLike<ArrayLike<number>>): BoardFrame {
    return {
        get grid() { return grid(); },
        activePiece: null,
        state: GameState.SPAWN,
        stateTimer: 0,
        chainCount: 0,
        fallingDestinations: [],
        fallingGarbage: [],
        matchedPuyos: [],
        garbageQueue: 0,
        nuisanceTray: 0,
    };
}

/**
 * Garbage waiting to fall on a board, in puyos.
 *
 * The engine holds committed garbage in puyos but the tray in score points,
 * 70 to the puyo. The old HUD added the two as if they were one unit, which
 * made the opponent's tray show roughly 70 times the real amount.
 */
export function pendingGarbage(f: { garbageQueue: number; nuisanceTray: number }): number {
    return f.garbageQueue + Math.floor(f.nuisanceTray / 70);
}

/** Tray icons for `puyos` of garbage, largest first, as in Puyo Puyo Tsu. */
export function trayIcons(puyos: number, max = 6): GarbageIcon[] {
    const values: [number, GarbageIcon][] = [[720, 'crown'], [360, 'moon'], [180, 'star'], [30, 'rock'], [6, 'big'], [1, 'small']];
    const icons: GarbageIcon[] = [];
    let left = puyos;
    for (const [value, icon] of values) {
        while (left >= value && icons.length < max) {
            icons.push(icon);
            left -= value;
        }
    }
    return icons;
}

export interface BoardViewOptions {
    /** Show where the piece will land. Default true. */
    ghost?: boolean;
    /** 'lite' drops particles, callouts and shake: for small boards. Default 'full'. */
    effects?: 'full' | 'lite';
    /** Show incoming garbage above the board. Default true. */
    tray?: boolean;
}

interface Landing { t: number; gcx: number; gcy: number }
interface Particle { s: Sprite | null; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: number; g: number }
interface Ring { x: number; y: number; t: number; dur: number; from: number; to: number; color: number }
interface Callout { text: Text; t: number; dur: number; x: number; y: number; chain: boolean }
interface PopGroup { cells: Cell[]; color: number; cx: number; cy: number }

/** Offset of the second puyo from the first, by rotation (0 up, 1 right, 2 down, 3 left). */
const SUB_OFFSET = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
/** Neighbour-mask bit toward the second puyo, and back, by rotation. */
const MAIN_TO_SUB = [1, 2, 4, 8];
const SUB_TO_MAIN = [4, 8, 1, 2];

const CELL = CELL_SIZE;
const HALF = CELL / 2;
const RADIUS = 14;
/** The death cell: where a piece spawns, and where a stack ends the game. */
const DEATH_COL = 2;

const LAND_FRAMES = 12;
const SPAWN_FRAMES = 8;
const SWING_FRAMES = 4;
const MAX_PARTICLES = 360;

const key = (c: number, r: number) => c * TOTAL_ROWS + r;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export class BoardView {
    /** Board width and height in pixels, before any scaling. */
    static readonly WIDTH = COLS * CELL;
    static readonly HEIGHT = ROWS * CELL;

    /** Position this; its origin is the top-left corner of the visible board. */
    readonly container = new Container();
    /** True for the render call in which a new piece appeared. */
    spawnedThisFrame = false;

    private readonly body = new Container();
    private readonly panel = new Graphics();
    private readonly rim = new Graphics();
    private readonly marker = new Sprite();
    private readonly ghosts: SpritePool;
    private readonly cells: SpritePool;
    private readonly glows: SpritePool;
    private readonly fx: SpritePool;
    private readonly tray: SpritePool;
    private readonly textLayer = new Container();

    private readonly options: Required<BoardViewOptions>;
    private theme: Theme = getTheme();
    private reduced = prefersReducedMotion();

    private readonly prevGrid = new Int8Array(COLS * TOTAL_ROWS);
    private primed = false;
    private prevState = -1;
    private hadPiece = false;
    private prevMain = -1;
    private prevSub = -1;
    private prevY = 0;
    private prevRot = 0;
    private swingFrom = 0;
    private swingTo = 0;
    private swingT = 1;
    private spawnT = -1;
    private time = 0;
    private glow = 0;
    private glowColor = 0xffffff;
    private shakeAmount = 0;

    private readonly landing = new Map<number, Landing>();
    private popping: PopGroup[] = [];
    private readonly particles: Particle[] = [];
    private readonly rings: Ring[] = [];
    private readonly callouts: Callout[] = [];
    private readonly fallMap = new Map<number, number>();
    private readonly popSet = new Set<number>();

    constructor(options: BoardViewOptions = {}) {
        this.options = { ghost: true, effects: 'full', tray: true, ...options };

        const markerLayer = new Container();
        const ghostLayer = new Container();
        const cellLayer = new Container();
        const glowLayer = new Container();
        const fxLayer = new Container();
        const trayLayer = new Container();
        this.ghosts = new SpritePool(ghostLayer);
        this.cells = new SpritePool(cellLayer);
        this.glows = new SpritePool(glowLayer);
        this.fx = new SpritePool(fxLayer);
        this.tray = new SpritePool(trayLayer);

        this.marker.anchor.set(0.5);
        markerLayer.addChild(this.marker);

        this.body.addChild(this.panel, markerLayer, ghostLayer, cellLayer, glowLayer, fxLayer, this.rim, trayLayer, this.textLayer);
        this.container.addChild(this.body);
        this.drawPanel();
    }

    /** Re-read the theme and motion preference, after the player changes them. */
    retheme(): void {
        this.theme = getTheme();
        this.reduced = prefersReducedMotion();
        this.drawPanel();
    }

    /** Forget the previous frame, so the next one starts no animations (after a seek). */
    reset(): void {
        this.primed = false;
        this.prevState = -1;
        this.hadPiece = false;
        this.spawnT = -1;
        this.swingT = 1;
        this.landing.clear();
        this.popping = [];
        this.particles.length = 0;
        this.rings.length = 0;
        for (const c of this.callouts) c.text.destroy();
        this.callouts.length = 0;
        this.glow = 0;
        this.shakeAmount = 0;
    }

    /** Shake the board, scaled by the player's setting; nothing under reduced motion. */
    shake(strength: number): void {
        if (this.reduced || this.options.effects === 'lite') return;
        this.shakeAmount = Math.max(this.shakeAmount, strength);
    }

    /**
     * Float a message over the board: "ALL CLEAR", "ATTACK +12", and so on.
     * Coordinates are board pixels; the default is the board's centre.
     */
    callout(message: string, opts: { color?: string; x?: number; y?: number; size?: number; frames?: number; chain?: boolean } = {}): void {
        if (this.options.effects === 'lite') return;
        if (opts.chain) {
            // A new link replaces the previous link's callout rather than
            // stacking on top of it: hurry the old one into its fade.
            for (const c of this.callouts) if (c.chain) c.t = Math.max(c.t, c.dur * 0.82);
        }
        const size = opts.size ?? 34;
        const text = new Text({
            text: message,
            resolution: Math.min(3, (globalThis.devicePixelRatio || 1) * 1.5),
            style: {
                fontFamily: FONTS.display,
                fontWeight: '700',
                fontSize: size,
                fill: opts.color ?? this.theme.text.primary,
                stroke: { color: this.theme.bg.base, width: Math.max(4, size * 0.16), join: 'round' },
                dropShadow: { color: '#000000', alpha: 0.45, blur: 6, distance: 3, angle: Math.PI / 2 },
                letterSpacing: 1,
            },
        });
        text.anchor.set(0.5);
        // Keep the whole message over the board, however wide it is.
        const half = Math.min(BoardView.WIDTH / 2, text.width / 2 + 6);
        const x = Math.max(half, Math.min(BoardView.WIDTH - half, opts.x ?? BoardView.WIDTH / 2));
        const y = Math.max(size, Math.min(BoardView.HEIGHT - size, opts.y ?? BoardView.HEIGHT / 2));
        text.position.set(x, y);
        this.textLayer.addChild(text);
        this.callouts.push({ text, t: 0, dur: opts.frames ?? 50, x, y, chain: !!opts.chain });
    }

    /** Draw `frame`, advancing animations by `dt` logical frames (0 while paused). */
    render(frame: BoardFrame, dt: number): void {
        this.time += dt;
        this.spawnedThisFrame = false;
        this.detect(frame);
        this.tick(dt);
        const danger = this.danger(frame.grid);
        this.drawRim(danger);
        this.drawMarker(frame.grid, danger);
        this.cells.begin();
        this.glows.begin();
        this.ghosts.begin();
        this.drawCells(frame);
        this.drawPiece(frame);
        this.cells.end();
        this.glows.end();
        this.ghosts.end();
        this.drawTray(frame);
        this.drawFx();
        this.applyShake();
        this.remember(frame.grid);
    }

    destroy(): void {
        for (const c of this.callouts) c.text.destroy();
        this.container.destroy({ children: true });
    }

    // ── Events, derived from the difference between frames ──────────────

    private detect(frame: BoardFrame): void {
        const g = frame.grid;
        if (frame.state !== this.prevState) {
            if (this.prevState === GameState.POP_ANIM) this.burst();
            if (frame.state === GameState.POP_ANIM && this.primed) this.beginPop(frame);
            this.prevState = frame.state;
        }
        if (!this.primed) return;

        // A cell that was empty and is now filled has landed: a lock, the end
        // of a cascade step, or garbage.
        let seen: Set<number> | null = null;
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                const color = g[c][r];
                if (color === PuyoColor.None || this.prevGrid[key(c, r)] !== PuyoColor.None) continue;
                seen ??= new Set();
                if (seen.has(key(c, r))) continue;
                this.land(g, c, r, color, seen);
            }
        }
    }

    /** Squash the whole connected group a landed cell joined, about its centre. */
    private land(g: BoardFrame['grid'], c0: number, r0: number, color: number, seen: Set<number>): void {
        const group: Cell[] = [];
        const stack: Cell[] = [{ c: c0, r: r0 }];
        seen.add(key(c0, r0));
        while (stack.length) {
            const cell = stack.pop()!;
            group.push(cell);
            if (color === PuyoColor.Garbage) break;
            for (const [dc, dr] of SUB_OFFSET) {
                const c = cell.c + dc, r = cell.r + dr;
                if (c < 0 || c >= COLS || r < 0 || r >= TOTAL_ROWS) continue;
                if (g[c][r] !== color || seen.has(key(c, r))) continue;
                seen.add(key(c, r));
                stack.push({ c, r });
            }
        }
        let gcx = 0, gcy = 0;
        for (const cell of group) { gcx += cell.c * CELL + HALF; gcy += (cell.r - HIDDEN_ROWS) * CELL + HALF; }
        gcx /= group.length; gcy /= group.length;
        for (const cell of group) this.landing.set(key(cell.c, cell.r), { t: 0, gcx, gcy });

        if (color === PuyoColor.Garbage && this.options.effects === 'full' && !this.reduced) {
            const x = c0 * CELL + HALF, y = (r0 - HIDDEN_ROWS + 1) * CELL - 4;
            for (let i = 0; i < 2; i++) this.emit(x, y, (Math.random() - 0.5) * 3, -Math.random() * 1.5, 0.12, 22, toPixi(this.theme.pieces[PuyoColor.Garbage].light), 0.05);
        }
    }

    private beginPop(frame: BoardFrame): void {
        const g = frame.grid;
        this.popping = frame.matchedPuyos.filter(group => group.length > 0).map(group => {
            let cx = 0, cy = 0;
            for (const p of group) { cx += p.c * CELL + HALF; cy += (p.r - HIDDEN_ROWS) * CELL + HALF; }
            return { cells: [...group], color: g[group[0].c][group[0].r], cx: cx / group.length, cy: cy / group.length };
        });
        if (this.popping.length === 0) return;
        const links = frame.chainCount;
        const color = chainColor(this.theme, Math.max(2, links));
        this.glow = 1;
        this.glowColor = toPixi(color);
        if (links >= 2) {
            const first = this.popping[0];
            this.callout(`${links} CHAIN`, { color, x: first.cx, y: first.cy - HALF, size: 30 + Math.min(links, 12) * 2.5, frames: 44 + links * 3, chain: true });
        }
        if (links >= 4) this.shake(2 + links * 0.6);
    }

    /** The popped groups burst into droplets and a ring as they vanish. */
    private burst(): void {
        for (const group of this.popping) {
            const style = this.theme.pieces[group.color];
            if (!style) continue;
            const tint = toPixi(style.base);
            this.rings.push({ x: group.cx, y: group.cy, t: 0, dur: 20, from: 0.6, to: 1.3 + group.cells.length * 0.12, color: tint });
            if (this.options.effects === 'lite' || this.reduced) continue;
            for (const cell of group.cells) {
                const x = cell.c * CELL + HALF, y = (cell.r - HIDDEN_ROWS) * CELL + HALF;
                for (let i = 0; i < 5; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const v = 1.8 + Math.random() * 3.6;
                    this.emit(x, y, Math.cos(a) * v, Math.sin(a) * v - 2.2, 0.16 + Math.random() * 0.16, 28 + Math.random() * 18, tint, 0.24);
                }
            }
        }
        this.popping = [];
    }

    private emit(x: number, y: number, vx: number, vy: number, size: number, life: number, color: number, gravity: number): void {
        if (this.particles.length >= MAX_PARTICLES) return;
        this.particles.push({ s: null, x, y, vx, vy, life, max: life, size, color, g: gravity });
    }

    private tick(dt: number): void {
        if (dt <= 0) return;
        for (const [k, a] of this.landing) {
            a.t += dt / LAND_FRAMES;
            if (a.t >= 1) this.landing.delete(k);
        }
        if (this.spawnT >= 0) {
            this.spawnT += dt / SPAWN_FRAMES;
            if (this.spawnT >= 1) this.spawnT = -1;
        }
        if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / SWING_FRAMES);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
            p.vx *= 0.985 ** dt;
            p.life -= dt;
            if (p.life <= 0) { this.particles[i] = this.particles[this.particles.length - 1]; this.particles.pop(); }
        }
        for (let i = this.rings.length - 1; i >= 0; i--) {
            this.rings[i].t += dt / this.rings[i].dur;
            if (this.rings[i].t >= 1) this.rings.splice(i, 1);
        }
        for (let i = this.callouts.length - 1; i >= 0; i--) {
            const c = this.callouts[i];
            c.t += dt;
            const p = c.t / c.dur;
            const scale = this.reduced ? 1 : p < 0.2 ? 0.6 + 0.4 * easeOutBack(p / 0.2) : 1;
            c.text.scale.set(scale);
            c.text.y = c.y - (this.reduced ? 0 : 26 * easeOutCubic(p));
            c.text.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
            if (c.t >= c.dur) { c.text.destroy(); this.callouts.splice(i, 1); }
        }
        this.glow = Math.max(0, this.glow - dt / 45);
        this.shakeAmount = Math.max(0, this.shakeAmount - dt * 0.6);
    }

    private remember(g: BoardFrame['grid']): void {
        for (let c = 0; c < COLS; c++) for (let r = 0; r < TOTAL_ROWS; r++) this.prevGrid[key(c, r)] = g[c][r];
        this.primed = true;
    }

    // ── Drawing ───────────────────────────────────────────────────────────

    /** The static board: a frosted panel, a faint cell grid, and the sky above it. */
    private drawPanel(): void {
        const t = this.theme;
        const p = this.panel;
        const w = BoardView.WIDTH, h = BoardView.HEIGHT;
        p.clear();
        // The two hidden rows fade in above the top edge: pieces arrive from
        // there, so it should read as open space rather than as nothing.
        const steps = 8;
        for (let i = 0; i < steps; i++) {
            const y = -2 * CELL + (i * 2 * CELL) / steps;
            p.rect(0, y, w, (2 * CELL) / steps).fill({ color: toPixi(t.bg.board), alpha: alphaOf(t.bg.board) * 0.28 * ((i + 1) / steps) ** 2 });
        }
        p.roundRect(0, 0, w, h, RADIUS).fill({ color: toPixi(t.bg.board), alpha: alphaOf(t.bg.board) });
        const grid = { color: toPixi(t.line.grid), alpha: alphaOf(t.line.grid), width: 1 };
        for (let c = 1; c < COLS; c++) p.moveTo(c * CELL, 6).lineTo(c * CELL, h - 6);
        for (let r = 1; r < ROWS; r++) p.moveTo(6, r * CELL).lineTo(w - 6, r * CELL);
        p.stroke(grid);
        // A soft top highlight sells the glass.
        p.roundRect(1.5, 1.5, w - 3, h - 3, RADIUS - 1).stroke({ color: 0xffffff, alpha: 0.05, width: 1.5 });
    }

    /** How close the spawn column is to topping out, 0 (safe) to 1 (one row left). */
    private danger(g: BoardFrame['grid']): number {
        let top = TOTAL_ROWS;
        for (let r = 0; r < TOTAL_ROWS; r++) if (g[DEATH_COL][r] !== PuyoColor.None) { top = r; break; }
        const free = top - HIDDEN_ROWS;
        return clamp01((4 - free) / 3);
    }

    private drawRim(danger: number): void {
        const t = this.theme;
        const r = this.rim;
        const w = BoardView.WIDTH, h = BoardView.HEIGHT;
        r.clear();
        r.roundRect(-1, -1, w + 2, h + 2, RADIUS + 1).stroke({ color: toPixi(t.bg.boardEdge), alpha: alphaOf(t.bg.boardEdge), width: 2 });
        if (this.glow > 0) {
            const a = this.glow;
            r.roundRect(-2, -2, w + 4, h + 4, RADIUS + 2).stroke({ color: this.glowColor, alpha: a * 0.9, width: 3 });
            r.roundRect(-6, -6, w + 12, h + 12, RADIUS + 6).stroke({ color: this.glowColor, alpha: a * 0.28, width: 8 });
            r.roundRect(-12, -12, w + 24, h + 24, RADIUS + 12).stroke({ color: this.glowColor, alpha: a * 0.1, width: 10 });
        }
        if (danger > 0) {
            const pulse = this.reduced ? 1 : 0.5 + 0.5 * Math.sin(this.time * (0.1 + 0.16 * danger));
            const color = toPixi(t.state.danger);
            r.roundRect(-2, -2, w + 4, h + 4, RADIUS + 2).stroke({ color, alpha: danger * (0.35 + 0.65 * pulse), width: 3 });
            r.roundRect(-7, -7, w + 14, h + 14, RADIUS + 7).stroke({ color, alpha: danger * 0.22 * pulse, width: 9 });
        }
    }

    /** The death cell's ring: steady when safe, quicker as the stack climbs. */
    private drawMarker(g: BoardFrame['grid'], danger: number): void {
        const frames = ResourceManager.getXMarkerTextures();
        const visible = g[DEATH_COL][HIDDEN_ROWS] === PuyoColor.None;
        this.marker.visible = visible;
        if (!visible) return;
        const speed = this.reduced ? 0 : 0.12 + 0.45 * danger;
        this.marker.texture = frames[Math.floor(this.time * speed) % frames.length];
        this.marker.position.set(DEATH_COL * CELL + HALF, HALF);
        this.marker.width = this.marker.height = CELL * 0.86;
        this.marker.alpha = 0.55 + 0.4 * danger;
    }

    private drawCells(frame: BoardFrame): void {
        const g = frame.grid;
        const falling = this.fallMap;
        falling.clear();
        let fallP = 0;
        if (frame.state === GameState.FALLING && frame.fallingDestinations.length > 0) {
            // The engine applies gravity once its timer passes the scaled delay.
            const frames = chainScaledDuration(FALL_STEP_FRAMES, frame.chainCount) + 1;
            fallP = clamp01(frame.stateTimer / frames) ** 2;
            for (const f of frame.fallingDestinations) falling.set(key(f.c, f.r), f.destR);
        }

        const popping = this.popSet;
        popping.clear();
        let popT = 0;
        if (frame.state === GameState.POP_ANIM) {
            popT = clamp01(frame.stateTimer / chainScaledDuration(POP_ANIM_FRAMES, frame.chainCount));
            for (const group of frame.matchedPuyos) for (const p of group) popping.add(key(p.c, p.r));
        }

        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                const color = g[c][r];
                if (color === PuyoColor.None) continue;
                const k = key(c, r);
                const mask = color === PuyoColor.Garbage ? 0 : neighbours(g, c, r, color);

                if (popping.has(k)) {
                    this.drawPopping(c, r, color, mask, popT);
                    continue;
                }
                const dest = falling.get(k);
                if (dest !== undefined) {
                    // Only stay joined to neighbours falling the same distance.
                    let m = 0;
                    if (color !== PuyoColor.Garbage) {
                        const d = dest - r;
                        for (let bit = 0; bit < 4; bit++) {
                            if (!(mask & (1 << bit))) continue;
                            const [dc, dr] = SUB_OFFSET[bit];
                            const other = falling.get(key(c + dc, r + dr));
                            if (other !== undefined && other - (r + dr) === d) m |= 1 << bit;
                        }
                    }
                    this.orb(c, r + (dest - r) * fallP, color, m, 1, 1, -1);
                    continue;
                }
                this.orb(c, r, color, mask, r < HIDDEN_ROWS ? 0.45 : 1, 1, k);
            }
        }

        for (const gb of frame.fallingGarbage) {
            if (gb.delay <= 10) this.orb(gb.c, gb.r, PuyoColor.Garbage, 0, 1, 1, -1);
        }
    }

    /** Glow, swell and burst over the engine's pop duration. */
    private drawPopping(c: number, r: number, color: number, mask: number, t: number): void {
        const hold = 0.75;
        const fade = t < hold ? 1 : 1 - (t - hold) / (1 - hold);
        const swell = this.reduced ? 1 : t < hold ? 1 + 0.08 * Math.sin((t / hold) * Math.PI) : 1 - 0.55 * (1 - fade);
        this.orb(c, r, color, t < hold ? mask : 0, 0.15 + 0.85 * fade, swell, -1);
        const style = this.theme.pieces[color];
        if (!style) return;
        const glow = this.glows.next(ResourceManager.getParticleTexture());
        glow.blendMode = 'add';
        glow.tint = toPixi(style.light);
        glow.position.set(c * CELL + HALF, (r - HIDDEN_ROWS) * CELL + HALF);
        glow.width = glow.height = CELL * (1.5 + 0.3 * (1 - fade));
        const flicker = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * Math.PI * 7) ** 2;
        glow.alpha = (0.25 + 0.5 * flicker) * fade;
    }

    /**
     * One orb at a (possibly fractional) row. `anim` is the cell key for the
     * landing squash, or -1 for none.
     */
    private orb(c: number, r: number, color: number, mask: number, alpha: number, scale: number, anim: number): Sprite {
        const s = this.cells.next(ResourceManager.getPuyoTexture(color as PuyoColor, mask));
        let x = c * CELL + HALF;
        let y = (r - HIDDEN_ROWS) * CELL + HALF;
        // Joined orbs overlap a hair so their bridges meet without a seam.
        const size = (CELL + (mask ? 1.5 : 0)) * scale;
        let sx = 1, sy = 1;
        const land = anim >= 0 ? this.landing.get(anim) : undefined;
        if (land && !this.reduced) {
            const amp = (1 - land.t) * 0.16;
            const wave = Math.sin(land.t * Math.PI * 3);
            sx = 1 + amp * wave;
            sy = 1 - amp * wave;
            x = land.gcx + (x - land.gcx) * sx;
            y = land.gcy + (y - land.gcy) * sy + size * (1 - sy) * 0.5;
        }
        s.position.set(x, y);
        s.width = size * sx;
        s.height = size * sy;
        s.alpha = alpha;
        return s;
    }

    private drawPiece(frame: BoardFrame): void {
        const p = frame.activePiece;
        if (!p) {
            this.hadPiece = false;
            return;
        }
        // A new piece: none before, or a different pair, or one that jumped
        // back up (a floor kick lifts a piece by one row at most). Checking
        // more than presence matters when several logical frames pass between
        // renders and the gap between two pieces falls inside one of them.
        const fresh = !this.hadPiece || p.mainColor !== this.prevMain || p.subColor !== this.prevSub || p.y < this.prevY - 1;
        this.prevMain = p.mainColor;
        this.prevSub = p.subColor;
        this.prevY = p.y;
        if (fresh) {
            this.spawnedThisFrame = true;
            this.spawnT = this.primed ? 0 : -1;
            this.prevRot = p.rot;
            this.swingT = 1;
        }
        this.hadPiece = true;
        if (p.rot !== this.prevRot) {
            // Swing the second puyo around the first, the short way.
            const from = this.swingT < 1 ? this.swingAngle() : this.prevRot * (Math.PI / 2);
            let to = p.rot * (Math.PI / 2);
            while (to - from > Math.PI) to -= Math.PI * 2;
            while (to - from < -Math.PI) to += Math.PI * 2;
            this.swingFrom = from;
            this.swingTo = to;
            this.swingT = this.reduced ? 1 : 0;
            this.prevRot = p.rot;
        }

        const [dx, dy] = SUB_OFFSET[p.rot];
        if (this.options.ghost && frame.state === GameState.ACTIVE) {
            for (const ghost of landingCells(frame.grid, p.x, p.y, p.x + dx, p.y + dy, p.mainColor, p.subColor)) {
                if (ghost.r === ghost.fromR) continue;
                const s = this.ghosts.next(ResourceManager.getGhostTexture(ghost.color as PuyoColor));
                s.position.set(ghost.c * CELL + HALF, (ghost.r - HIDDEN_ROWS) * CELL + HALF);
                s.width = s.height = CELL;
                s.alpha = 0.9;
            }
        }

        const spawning = this.spawnT >= 0;
        const scale = spawning && !this.reduced ? 0.7 + 0.3 * easeOutBack(this.spawnT) : 1;
        const alpha = spawning ? Math.min(1, 0.35 + this.spawnT * 1.6) : 1;
        const swinging = this.swingT < 1;
        const joined = p.mainColor === p.subColor && !swinging;
        this.orb(p.x, p.y, p.mainColor, joined ? MAIN_TO_SUB[p.rot] : 0, alpha, scale, -1);
        if (swinging) {
            const a = this.swingAngle();
            this.orb(p.x + Math.sin(a), p.y - Math.cos(a), p.subColor, 0, alpha, scale, -1);
        } else {
            this.orb(p.x + dx, p.y + dy, p.subColor, joined ? SUB_TO_MAIN[p.rot] : 0, alpha, scale, -1);
        }
    }

    private swingAngle(): number {
        return this.swingFrom + (this.swingTo - this.swingFrom) * easeOutCubic(this.swingT);
    }

    /** Incoming garbage, as icons in the strip above the board. */
    private drawTray(frame: BoardFrame): void {
        this.tray.begin();
        if (this.options.tray) {
            const icons = trayIcons(pendingGarbage(frame));
            const size = CELL * 0.72;
            icons.forEach((icon, i) => {
                const s = this.tray.next(ResourceManager.getGarbageIconTexture(icon));
                s.position.set(HALF + i * CELL, -size * 0.62);
                s.width = s.height = size;
                s.alpha = 0.95;
            });
        }
        this.tray.end();
    }

    private drawFx(): void {
        this.fx.begin();
        const dot = ResourceManager.getParticleTexture();
        for (const p of this.particles) {
            const s = this.fx.next(dot);
            s.blendMode = 'add';
            s.tint = p.color;
            s.position.set(p.x, p.y);
            const k = p.life / p.max;
            s.width = s.height = CELL * p.size * (0.5 + 0.5 * k);
            s.alpha = Math.min(1, k * 1.6);
        }
        const ring = ResourceManager.getRingTexture();
        for (const r of this.rings) {
            const s = this.fx.next(ring);
            s.blendMode = 'add';
            s.tint = r.color;
            s.position.set(r.x, r.y);
            s.width = s.height = CELL * (r.from + (r.to - r.from) * easeOutCubic(r.t)) * 2;
            s.alpha = (1 - r.t) * 0.85;
        }
        this.fx.end();
    }

    private applyShake(): void {
        if (this.shakeAmount <= 0) {
            this.body.position.set(0, 0);
            return;
        }
        const k = this.shakeAmount * (SettingsManager.screenShake / 100);
        this.body.position.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
}

function neighbours(g: BoardFrame['grid'], c: number, r: number, color: number): number {
    let m = 0;
    if (r > 0 && g[c][r - 1] === color) m |= 1;
    if (c < COLS - 1 && g[c + 1][r] === color) m |= 2;
    if (r < TOTAL_ROWS - 1 && g[c][r + 1] === color) m |= 4;
    if (c > 0 && g[c - 1][r] === color) m |= 8;
    return m;
}

/** The lowest empty row in column `c` (or -1 when the column is full). */
function columnFloor(g: BoardFrame['grid'], c: number): number {
    let r = TOTAL_ROWS - 1;
    while (r >= 0 && g[c][r] !== PuyoColor.None) r--;
    return r;
}

/**
 * Where each puyo of the pair will come to rest. A horizontal pair over
 * uneven columns splits and each half falls to its own column's floor, so the
 * preview shows the true result rather than the pair as a rigid block.
 */
export function landingCells(
    g: BoardFrame['grid'], mx: number, my: number, sx: number, sy: number, mainColor: number, subColor: number,
): { c: number; r: number; fromR: number; color: number }[] {
    if (mx < 0 || mx >= COLS || sx < 0 || sx >= COLS) return [];
    if (mx === sx) {
        const floor = columnFloor(g, mx);
        const mainBelow = my > sy;
        return [
            { c: mx, r: mainBelow ? floor : floor - 1, fromR: my, color: mainColor },
            { c: sx, r: mainBelow ? floor - 1 : floor, fromR: sy, color: subColor },
        ];
    }
    return [
        { c: mx, r: columnFloor(g, mx), fromR: my, color: mainColor },
        { c: sx, r: columnFloor(g, sx), fromR: sy, color: subColor },
    ];
}
