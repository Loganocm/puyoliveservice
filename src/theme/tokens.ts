/**
 * Theme tokens: the single source of truth for Puyo Live's colours.
 *
 * Both renderers read from here -- the Pixi canvas (board, pieces, effects)
 * and the React menus (through CSS custom properties set by
 * applyThemeToDocument) -- so the game and its UI cannot drift apart.
 *
 * A theme colours the board and the menus. Piece colours belong to the
 * active skin (src/skins/): it sets them here with setPiecePalette, and
 * everything else reads them with getPieceStyle.
 *
 * Values and rationale are specified in
 * website/src/content/docs/design/visual-identity.md. Change them there and
 * here together.
 */

import { PuyoColor } from '@puyolive/engine';
import { DEFAULT_PALETTE } from '../skins/format';

export type Glyph = 'circle' | 'triangle' | 'square' | 'diamond' | 'plus';

export interface PieceStyle {
    /** Body colour. */
    base: string;
    /** Lit side of the body. */
    light: string;
    /** Shadowed side and rim. */
    dark: string;
    /** Embossed shape in the core; null for garbage. */
    glyph: Glyph | null;
}

export interface Theme {
    id: 'midnight' | 'daybreak' | 'contrast';
    name: string;
    bg: { base: string; raised: string; board: string; boardEdge: string };
    line: { subtle: string; grid: string };
    text: { primary: string; muted: string };
    accent: { primary: string; secondary: string };
    state: { danger: string; success: string; warning: string };
    /** Soft light blobs drifting behind everything. */
    ambient: string[];
}

export const THEMES: Record<Theme['id'], Theme> = {
    midnight: {
        id: 'midnight',
        name: 'Midnight',
        bg: { base: '#0B0E17', raised: '#131826', board: 'rgba(26,32,52,0.78)', boardEdge: 'rgba(255,255,255,0.10)' },
        line: { subtle: 'rgba(255,255,255,0.06)', grid: 'rgba(255,255,255,0.035)' },
        text: { primary: '#EEF1F8', muted: '#8C95AB' },
        accent: { primary: '#FF4F7B', secondary: '#35D0E6' },
        state: { danger: '#FF5A5A', success: '#3DDC97', warning: '#FFB23F' },
        ambient: ['#FF4F7B', '#35D0E6', '#7B5CFF', '#FF9F43'],
    },
    daybreak: {
        id: 'daybreak',
        name: 'Daybreak',
        bg: { base: '#EEF1F8', raised: '#FFFFFF', board: 'rgba(255,255,255,0.82)', boardEdge: 'rgba(11,14,23,0.12)' },
        line: { subtle: 'rgba(11,14,23,0.08)', grid: 'rgba(11,14,23,0.05)' },
        text: { primary: '#131826', muted: '#5B6478' },
        accent: { primary: '#E0305F', secondary: '#0E9FB8' },
        state: { danger: '#D93636', success: '#138A5A', warning: '#C77700' },
        ambient: ['#FF8FAB', '#7FE3F0', '#B7A6FF', '#FFC98A'],
    },
    contrast: {
        id: 'contrast',
        name: 'High contrast',
        bg: { base: '#000000', raised: '#0D0D0D', board: 'rgba(0,0,0,1)', boardEdge: 'rgba(255,255,255,0.6)' },
        line: { subtle: 'rgba(255,255,255,0.2)', grid: 'rgba(255,255,255,0.12)' },
        text: { primary: '#FFFFFF', muted: '#C8C8C8' },
        accent: { primary: '#FF3B6B', secondary: '#00E5FF' },
        state: { danger: '#FF3B3B', success: '#00FF94', warning: '#FFD000' },
        ambient: [],
    },
};

let piecePalette: Record<number, PieceStyle> = DEFAULT_PALETTE;

/** The active skin's colours for a piece colour (PuyoColor), for effects and UI. */
export function getPieceStyle(color: number): PieceStyle | undefined {
    return piecePalette[color];
}

/** Set by the skin loader once a skin is composed. Does not notify: the loader already has. */
export function setPiecePalette(palette: Record<number, PieceStyle>): void {
    piecePalette = palette;
}

/**
 * Type families. Fredoka (SIL OFL) is bundled with the client, so the display
 * face never waits on a third-party request; the UI face is the system's own.
 */
