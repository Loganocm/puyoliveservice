/**
 * PieceArt: Puyo Live's own piece art, drawn in code.
 *
 * Replaces the recycled sprite sheets (CLI-14, LEG-01). Every texture the
 * board needs is painted once at start-up onto a single canvas atlas, at the
 * device's pixel density, and handed to Pixi as one GPU texture:
 *
 *   rows 0-5   gel orbs for red, green, blue, yellow, purple and garbage, in
 *              each of the 16 neighbour combinations (bit 1 up, 2 right,
 *              4 down, 8 left). Same-colour neighbours fuse through bridges.
 *   row 6      garbage tray icons (small, big, rock, star, moon, crown), a
 *              soft particle and a thin ring (both white, tinted per use).
 *   row 7      the death-cell marker, 12 frames of a pulsing ring.
 *   row 8      ghost outlines, one per colour, in ORB_ROWS order.
 *
 * Nothing is downloaded, nothing needs a licence, and everything is sharp at
 * any size. The look is specified in
 * website/src/content/docs/design/visual-identity.md.
 */

import { PuyoColor } from '@puyolive/engine';
import type { Glyph, PieceStyle, Theme } from '../theme/tokens';

export const ATLAS_COLUMNS = 16;
export const ORB_ROWS: readonly number[] = [
    PuyoColor.Red, PuyoColor.Green, PuyoColor.Blue, PuyoColor.Yellow, PuyoColor.Purple, PuyoColor.Garbage,
];
export const ICON_ROW = 6;
export const MARKER_ROW = 7;
export const MARKER_FRAMES = 12;
export const ICONS = ['small', 'big', 'rock', 'star', 'moon', 'crown'] as const;
export type GarbageIcon = typeof ICONS[number];
export const PARTICLE_COLUMN = ICONS.length;
export const RING_COLUMN = ICONS.length + 1;
export const GHOST_ROW = 8;

const TAU = Math.PI * 2;

/** Paint the whole atlas. `cell` is the pixel size of one texture. */
export function paintAtlas(theme: Theme, cell: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = cell * ATLAS_COLUMNS;
    canvas.height = cell * (GHOST_ROW + 1);
    const ctx = canvas.getContext('2d')!;

    ORB_ROWS.forEach((color, row) => {
        const style = theme.pieces[color];
        for (let mask = 0; mask < 16; mask++) {
            ctx.save();
            ctx.translate(mask * cell, row * cell);
            // Garbage never connects visually: it is always drawn alone.
            drawOrb(ctx, cell, style, color === PuyoColor.Garbage ? 0 : mask, color === PuyoColor.Garbage);
            ctx.restore();
        }
    });

    ICONS.forEach((icon, i) => {
        ctx.save();
        ctx.translate(i * cell, ICON_ROW * cell);
        drawIcon(ctx, cell, icon, theme);
        ctx.restore();
    });
    ctx.save();
    ctx.translate(PARTICLE_COLUMN * cell, ICON_ROW * cell);
    drawParticle(ctx, cell);
    ctx.restore();
    ctx.save();
    ctx.translate(RING_COLUMN * cell, ICON_ROW * cell);
    drawRing(ctx, cell);
    ctx.restore();

    ORB_ROWS.forEach((color, i) => {
        if (color === PuyoColor.Garbage) return;
        ctx.save();
        ctx.translate(i * cell, GHOST_ROW * cell);
        drawGhost(ctx, cell, theme.pieces[color]);
        ctx.restore();
    });

    for (let f = 0; f < MARKER_FRAMES; f++) {
        ctx.save();
        ctx.translate(f * cell, MARKER_ROW * cell);
        drawMarker(ctx, cell, f / MARKER_FRAMES, theme);
        ctx.restore();
    }
    return canvas;
}

/**
 * The orb body as one path: a circle plus a bridge toward each connected
 * neighbour. Bridges run past the cell edge so the neighbour's matching bridge
 * overlaps it and the join has no seam. Subpaths share a winding direction,
 * so a nonzero fill is their union.
 */
