/**
 * The skin format, version 1: what a skin folder may contain and what it
 * means. Pure (no DOM), so every rule here is unit tested
 * (tests/skins/format.test.ts).
 *
 * A skin is a folder, or a .zip of one, holding `skin.json` and any of the
 * element files below. Like an osu! skin, every element is optional: whatever
 * a skin leaves out is drawn by its `style` painter in its colours. So a skin
 * can be anything from a recolour (skin.json alone) to hand-drawn art for
 * every piece.
 *
 * The specification for skin authors is
 * website/src/content/docs/reference/skins.md.
 */

import { PuyoColor } from '@puyolive/engine';
import type { Glyph, PieceStyle } from '../theme/tokens';
import { ICONS } from './atlas';
import type { GarbageIcon } from './atlas';
import { darkOf, isHexColor, lightOf } from './color';

export const SKIN_FORMAT = 1;

export const COLOR_NAMES = ['red', 'green', 'blue', 'yellow', 'purple', 'garbage'] as const;
export type ColorName = typeof COLOR_NAMES[number];
export type PieceColorName = Exclude<ColorName, 'garbage'>;

export const COLOR_OF: Record<ColorName, PuyoColor> = {
    red: PuyoColor.Red, green: PuyoColor.Green, blue: PuyoColor.Blue,
    yellow: PuyoColor.Yellow, purple: PuyoColor.Purple, garbage: PuyoColor.Garbage,
};

export const STYLES = ['circuit', 'gel'] as const;
export type SkinStyle = typeof STYLES[number];
export const SHAPES = ['round', 'tile'] as const;
export type SkinShape = typeof SHAPES[number];
export const GLYPHS: readonly Glyph[] = ['circle', 'triangle', 'square', 'diamond', 'plus'];

/** Piece colours when a skin names none: Puyo Live's own palette. */
export const DEFAULT_COLORS: Record<ColorName, { base: string; light: string; dark: string }> = {
    red: { base: '#FF5A6A', light: '#FFB3BB', dark: '#B3203A' },
    green: { base: '#3DDC97', light: '#B4F5D6', dark: '#128A5A' },
    blue: { base: '#4C8DFF', light: '#B5D0FF', dark: '#1D4FC4' },
    yellow: { base: '#FFD23F', light: '#FFF1B8', dark: '#C98A00' },
    purple: { base: '#B57BFF', light: '#E3CCFF', dark: '#6E35C9' },
    garbage: { base: '#8A93A6', light: '#D5DAE5', dark: '#4A5163' },
};

export const DEFAULT_SYMBOLS: Record<PieceColorName, Glyph> = {
    red: 'circle', green: 'triangle', blue: 'square', yellow: 'diamond', purple: 'plus',
};

/** The palette the renderer and effects use, keyed by PuyoColor. */
export function paletteOf(colors: Record<ColorName, { base: string; light: string; dark: string }>, symbols: Record<PieceColorName, Glyph>): Record<number, PieceStyle> {
    const out: Record<number, PieceStyle> = {};
    for (const name of COLOR_NAMES) {
        out[COLOR_OF[name]] = { ...colors[name], glyph: name === 'garbage' ? null : symbols[name] };
    }
    return out;
}

export const DEFAULT_PALETTE = paletteOf(DEFAULT_COLORS, DEFAULT_SYMBOLS);

/** Where the classic community sheet (puyo.png) keeps elements other than pieces. */
export interface ClassicLayout {
    /** [row, column] of the garbage puyo. */
    garbage: [number, number];
    /** [row, column] of the first tray icon; the other five follow to the right. */
    tray: [number, number];
    /** [row, column] of the first death-marker frame; the others follow to the right. */
    marker: [number, number];
    markerFrames: number;
}

export const DEFAULT_CLASSIC: ClassicLayout = { garbage: [9, 10], tray: [11, 1], marker: [12, 7], markerFrames: 5 };

