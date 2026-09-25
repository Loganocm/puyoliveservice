/**
 * A small board drawn from a composed atlas, for the skin picker: joined
 * groups, a 2x2 block, garbage and a ghost, so a skin can be judged at a
 * glance without starting a game.
 */

import { GHOST_ROW, JUNCTION_COLUMN } from './atlas';

/** Bottom rows of a board. Letters: R G B Y P colours, O garbage, g a green ghost. */
const BOARD = [
    '..g...',
    'P..Y..',
    'PRRYBB',
    'OGRRBO',
    'GGRRPP',
];
const ROW_OF: Record<string, number> = { R: 0, G: 1, B: 2, Y: 3, P: 4, O: 5 };

export const PREVIEW_COLUMNS = 6;
export const PREVIEW_ROWS = BOARD.length;

/** Draw the preview into `target` (sized by the caller), from an atlas with `cell`-pixel cells. */
export function drawSkinPreview(target: HTMLCanvasElement, atlas: HTMLCanvasElement, cell: number): void {
    const ctx = target.getContext('2d')!;
    const s = Math.min(target.width / PREVIEW_COLUMNS, target.height / PREVIEW_ROWS);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.imageSmoothingQuality = 'high';
    const at = (c: number, r: number) => BOARD[r]?.[c] ?? '.';
    const joins = (k: string) => k !== '.' && k !== 'O' && k !== 'g';
    const maskOf = (c: number, r: number) => {
        const k = at(c, r);
        if (!joins(k)) return 0;
        return (at(c, r - 1) === k ? 1 : 0) | (at(c + 1, r) === k ? 2 : 0) | (at(c, r + 1) === k ? 4 : 0) | (at(c - 1, r) === k ? 8 : 0);
    };
    const blit = (col: number, row: number, x: number, y: number) =>
        ctx.drawImage(atlas, col * cell, row * cell, cell, cell, x, y, s, s);

    for (let r = 0; r < PREVIEW_ROWS; r++) {
        for (let c = 0; c < PREVIEW_COLUMNS; c++) {
            const k = at(c, r);
            if (k === '.') continue;
            if (k === 'g') blit(1, GHOST_ROW, c * s, r * s);
            else blit(k === 'O' ? 0 : maskOf(c, r), ROW_OF[k], c * s, r * s);
        }
    }
    for (let r = 0; r + 1 < PREVIEW_ROWS; r++) {
        for (let c = 0; c + 1 < PREVIEW_COLUMNS; c++) {
            const k = at(c, r);
            if (!joins(k) || (maskOf(c, r) & 6) !== 6 || at(c + 1, r + 1) !== k || (maskOf(c + 1, r + 1) & 9) !== 9) continue;
            blit(JUNCTION_COLUMN + ROW_OF[k], GHOST_ROW, (c + 0.5) * s, (r + 0.5) * s);
        }
    }
}