function orbPath(s: number, radius: number, bridge: number, mask: number): Path2D {
    const c = s / 2;
    const p = new Path2D();
    p.arc(c, c, radius, 0, TAU);
    const over = s * 0.1;
    const half = bridge / 2;
    if (mask & 1) p.rect(c - half, -over, bridge, c + over);
    if (mask & 4) p.rect(c - half, c, bridge, c + over);
    if (mask & 8) p.rect(-over, c - half, c + over, bridge);
    if (mask & 2) p.rect(c, c - half, c + over, bridge);
    return p;
}

function drawOrb(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle, mask: number, garbage: boolean): void {
    const c = s / 2;
    const r = s * 0.44;
    const rim = s * 0.045;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, s, s);
    ctx.clip();

    // Rim: the body drawn slightly larger in the shadow colour.
    ctx.fillStyle = style.dark;
    ctx.fill(orbPath(s, r, r * 1.62, mask));

    // Body: lit from the upper left.
    const body = orbPath(s, r - rim, r * 1.62 - rim * 2, mask);
    const g = ctx.createRadialGradient(c - r * 0.38, c - r * 0.48, r * 0.08, c, c, r * 1.15);
    g.addColorStop(0, style.light);
    g.addColorStop(0.45, style.base);
    g.addColorStop(1, style.dark);
    ctx.fillStyle = g;
    ctx.fill(body);

    if (garbage) {
        // Frosted stone: a fine cross-hatch clipped to the body.
        ctx.save();
        ctx.clip(body);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = Math.max(1, s * 0.012);
        for (let k = -s; k < s * 2; k += s * 0.14) {
            ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + s, s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(k + s, 0); ctx.lineTo(k, s); ctx.stroke();
        }
        ctx.restore();
    }

    // Specular highlight: a soft oval on the lit side.
    ctx.save();
    ctx.translate(c - r * 0.34, c - r * 0.46);
    ctx.rotate(-0.5);
    const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.36);
    hl.addColorStop(0, 'rgba(255,255,255,0.85)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.scale(1, 0.62);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (style.glyph) {
        const size = r * 0.44;
        // Embossed: a light edge offset below, the dark shape on top.
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        glyphPath(ctx, style.glyph, c, c + r * 0.08 + s * 0.012, size); ctx.fill();
        ctx.fillStyle = hexWithAlpha(style.dark, 0.62);
        glyphPath(ctx, style.glyph, c, c + r * 0.08, size); ctx.fill();
    }
    ctx.restore();
}

function glyphPath(ctx: CanvasRenderingContext2D, glyph: Glyph, x: number, y: number, size: number): void {
    const h = size / 2;
    ctx.beginPath();
    switch (glyph) {
        case 'circle':
            ctx.arc(x, y, h * 0.8, 0, TAU);
            break;
        case 'triangle':
            ctx.moveTo(x, y - h);
            ctx.lineTo(x + h * 0.95, y + h * 0.7);
            ctx.lineTo(x - h * 0.95, y + h * 0.7);
            ctx.closePath();
            break;
        case 'square': {
            const q = h * 0.78, rr = h * 0.2;
            ctx.roundRect(x - q, y - q, q * 2, q * 2, rr);
            break;
        }
        case 'diamond':
            ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.8, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h * 0.8, y);
            ctx.closePath();
            break;
        case 'plus': {
            const t = h * 0.36;
            ctx.rect(x - t, y - h * 0.9, t * 2, h * 1.8);
            ctx.rect(x - h * 0.9, y - t, h * 1.8, t * 2);
            break;
        }
    }
}

