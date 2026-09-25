/**
 * A tiny text notation for boards and pairs, so scenarios read like pictures.
 *
 *   rows: top to bottom, BOTTOM-ALIGNED -- the last string is the floor row.
 *   Give up to 14 rows; the top two of a full 14 are the hidden rows.
 *
 *     .  empty      R G B Y P  colours      O  garbage (ojama)
 *
 *   pairs: two letters, main then sub. "RG" is a red axis puyo with a green
 *   puyo orbiting it (above it at rotation 0).
 */

import { COLS, TOTAL_ROWS, PuyoColor } from '@puyolive/engine';
import type { PuyoPair } from '@puyolive/engine';

const CHAR_TO_COLOR: Record<string, PuyoColor> = {
    '.': PuyoColor.None,
    R: PuyoColor.Red,
    G: PuyoColor.Green,
    B: PuyoColor.Blue,
    Y: PuyoColor.Yellow,
    P: PuyoColor.Purple,
    O: PuyoColor.Garbage,
};

const COLOR_TO_CHAR: Record<number, string> = Object.fromEntries(
    Object.entries(CHAR_TO_COLOR).map(([ch, c]) => [c, ch]),
);

/** Parse bottom-aligned rows into a column-major grid[col][row]. */
export function parseBoard(rows: readonly string[]): PuyoColor[][] {
    if (rows.length > TOTAL_ROWS) throw new Error(`board has ${rows.length} rows; max ${TOTAL_ROWS}`);
    const grid: PuyoColor[][] = Array.from({ length: COLS }, () => Array(TOTAL_ROWS).fill(PuyoColor.None));
    const offset = TOTAL_ROWS - rows.length;
    rows.forEach((line, i) => {
        if (line.length !== COLS) throw new Error(`board row "${line}" must be ${COLS} characters`);
        for (let c = 0; c < COLS; c++) {
            const color = CHAR_TO_COLOR[line[c]];
            if (color === undefined) throw new Error(`unknown board character "${line[c]}"`);
            grid[c][offset + i] = color;
        }
    });
    return grid;
}

/** Format a grid back into 14 rows, top to bottom. */
export function formatBoard(grid: readonly (readonly number[])[]): string[] {
    const rows: string[] = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
        let line = '';
        for (let c = 0; c < COLS; c++) line += COLOR_TO_CHAR[grid[c][r]] ?? '?';
        rows.push(line);
    }
    return rows;
}

/** Parse "RG" into a pair. */
export function parsePair(text: string): PuyoPair {
    const main = CHAR_TO_COLOR[text[0]];
    const sub = CHAR_TO_COLOR[text[1]];
    if (text.length !== 2 || !main || !sub || main === PuyoColor.Garbage || sub === PuyoColor.Garbage) {
        throw new Error(`pair "${text}" must be two colour letters`);
    }
    return { mainColor: main, subColor: sub };
}

export function countPuyos(grid: readonly (readonly number[])[]): number {
    let n = 0;
    for (const col of grid) for (const cell of col) if (cell !== PuyoColor.None) n++;
    return n;
}
