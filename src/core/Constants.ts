export const COLS = 6;
export const ROWS = 12;
export const HIDDEN_ROWS = 2; // Increased to 2 for better buffer/spawn mechanics
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS;
export const CELL_SIZE = 60;

export const PuyoColor = {
  None: 0,
  Red: 1,
  Green: 2,
  Blue: 3,
  Yellow: 4,
  Purple: 5,
  Garbage: 6
} as const;

export type PuyoColor = typeof PuyoColor[keyof typeof PuyoColor];

export const PUYO_COLORS = [
  0x000000, // None
  0xFF0000, // Red
  0x00FF00, // Green
  0x0000FF, // Blue
  0xFFFF00, // Yellow
  0x800080, // Purple
  0x808080  // Garbage
];
