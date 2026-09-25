/**
 * The layout of the texture atlas the board is drawn from.
 *
 * Every skin, whatever its source files, is composed into this one layout,
 * so the renderer (ResourceManager, BoardView) never knows which skin it is
 * drawing. Cells are square; the pixel size is chosen per device.
 *
 *   rows 0-5   pieces: red, green, blue, yellow, purple, garbage, each in the
 *              16 neighbour combinations (bit 1 up, 2 right, 4 down, 8 left)
 *   row 6      garbage tray icons (small, big, rock, star, moon, crown), then
 *              a soft particle and a thin ring (white, tinted per use)
 *   row 7      the death-cell marker, MARKER_FRAMES frames of its loop
 *   row 8      ghosts (columns 0-4, one per colour) and junction fillers
 *              (columns 8-12), drawn over the centre of 2x2 same-colour blocks
 *
 * See website/src/content/docs/reference/skins.md.
 */

import { PuyoColor } from '@puyolive/engine';

export const ATLAS_COLUMNS = 16;
export const ATLAS_ROWS = 9;

/** Piece rows, in atlas order. */
export const ORB_ROWS: readonly number[] = [
    PuyoColor.Red, PuyoColor.Green, PuyoColor.Blue, PuyoColor.Yellow, PuyoColor.Purple, PuyoColor.Garbage,
];

export const ICON_ROW = 6;
export const ICONS = ['small', 'big', 'rock', 'star', 'moon', 'crown'] as const;
export type GarbageIcon = typeof ICONS[number];
export const PARTICLE_COLUMN = ICONS.length;
export const RING_COLUMN = ICONS.length + 1;

export const MARKER_ROW = 7;
export const MARKER_FRAMES = 12;

export const GHOST_ROW = 8;
export const JUNCTION_COLUMN = 8;

/** Neighbour bits, as used in every mask here. */
export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
