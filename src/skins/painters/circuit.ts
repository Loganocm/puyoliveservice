/**
 * Circuit: Puyo Live's default piece style.
 *
 * Built like a keycap on a rail. Each piece has a crisp outline, a flat,
 * saturated rail that joins seamlessly to same-colour neighbours, and a
 * raised cap with a machined bevel (light on top, shadow below), a
 * hard-edged gloss band and a small glint. Every edge is hard: nothing is
 * blurred, so pieces stay sharp and readable at play size. Joins run the full
 * width of the piece, so joined groups read as solid capsules and blocks.
 *
 * Two shapes: 'round' puyos and 'tile', rounded squares in the manner of
 * modern block-puzzle games.
 */

import type { Glyph, GlyphStyle, PieceStyle } from '../../theme/tokens';
import { DOWN, LEFT, RIGHT, UP } from '../atlas';
import { mix, rgba } from '../color';
import { drawGlyph, edgeOf, TAU } from './shared';
import type { Painter, PainterOptions } from './types';

/** Proportions of a cell `s` across. */
const SIZE = 0.465;      // silhouette half-size
const OUTLINE = 0.042;   // outline thickness
const CAP_INSET = 0.042; // rail showing around the cap
const BEVEL = 0.034;     // bevel band on the cap
const CORNER = 0.36;     // tile corner radius, as a share of the half-size