/** Garbage tray icons: bigger and rarer shapes stand for more garbage. */
function drawIcon(ctx: CanvasRenderingContext2D, s: number, icon: GarbageIcon, theme: Theme): void {
    const c = s / 2;
    const stone = theme.pieces[PuyoColor.Garbage];
    const orb = (r: number) => {
        const g = ctx.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
        g.addColorStop(0, stone.light); g.addColorStop(0.5, stone.base); g.addColorStop(1, stone.dark);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.fill();
    };
    const star = (points: number, outer: number, inner: number, fill: string, stroke: string) => {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / points;
            const rad = i % 2 ? inner : outer;
            ctx.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = s * 0.04; ctx.strokeStyle = stroke; ctx.stroke();
    };
    switch (icon) {
        case 'small': orb(s * 0.2); break;
        case 'big': orb(s * 0.36); break;
        case 'rock':
            ctx.beginPath();
            ctx.moveTo(c, s * 0.1); ctx.lineTo(s * 0.88, s * 0.4); ctx.lineTo(s * 0.74, s * 0.88);
            ctx.lineTo(s * 0.26, s * 0.88); ctx.lineTo(s * 0.12, s * 0.4); ctx.closePath();
            ctx.fillStyle = stone.base; ctx.fill();
            ctx.lineWidth = s * 0.05; ctx.strokeStyle = stone.dark; ctx.stroke();
            break;
        case 'star': star(5, s * 0.42, s * 0.18, theme.state.warning, '#7A4B00'); break;
        case 'moon':
            ctx.fillStyle = theme.pieces[PuyoColor.Purple].base;
            ctx.beginPath(); ctx.arc(c, c, s * 0.38, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(c + s * 0.17, c - s * 0.1, s * 0.32, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            break;
        case 'crown':
            ctx.beginPath();
            ctx.moveTo(s * 0.12, s * 0.78); ctx.lineTo(s * 0.12, s * 0.3); ctx.lineTo(s * 0.32, s * 0.52);
            ctx.lineTo(c, s * 0.18); ctx.lineTo(s * 0.68, s * 0.52); ctx.lineTo(s * 0.88, s * 0.3);
            ctx.lineTo(s * 0.88, s * 0.78); ctx.closePath();
            ctx.fillStyle = theme.accent.primary; ctx.fill();
            ctx.lineWidth = s * 0.04; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
            break;
    }
}

function drawParticle(ctx: CanvasRenderingContext2D, s: number): void {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
}

function drawRing(ctx: CanvasRenderingContext2D, s: number): void {
    const c = s / 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.arc(c, c, s * 0.42, 0, TAU); ctx.stroke();
}

/**
 * Where the piece will land: an outline in the piece's colour with a faint
 * fill, so it reads as a preview rather than as a real, dimmed orb.
 */
function drawGhost(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle): void {
    const c = s / 2;
    const r = s * 0.38;
    ctx.fillStyle = hexWithAlpha(style.base, 0.16);
    ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = hexWithAlpha(style.base, 0.9);
    ctx.lineWidth = s * 0.055;
    ctx.setLineDash([s * 0.11, s * 0.075]);
    ctx.beginPath(); ctx.arc(c, c, r, -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    ctx.setLineDash([]);
}

/** The death-cell marker: a ring that breathes. `t` runs 0..1 over the loop. */
function drawMarker(ctx: CanvasRenderingContext2D, s: number, t: number, theme: Theme): void {
    const c = s / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * TAU);
    ctx.strokeStyle = hexWithAlpha(theme.accent.primary, 0.35 + 0.45 * pulse);
    ctx.lineWidth = s * (0.06 + 0.03 * pulse);
    ctx.beginPath(); ctx.arc(c, c, s * (0.3 + 0.05 * pulse), 0, TAU); ctx.stroke();
    ctx.lineWidth = s * 0.05;
    ctx.strokeStyle = hexWithAlpha(theme.accent.primary, 0.8);
    const k = s * 0.13;
    ctx.beginPath();
    ctx.moveTo(c - k, c - k); ctx.lineTo(c + k, c + k);
    ctx.moveTo(c + k, c - k); ctx.lineTo(c - k, c + k);
    ctx.stroke();
}

function hexWithAlpha(color: string, alpha: number): string {
    if (!color.startsWith('#')) return color;
    const n = parseInt(color.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