export interface SkinManifest {
    format: number;
    name: string;
    author: string;
    version: string;
    description: string;
    /** The painter for everything the skin does not supply as a file. */
    style: SkinStyle;
    shape: SkinShape;
    colors: Record<ColorName, { base: string; light: string; dark: string }>;
    /** Colours the skin set itself; the rest are defaults, or sampled from its art. */
    explicitColors: ColorName[];
    symbols: Record<PieceColorName, Glyph>;
    /** The art already carries colour-blind symbols, so none are drawn over it. */
    symbolsInArt: boolean;
    classic: ClassicLayout;
}

export interface SkinProblem {
    level: 'error' | 'warning';
    message: string;
}

export const LIMITS = {
    manifestBytes: 64 * 1024,
    files: 64,
    fileBytes: 4 * 1024 * 1024,
    totalBytes: 16 * 1024 * 1024,
    imageSide: 4096,
    name: 60,
    author: 60,
    version: 20,
    description: 280,
} as const;

const KNOWN_KEYS = new Set(['format', 'name', 'author', 'version', 'description', 'style', 'shape', 'colors', 'symbols', 'symbolsInArt', 'classic']);

const text = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

const cell = (value: unknown): [number, number] | null =>
    Array.isArray(value) && value.length === 2 && value.every(v => Number.isInteger(v) && v >= 0 && v < 64)
        ? [value[0], value[1]] : null;

/**
 * Read a skin.json. Returns the manifest with every default filled in, or
 * null with at least one error. Warnings describe what was ignored.
 */
export function parseManifest(json: unknown): { manifest: SkinManifest | null; problems: SkinProblem[] } {
    const problems: SkinProblem[] = [];
    const warn = (message: string) => problems.push({ level: 'warning', message });
    const fail = (message: string) => { problems.push({ level: 'error', message }); return { manifest: null, problems }; };

    if (typeof json !== 'object' || json === null || Array.isArray(json)) return fail('skin.json must be a JSON object.');
    const raw = json as Record<string, unknown>;

    for (const key of Object.keys(raw)) if (!KNOWN_KEYS.has(key)) warn(`Unknown field "${key}" ignored.`);

    let format = SKIN_FORMAT;
    if (raw.format === undefined) warn(`No "format"; read as format ${SKIN_FORMAT}.`);
    else if (raw.format !== SKIN_FORMAT) return fail(`Format ${String(raw.format)} is not supported; this game reads format ${SKIN_FORMAT}.`);
    else format = raw.format;

    const name = text(raw.name, LIMITS.name);
    if (!name) return fail('A skin needs a "name".');

    let style: SkinStyle = 'circuit';
    if (raw.style !== undefined) {
        if ((STYLES as readonly unknown[]).includes(raw.style)) style = raw.style as SkinStyle;
        else warn(`Unknown style "${String(raw.style)}"; using "circuit".`);
    }
    let shape: SkinShape = 'round';
    if (raw.shape !== undefined) {
        if ((SHAPES as readonly unknown[]).includes(raw.shape)) shape = raw.shape as SkinShape;
        else warn(`Unknown shape "${String(raw.shape)}"; using "round".`);
    }

    const colors = structuredClone(DEFAULT_COLORS);
    const explicitColors: ColorName[] = [];
    if (raw.colors !== undefined) {
        if (typeof raw.colors !== 'object' || raw.colors === null || Array.isArray(raw.colors)) {
            warn('"colors" must be an object; ignored.');
        } else {
            for (const [key, value] of Object.entries(raw.colors as Record<string, unknown>)) {
                if (!(COLOR_NAMES as readonly string[]).includes(key)) { warn(`Unknown colour "${key}" ignored.`); continue; }
                const name = key as ColorName;
                const spec = typeof value === 'string' ? { base: value } : value as Record<string, unknown>;
                if (typeof spec !== 'object' || spec === null || !isHexColor(spec.base)) {
                    warn(`Colour "${name}" needs a base like "#FF5A6A"; using the default.`);
                    continue;
                }
                const base = spec.base as string;
                const light = isHexColor(spec.light) ? spec.light : lightOf(base);
                const dark = isHexColor(spec.dark) ? spec.dark : darkOf(base);
                if (spec.light !== undefined && !isHexColor(spec.light)) warn(`Colour "${name}": light is not a colour; derived from base.`);
                if (spec.dark !== undefined && !isHexColor(spec.dark)) warn(`Colour "${name}": dark is not a colour; derived from base.`);
                colors[name] = { base: base.toUpperCase(), light: light.toUpperCase(), dark: dark.toUpperCase() };
                explicitColors.push(name);
            }
        }
    }

    const symbols = { ...DEFAULT_SYMBOLS };
    if (raw.symbols !== undefined) {
        if (typeof raw.symbols !== 'object' || raw.symbols === null || Array.isArray(raw.symbols)) {
            warn('"symbols" must be an object; ignored.');
        } else {
            for (const [key, value] of Object.entries(raw.symbols as Record<string, unknown>)) {
                if (!(key in DEFAULT_SYMBOLS)) { warn(`Symbols: unknown colour "${key}" ignored.`); continue; }
                if (!(GLYPHS as readonly unknown[]).includes(value)) { warn(`Symbols: "${String(value)}" is not one of ${GLYPHS.join(', ')}.`); continue; }
                symbols[key as PieceColorName] = value as Glyph;
            }
        }
    }

    const classic: ClassicLayout = { ...DEFAULT_CLASSIC };
    if (raw.classic !== undefined && typeof raw.classic === 'object' && raw.classic !== null) {
        const c = raw.classic as Record<string, unknown>;
        for (const k of ['garbage', 'tray', 'marker'] as const) {
            if (c[k] === undefined) continue;
            const v = cell(c[k]);
            if (v) classic[k] = v; else warn(`classic.${k} must be [row, column].`);
        }
        if (c.markerFrames !== undefined) {
            if (Number.isInteger(c.markerFrames) && (c.markerFrames as number) >= 1 && (c.markerFrames as number) <= 16) classic.markerFrames = c.markerFrames as number;
            else warn('classic.markerFrames must be 1 to 16.');
        }
    }

    return {
        manifest: {
            format,
            name,
            author: text(raw.author, LIMITS.author),
            version: text(raw.version, LIMITS.version),
            description: text(raw.description, LIMITS.description),
            style, shape, colors, explicitColors, symbols,
            symbolsInArt: raw.symbolsInArt === true,
            classic,
        },
        problems,
    };
}