export function circuitPainter(options: PainterOptions = {}): Painter {
    const tile = options.shape === 'tile';

    const shape = (p: Path2D, c: number, r: number) => {
        if (tile) p.roundRect(c - r, c - r, r * 2, r * 2, r * CORNER);
        else p.arc(c, c, r, 0, TAU);
    };
    const shapePath = (c: number, r: number) => {
        const p = new Path2D();
        shape(p, c, r);
        return p;
    };

    /** The piece and its joins as one path. Joins run past the cell edge to overlap the neighbour's. */
    const silhouette = (s: number, r: number, mask: number) => {
        const c = s / 2;
        const over = s * 0.1;
        const p = new Path2D();
        shape(p, c, r);
        if (mask & UP) p.rect(c - r, -over, r * 2, c + over);
        if (mask & DOWN) p.rect(c - r, c, r * 2, c + over);
        if (mask & LEFT) p.rect(-over, c - r, c + over, r * 2);
        if (mask & RIGHT) p.rect(c, c - r, c + over, r * 2);
        return p;
    };

    const metrics = (s: number) => {
        const R = s * SIZE;
        const o = Math.max(1.25, s * OUTLINE);
        const F = R - o;
        const K = F - s * CAP_INSET;
        return { c: s / 2, R, o, F, K };
    };

    /** The raised cap: base shading, bevel, gloss band and glint. */
    const cap = (ctx: CanvasRenderingContext2D, s: number, style: PieceStyle, K: number, gloss = true) => {
        const c = s / 2;
        const body = shapePath(c, K);

        // Groove: a thin shadow where the cap meets the rail.
        ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.strokeStyle = rgba(style.dark, 0.55);
        ctx.stroke(shapePath(c, K + ctx.lineWidth * 0.5));

        const face = ctx.createLinearGradient(0, c - K, 0, c + K);
        face.addColorStop(0, mix(style.base, style.light, 0.32));
        face.addColorStop(0.55, style.base);
        face.addColorStop(1, mix(style.base, style.dark, 0.26));
        ctx.fillStyle = face;
        ctx.fill(body);

        ctx.save();
        ctx.clip(body);

        // Bevel: lit along the top edge, shadowed along the bottom.
        const bw = Math.max(1, s * BEVEL);
        const bevel = ctx.createLinearGradient(0, c - K, 0, c + K);
        bevel.addColorStop(0, 'rgba(255,255,255,0.62)');
        bevel.addColorStop(0.42, 'rgba(255,255,255,0)');
        bevel.addColorStop(0.62, 'rgba(0,0,0,0)');
        bevel.addColorStop(1, 'rgba(0,0,0,0.30)');
        ctx.lineWidth = bw;
        ctx.strokeStyle = bevel;
        ctx.stroke(shapePath(c, K - bw / 2));

        if (gloss) {
            // Gloss: a hard-edged band across the upper part. Tiles take a
            // straight band, like machined plastic; round caps a lens.
            ctx.clip(shapePath(c, K - bw));
            const top = c - K;
            const bottom = tile ? c - K * 0.12 : c + K * 0.05;
            const band = ctx.createLinearGradient(0, top, 0, bottom);
            band.addColorStop(0, 'rgba(255,255,255,0.34)');
            band.addColorStop(1, 'rgba(255,255,255,0.06)');
            ctx.fillStyle = band;
            ctx.beginPath();
            if (tile) ctx.rect(c - K, top, K * 2, bottom - top);
            else ctx.ellipse(c, c - K * 0.5, K * 0.86, K * 0.55, 0, 0, TAU);
            ctx.fill();

            // Glint: one small, sharp point of light.
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            if (tile) ctx.roundRect(c - K * 0.64, c - K * 0.68, K * 0.2, K * 0.12, K * 0.06);
            else ctx.ellipse(c - K * 0.44, c - K * 0.54, K * 0.11, K * 0.07, -0.6, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    };

    return {
        piece(ctx, s, style, mask, glyph: Glyph | null, glyphs: GlyphStyle) {
            const { c, R, F, K } = metrics(s);
            ctx.fillStyle = edgeOf(style);
            ctx.fill(silhouette(s, R, mask));
            ctx.fillStyle = style.base;
            ctx.fill(silhouette(s, F, mask));
            cap(ctx, s, style, K);
            if (glyph && glyphs !== 'off') drawGlyph(ctx, glyph, c, c + K * 0.04, K * (glyphs === 'bold' ? 0.74 : 0.72), style, glyphs);
        },

        garbage(ctx, s, style) {
            // A bolted steel plate: the same build, no gloss, a recessed
            // centre and four rivets.
            const { c, R, F, K } = metrics(s);
            ctx.fillStyle = edgeOf(style);
            ctx.fill(silhouette(s, R, 0));
            ctx.fillStyle = mix(style.base, style.dark, 0.2);
            ctx.fill(silhouette(s, F, 0));
            cap(ctx, s, style, K, false);

            const inner = K * 0.5;
            ctx.fillStyle = rgba(style.dark, 0.5);
            ctx.fill(shapePath(c, inner));
            ctx.lineWidth = Math.max(1, s * 0.016);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.beginPath();
            if (tile) ctx.moveTo(c - inner, c + inner), ctx.lineTo(c + inner, c + inner);
            else ctx.arc(c, c, inner, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();

            const rivet = Math.max(1.5, s * 0.03);
            const at = K * (tile ? 0.66 : 0.64);
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                const x = c + dx * at * (tile ? 1 : Math.SQRT1_2 * 1.1);
                const y = c + dy * at * (tile ? 1 : Math.SQRT1_2 * 1.1);
                ctx.fillStyle = rgba(style.dark, 0.9);
                ctx.beginPath(); ctx.arc(x, y + rivet * 0.35, rivet, 0, TAU); ctx.fill();
                ctx.fillStyle = style.light;
                ctx.beginPath(); ctx.arc(x, y, rivet * 0.8, 0, TAU); ctx.fill();
            }
        },

        ghost(ctx, s, style) {
            // The piece's outline and a faint fill: plainly a preview.
            const { c, F } = metrics(s);
            const r = F * 0.9;
            ctx.fillStyle = rgba(style.base, 0.18);
            ctx.fill(shapePath(c, r));
            ctx.lineWidth = Math.max(1.5, s * 0.05);
            ctx.strokeStyle = rgba(style.base, 0.95);
            ctx.stroke(shapePath(c, r));
            ctx.fillStyle = rgba(style.light, 0.9);
            ctx.beginPath(); ctx.arc(c, c, Math.max(1.5, s * 0.045), 0, TAU); ctx.fill();
        },

        junction(ctx, s, style) {
            // Four joined pieces leave a notch at their shared corner, edged
            // in outline colour. Cover it with rail.
            const { c, F } = metrics(s);
            const h = c - F + Math.max(0.75, s * 0.008);
            ctx.fillStyle = style.base;
            ctx.fillRect(c - h, c - h, h * 2, h * 2);
        },
    };
}
