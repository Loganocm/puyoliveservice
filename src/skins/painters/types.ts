import type { Glyph, GlyphStyle, PieceStyle } from '../../theme/tokens';

/**
 * A piece style drawn in code. A skin names one (`"style"` in skin.json) and
 * it draws every piece, garbage, ghost and junction the skin does not supply
 * as a file. Shared elements (tray icons, marker, effects) are drawn by
 * painters/shared.ts for every style.
 *
 * Every method draws into the square (0, 0, s, s) of `ctx`.
 */
export interface Painter {
    /** A piece joined to the neighbours in `mask` (bit 1 up, 2 right, 4 down, 8 left). */
    piece(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle, mask: number, glyph: Glyph | null, glyphs: GlyphStyle): void;
    garbage(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle): void;
    /** Where a pair will land. */
    ghost(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle): void;
    /**
     * Drawn centred on the corner shared by a 2x2 block of one colour, to fill
     * the gap the four joined pieces leave there. Draw nothing if the style
     * leaves no gap.
     */
    junction(ctx: CanvasRenderingContext2D, s: number, style: PieceStyle): void;
}

export interface PainterOptions {
    /** Piece outline: 'round' puyos or 'tile' rounded squares. */
    shape?: 'round' | 'tile';
}