// ── Element files ───────────────────────────────────────────────────────────

export const IMAGE_EXTENSIONS = ['png', 'webp', 'jpg', 'jpeg', 'svg'] as const;

export type ElementKey =
    | { kind: 'sheet' }                          // pieces.png: every piece, Puyo Live layout
    | { kind: 'classic' }                        // puyo.png: the community sheet layout
    | { kind: 'piece'; color: ColorName }        // puyo-red.png: one colour, a 16-frame strip or one frame
    | { kind: 'ghost'; color: PieceColorName | null } // ghost-red.png, or ghost.png tinted per colour
    | { kind: 'tray'; icon: GarbageIcon }        // tray-star.png
    | { kind: 'junction'; color: PieceColorName } // junction-red.png: fills the centre of a 2x2 block
    | { kind: 'marker' }                         // marker.png: one frame, or a strip of frames
    | { kind: 'particle' }
    | { kind: 'ring' };

/** The element a file supplies, from its name (case-insensitive), or null if it is not one. */
export function elementOf(fileName: string): ElementKey | null {
    const base = fileName.split('/').pop()!.toLowerCase();
    const dot = base.lastIndexOf('.');
    if (dot < 1) return null;
    const stem = base.slice(0, dot);
    const ext = base.slice(dot + 1);
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return null;
    if (stem === 'pieces') return { kind: 'sheet' };
    if (stem === 'puyo') return { kind: 'classic' };
    if (stem === 'garbage') return { kind: 'piece', color: 'garbage' };
    if (stem === 'ghost') return { kind: 'ghost', color: null };
    if (stem === 'marker') return { kind: 'marker' };
    if (stem === 'particle') return { kind: 'particle' };
    if (stem === 'ring') return { kind: 'ring' };
    const [head, tail] = stem.split(/-(.*)/s);
    if (head === 'puyo' && (COLOR_NAMES as readonly string[]).includes(tail)) return { kind: 'piece', color: tail as ColorName };
    if (head === 'ghost' && tail in DEFAULT_SYMBOLS) return { kind: 'ghost', color: tail as PieceColorName };
    if (head === 'tray' && (ICONS as readonly string[]).includes(tail)) return { kind: 'tray', icon: tail as GarbageIcon };
    if (head === 'junction' && tail in DEFAULT_SYMBOLS) return { kind: 'junction', color: tail as PieceColorName };
    return null;
}

