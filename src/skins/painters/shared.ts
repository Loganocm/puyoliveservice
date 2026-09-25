/**
 * Drawing shared by every piece style: the colour-blind symbols, the garbage
 * tray icons, the death-cell marker, and the particle and ring used by
 * effects. All crisp vector shapes: flat fills, clean outlines, no blur, so
 * they stay sharp at any size.
 */

import type { Glyph, PieceStyle, Theme } from '../../theme/tokens';
import type { GarbageIcon } from '../atlas';
import { mix, rgba } from '../color';

export const TAU = Math.PI * 2;

/** The outline colour for a piece: its dark shade pushed further toward black. */
export const edgeOf = (style: PieceStyle) => mix(style.dark, '#000000', 0.35);

/** Trace a symbol centred on (x, y), `size` across. The caller fills or strokes. */
export function glyphPath(ctx: CanvasRenderingContext2D, glyph: Glyph, x: number, y: number, size: number): void {
    const h = size / 2;
    ctx.beginPath();
    switch (glyph) {
        case 'circle':
            ctx.arc(x, y, h * 0.78, 0, TAU);
            break;
        case 'triangle':
            ctx.moveTo(x, y - h * 0.92);
            ctx.lineTo(x + h * 0.96, y + h * 0.72);
            ctx.lineTo(x - h * 0.96, y + h * 0.72);
            ctx.closePath();
            break;
        case 'square': {
            const q = h * 0.74;
            ctx.roundRect(x - q, y - q, q * 2, q * 2, h * 0.16);
            break;
        }
        case 'diamond':
            ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.82, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h * 0.82, y);
            ctx.closePath();
            break;
        case 'plus': {
            const t = h * 0.34;
            ctx.moveTo(x - t, y - h * 0.9);
            ctx.lineTo(x + t, y - h * 0.9); ctx.lineTo(x + t, y - t); ctx.lineTo(x + h * 0.9, y - t);
            ctx.lineTo(x + h * 0.9, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + h * 0.9);
            ctx.lineTo(x - t, y + h * 0.9); ctx.lineTo(x - t, y + t); ctx.lineTo(x - h * 0.9, y + t);
            ctx.lineTo(x - h * 0.9, y - t); ctx.lineTo(x - t, y - t);
            ctx.closePath();
            break;
        }
    }
}

/**
 * A symbol in one of the player's styles. 'subtle' is engraved into the
 * surface; 'bold' is a large white shape with a dark outline, readable at a
 * glance.
 */
export function drawGlyph(
    ctx: CanvasRenderingContext2D, glyph: Glyph, x: number, y: number, radius: number,
    style: PieceStyle, mode: 'subtle' | 'bold',
): void {
    ctx.save();
    ctx.lineJoin = 'round';
    if (mode === 'bold') {
        glyphPath(ctx, glyph, x, y, radius * 1.1);
        ctx.lineWidth = Math.max(1.5, radius * 0.16);
        ctx.strokeStyle = rgba(edgeOf(style), 0.95);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.97)';
        ctx.fill();
    } else {
        const size = radius * 0.78;
        const lip = Math.max(1, radius * 0.045);
        // Engraved: a light lip below the cut, the cut itself in the dark shade.
        glyphPath(ctx, glyph, x, y + lip, size);
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fill();
        glyphPath(ctx, glyph, x, y, size);
        ctx.fillStyle = rgba(mix(style.dark, '#000000', 0.2), 0.62);
        ctx.fill();
    }
    ctx.restore();
}