export const FONTS = {
    display: '"Fredoka Variable", Fredoka, "Segoe UI Rounded", "Segoe UI", system-ui, sans-serif',
    ui: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/**
 * The colour a chain of `links` is called out in: cool for short chains,
 * hot for long ones, so a glance says how big it was.
 */
export function chainColor(theme: Theme, links: number): string {
    const ramp = [
        theme.accent.secondary,
        piecePalette[PuyoColor.Green].base,
        piecePalette[PuyoColor.Yellow].base,
        theme.state.warning,
        theme.accent.primary,
        piecePalette[PuyoColor.Purple].base,
    ];
    return ramp[Math.max(0, Math.min(ramp.length - 1, links - 2))];
}

const STORAGE_KEY = 'puyolive_theme';

function storedThemeId(): Theme['id'] {
    try {
        const id = localStorage.getItem(STORAGE_KEY);
        if (id && id in THEMES) return id as Theme['id'];
    } catch { /* storage unavailable: default theme */ }
    return 'midnight';
}

let current: Theme = THEMES[storedThemeId()];

export const getTheme = (): Theme => current;

/**
 * Themes offered in settings. Daybreak (light) is defined but not offered yet:
 * the menus still hard-code light text in places, and it would be unreadable
 * there. It is listed once they read every colour from these tokens.
 */
export const SELECTABLE_THEMES: readonly Theme['id'][] = ['midnight', 'contrast'];

const listeners = new Set<() => void>();

/** Be told when the theme, piece symbols or motion preference change. Returns an unsubscribe. */
export function onThemeChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function changed(): void {
    applyThemeToDocument();
    for (const listener of listeners) listener();
}

/** Tell listeners the appearance changed for a reason outside this module (a new skin). */
export function notifyAppearanceChanged(): void {
    changed();
}

/** Switch theme for this and future sessions. */
export function setTheme(id: Theme['id']): void {
    current = THEMES[id];
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* not persisted */ }
    changed();
}

/**
 * The symbol embossed in each piece, which tells colours apart without
 * colour. 'bold' is for players who rely on it; 'off' for those who do not
 * want it. See design/visual-identity.md.
 */
export type GlyphStyle = 'subtle' | 'bold' | 'off';
const GLYPH_KEY = 'puyolive_glyphs';

export function getGlyphStyle(): GlyphStyle {
    try {
        const v = localStorage.getItem(GLYPH_KEY);
        if (v === 'bold' || v === 'off' || v === 'subtle') return v;
    } catch { /* default */ }
    return 'subtle';
}

export function setGlyphStyle(style: GlyphStyle): void {
    try { localStorage.setItem(GLYPH_KEY, style); } catch { /* not persisted */ }
    changed();
}

/** Turn the game's own reduced-motion setting on or off (the OS setting always applies). */
export function setReducedMotion(on: boolean): void {
    try { localStorage.setItem('puyolive_reduced_motion', on ? '1' : '0'); } catch { /* not persisted */ }
    changed();
}

/** Expose the tokens to CSS as custom properties (--pl-bg-base, --pl-accent-primary, ...). */
export function applyThemeToDocument(theme: Theme = current): void {
    const root = document.documentElement.style;
    const set = (name: string, value: string) => root.setProperty(`--pl-${name}`, value);
    set('bg-base', theme.bg.base);
    set('bg-raised', theme.bg.raised);
    set('bg-board', theme.bg.board);
    set('line-subtle', theme.line.subtle);
    set('text-primary', theme.text.primary);
    set('text-muted', theme.text.muted);
    set('accent-primary', theme.accent.primary);
    set('accent-secondary', theme.accent.secondary);
    set('state-danger', theme.state.danger);
    set('state-success', theme.state.success);
    set('state-warning', theme.state.warning);
    theme.ambient.forEach((c, i) => set(`ambient-${i}`, c));
    document.documentElement.dataset.theme = theme.id;
}

/** "#RRGGBB" or "rgba(...)" to a Pixi colour number (alpha dropped). */
export function toPixi(color: string): number {
    if (color.startsWith('#')) return parseInt(color.slice(1, 7), 16);
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]) : 0xffffff;
}

/** The alpha component of an rgba() string, or 1. */
export function alphaOf(color: string): number {
    const m = color.match(/rgba\([^)]*,\s*([\d.]+)\)/);
    return m ? Number(m[1]) : 1;
}

/** Whether the player (or their OS) asked for reduced motion. */
export function prefersReducedMotion(): boolean {
    try {
        if (localStorage.getItem('puyolive_reduced_motion') === '1') return true;
    } catch { /* ignore */ }
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