/** A stable key for an element, so two files for the same element can be detected. */
export function elementId(e: ElementKey): string {
    switch (e.kind) {
        case 'piece': return `piece:${e.color}`;
        case 'ghost': return `ghost:${e.color ?? '*'}`;
        case 'tray': return `tray:${e.icon}`;
        case 'junction': return `junction:${e.color}`;
        default: return e.kind;
    }
}

// ── Masks ───────────────────────────────────────────────────────────────────

/**
 * The column of the classic community sheet for one of our masks. Ours:
 * 1 up, 2 right, 4 down, 8 left. The classic sheet: 1 down, 2 up, 4 right,
 * 8 left.
 */
export function classicColumn(mask: number): number {
    return ((mask & 1) ? 2 : 0) | ((mask & 2) ? 4 : 0) | ((mask & 4) ? 1 : 0) | ((mask & 8) ? 8 : 0);
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** A frame of an image split into a grid of equal cells. */
export interface Frame {
    file: string;
    cols: number;
    rows: number;
    col: number;
    row: number;
    /** Mirror horizontally (classic marker frames play back reversed and mirrored). */
    flip?: boolean;
}

export type SlotSource =
    | { from: 'painter' }
    | { from: 'none' }
    | { from: 'frame'; frame: Frame }
    /** A single white or greyscale image, tinted with the colour. */
    | { from: 'tinted'; file: string };

export interface SkinPlan {
    /** [colour][mask], colours in COLOR_NAMES order. Garbage uses mask 0 only. */
    pieces: Record<ColorName, SlotSource[]>;
    ghosts: Record<PieceColorName, SlotSource>;
    /** Fillers for the centre of 2x2 blocks: the skin's own, the painter's for painted pieces, or none. */
    junctions: Record<PieceColorName, SlotSource>;
    tray: Record<GarbageIcon, SlotSource>;
    /** Frames of the marker loop, or a single frame the game pulses, or the painter. */
    marker: { from: 'painter' } | { from: 'frames'; frames: Frame[]; pulse: boolean };
    particle: SlotSource;
    ring: SlotSource;
    /** Colours whose pieces come from art and whose colour the skin did not set: sample it. */
    sampleColors: ColorName[];
    problems: SkinProblem[];
}

export interface ImageInfo { width: number; height: number }

/**
 * Decide, for every slot of the atlas, where it comes from: a file, a frame of
 * a sheet, or the painter. More specific files win: puyo-red.png over
 * pieces.png over puyo.png over the painter.
 */
export function planSkin(manifest: SkinManifest, images: ReadonlyMap<string, ImageInfo>): SkinPlan {
    const problems: SkinProblem[] = [];
    const byElement = new Map<string, string>();
    for (const file of [...images.keys()].sort()) {
        const e = elementOf(file);
        if (!e) continue;
        const id = elementId(e);
        if (byElement.has(id)) {
            problems.push({ level: 'warning', message: `${file} and ${byElement.get(id)} are the same element; using ${byElement.get(id)}.` });
            continue;
        }
        byElement.set(id, file);
    }
    const file = (id: string) => byElement.get(id);
    const painter: SlotSource = { from: 'painter' };

    const sheet = file('sheet');
    const sheetInfo = sheet ? images.get(sheet)! : null;
    const sheetRows = sheetInfo ? Math.max(1, Math.round(sheetInfo.height / (sheetInfo.width / 16))) : 0;
    const classicSheet = file('classic');

    const pieces = {} as Record<ColorName, SlotSource[]>;
    const sampleColors: ColorName[] = [];
    COLOR_NAMES.forEach((color, row) => {
        const own = file(`piece:${color}`);
        const slots: SlotSource[] = [];
        for (let mask = 0; mask < 16; mask++) {
            const m = color === 'garbage' ? 0 : mask;
            if (own) {
                const info = images.get(own)!;
                const strip = info.width >= info.height * 8;
                slots.push({ from: 'frame', frame: strip ? { file: own, cols: 16, rows: 1, col: m, row: 0 } : { file: own, cols: 1, rows: 1, col: 0, row: 0 } });
            } else if (sheet && row < sheetRows) {
                slots.push({ from: 'frame', frame: { file: sheet, cols: 16, rows: sheetRows, col: m, row } });
            } else if (classicSheet && color !== 'garbage') {
                slots.push({ from: 'frame', frame: { file: classicSheet, cols: 16, rows: 16, col: classicColumn(m), row } });
            } else if (classicSheet && color === 'garbage') {
                const [r, c] = manifest.classic.garbage;
                slots.push({ from: 'frame', frame: { file: classicSheet, cols: 16, rows: 16, col: c, row: r } });
            } else {
                slots.push(painter);
            }
        }
        pieces[color] = slots;
        if (slots[0].from !== 'painter' && !manifest.explicitColors.includes(color)) sampleColors.push(color);
    });

    const ghosts = {} as Record<PieceColorName, SlotSource>;
    const anyGhost = file('ghost:*');
    for (const color of Object.keys(DEFAULT_SYMBOLS) as PieceColorName[]) {
        const own = file(`ghost:${color}`);
        ghosts[color] = own ? { from: 'frame', frame: { file: own, cols: 1, rows: 1, col: 0, row: 0 } }
            : anyGhost ? { from: 'tinted', file: anyGhost } : painter;
    }

    const junctions = {} as Record<PieceColorName, SlotSource>;
    for (const color of Object.keys(DEFAULT_SYMBOLS) as PieceColorName[]) {
        const own = file(`junction:${color}`);
        junctions[color] = own ? { from: 'frame', frame: { file: own, cols: 1, rows: 1, col: 0, row: 0 } }
            : pieces[color][15].from === 'painter' ? painter : { from: 'none' };
    }

    const tray = {} as Record<GarbageIcon, SlotSource>;
    ICONS.forEach((icon, i) => {
        const own = file(`tray:${icon}`);
        if (own) tray[icon] = { from: 'frame', frame: { file: own, cols: 1, rows: 1, col: 0, row: 0 } };
        else if (classicSheet) {
            const [r, c] = manifest.classic.tray;
            tray[icon] = { from: 'frame', frame: { file: classicSheet, cols: 16, rows: 16, col: c + i, row: r } };
        } else tray[icon] = painter;
    });

    let marker: SkinPlan['marker'] = { from: 'painter' };
    const markerFile = file('marker');
    if (markerFile) {
        const info = images.get(markerFile)!;
        const count = info.width >= info.height * 2 ? Math.max(1, Math.round(info.width / info.height)) : 1;
        const frames = Array.from({ length: count }, (_, i) => ({ file: markerFile, cols: count, rows: 1, col: i, row: 0 }));
        marker = { from: 'frames', frames, pulse: count === 1 };
    } else if (classicSheet) {
        const [r, c] = manifest.classic.marker;
        const n = manifest.classic.markerFrames;
        const forward = Array.from({ length: n }, (_, i) => ({ file: classicSheet, cols: 16, rows: 16, col: c + i, row: r }));
        // Forward, then back again mirrored: the classic sheets draw half a turn.
        const back = forward.slice().reverse().map(f => ({ ...f, flip: true }));
        marker = { from: 'frames', frames: n > 1 ? [...forward, ...back] : forward, pulse: n === 1 };
    }

    // White images the game tints each time it draws them.
    const single = (id: string): SlotSource => {
        const f = file(id);
        return f ? { from: 'frame', frame: { file: f, cols: 1, rows: 1, col: 0, row: 0 } } : painter;
    };

    return {
        pieces, ghosts, junctions, tray, marker,
        particle: single('particle'),
        ring: single('ring'),
        sampleColors,
        problems,
    };
}

/** A manifest for a bare community sheet dropped in without a skin.json. */
export function classicManifest(name: string): SkinManifest {
    const { manifest } = parseManifest({ format: SKIN_FORMAT, name: name || 'Imported skin', style: 'circuit' });
    return manifest!;
}