/** Garbage tray icons: the rarer the shape, the more garbage it stands for. */
export function drawIcon(ctx: CanvasRenderingContext2D, s: number, icon: GarbageIcon, garbage: PieceStyle, palette: Record<string, PieceStyle>, theme: Theme): void {
    const c = s / 2;
    const line = Math.max(1.5, s * 0.045);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Every icon: a flat body, a crisp outline and one hard highlight band.
    const finish = (fill: string, edge: string) => {
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(0, 0, s, c * 0.92);
        ctx.restore();
        ctx.lineWidth = line;
        ctx.strokeStyle = edge;
        ctx.stroke();
    };
    const disc = (r: number, style: PieceStyle) => {
        ctx.beginPath();
        ctx.arc(c, c, r, 0, TAU);
        finish(style.base, edgeOf(style));
    };
    const star = (points: number, outer: number, inner: number, style: PieceStyle) => {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / points;
            const rad = i % 2 ? inner : outer;
            ctx.lineTo(c + Math.cos(a) * rad, c + s * 0.03 + Math.sin(a) * rad);
        }
        ctx.closePath();
        finish(style.base, edgeOf(style));
    };
    const yellow = palette.yellow ?? garbage;
    const purple = palette.purple ?? garbage;
    const red = palette.red ?? garbage;

    switch (icon) {
        case 'small': disc(s * 0.19, garbage); break;
        case 'big': disc(s * 0.33, garbage); break;
        case 'rock': {
            // A cut hexagonal stone.
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = -Math.PI / 2 + (i * TAU) / 6;
                ctx.lineTo(c + Math.cos(a) * s * 0.38, c + Math.sin(a) * s * 0.38);
            }
            ctx.closePath();
            finish(mix(garbage.base, garbage.dark, 0.25), edgeOf(garbage));
            break;
        }
        case 'star': star(5, s * 0.41, s * 0.18, yellow); break;
        case 'moon': {
            ctx.beginPath();
            ctx.arc(c, c, s * 0.37, Math.PI * 0.32, Math.PI * 1.68, false);
            ctx.arc(c + s * 0.16, c - s * 0.08, s * 0.3, Math.PI * 1.4, Math.PI * 0.55, true);
            ctx.closePath();
            finish(purple.base, edgeOf(purple));
            break;
        }
        case 'crown':
            ctx.beginPath();
            ctx.moveTo(s * 0.14, s * 0.76); ctx.lineTo(s * 0.14, s * 0.32); ctx.lineTo(s * 0.33, s * 0.52);
            ctx.lineTo(c, s * 0.2); ctx.lineTo(s * 0.67, s * 0.52); ctx.lineTo(s * 0.86, s * 0.32);
            ctx.lineTo(s * 0.86, s * 0.76); ctx.closePath();
            finish(red.base === garbage.base ? theme.accent.primary : red.base, edgeOf(red));
            break;
    }
}

/** A soft white dot, tinted per particle. The one deliberately soft texture: it is light, not an object. */
export function drawParticle(ctx: CanvasRenderingContext2D, s: number): void {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
}

/** A thin white ring, tinted per use (pop bursts). */
export function drawRing(ctx: CanvasRenderingContext2D, s: number): void {
    const c = s / 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.42, 0, TAU);
    ctx.stroke();
}

/** The death-cell marker, frame `t` (0..1) of its loop: a precise reticle that breathes. */
export function drawMarker(ctx: CanvasRenderingContext2D, s: number, t: number, theme: Theme): void {
    const c = s / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * TAU);
    const color = theme.accent.primary;
    ctx.lineCap = 'round';
    // Outer ring, broken into four arcs that turn slowly with the loop.
    ctx.strokeStyle = rgba(color, 0.45 + 0.4 * pulse);
    ctx.lineWidth = s * 0.045;
    const turn = t * (Math.PI / 2);
    for (let i = 0; i < 4; i++) {
        const a = turn + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(c, c, s * 0.36, a + 0.22, a + Math.PI / 2 - 0.22);
        ctx.stroke();
    }
    // The cross, steady.
    ctx.strokeStyle = rgba(color, 0.9);
    ctx.lineWidth = s * 0.055;
    const k = s * (0.12 + 0.015 * pulse);
    ctx.beginPath();
    ctx.moveTo(c - k, c - k); ctx.lineTo(c + k, c + k);
    ctx.moveTo(c + k, c - k); ctx.lineTo(c - k, c + k);
    ctx.stroke();
}
