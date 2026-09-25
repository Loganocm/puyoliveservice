/**
 * Gel: the soft, glossy orbs Puyo Live shipped in 0.3.0, kept as a skin.
 * Radial shading, a soft highlight, and narrow bridges between same-colour
 * neighbours, so joined groups read as beads.
 */

import type { Glyph, GlyphStyle, PieceStyle } from '../../theme/tokens';
import { DOWN, LEFT, RIGHT, UP } from '../atlas';
import { rgba } from '../color';
import { glyphPath, TAU } from './shared';
import type { Painter } from './types';

/** A circle plus a bridge toward each connected neighbour, as one path. */
function orbPath(s: number, radius: number, bridge: number, mask: number): Path2D {
    const c = s / 2;
    const p = new Path2D();
    p.arc(c, c, radius, 0, TAU);
    const over = s * 0.1;
    const half = bridge / 2;
    if (mask & UP) p.rect(c - half, -over, bridge, c + over);
    if (mask & DOWN) p.rect(c - half, c, bridge, c + over);
    if (mask & LEFT) p.rect(-over, c - half, c + over, bridge);
    if (mask & RIGHT) p.rect(c, c - half, c + over, bridge);
    return p;
}

function orb(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle, mask: number, garbage: boolean, glyph: Glyph | null, glyphs: GlyphStyle): void {
    const c = s / 2;
    const r = s * 0.44;
    const rim = s * 0.045;

    ctx.fillStyle = style.dark;
    ctx.fill(orbPath(s, r, r * 1.62, mask));

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

    if (glyph && glyphs === 'bold') {
        const size = r * 0.72;
        glyphPath(ctx, glyph, c, c + r * 0.06, size);
        ctx.lineJoin = 'round';
        ctx.lineWidth = s * 0.05;
        ctx.strokeStyle = rgba(style.dark, 0.95);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fill();
    } else if (glyph && glyphs === 'subtle') {
        const size = r * 0.44;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        glyphPath(ctx, glyph, c, c + r * 0.08 + s * 0.012, size); ctx.fill();
        ctx.fillStyle = rgba(style.dark, 0.62);
        glyphPath(ctx, glyph, c, c + r * 0.08, size); ctx.fill();
    }
}

export function gelPainter(): Painter {
    return {
        piece: (ctx, s, style, mask, glyph, glyphs) => orb(ctx, s, style, mask, false, glyph, glyphs),
        garbage: (ctx, s, style) => orb(ctx, s, style, 0, true, null, 'off'),
        ghost(ctx, s, style) {
            const c = s / 2;
            const r = s * 0.38;
            ctx.fillStyle = rgba(style.base, 0.16);
            ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.fill();
            ctx.strokeStyle = rgba(style.base, 0.9);
            ctx.lineWidth = s * 0.055;
            ctx.setLineDash([s * 0.11, s * 0.075]);
            ctx.beginPath(); ctx.arc(c, c, r, -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
            ctx.setLineDash([]);
        },
        // Narrow bridges leave the centre of a 2x2 block open by design.
        junction: () => undefined,
    };
}
