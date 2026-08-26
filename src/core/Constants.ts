/**
 * Simulation constants.
 *
 * Everything here is part of the game's RULES and belongs in the engine
 * package when the client and server engines are unified. Nothing in this file
 * may reference the DOM, a renderer, or a pixel.
 *
 * Values that describe how the game LOOKS live in RenderConstants.ts. Keeping
 * them apart is what makes the engine extractable: a rule and a sprite size
 * were sitting in the same file, and only one of them belongs on the server.
 *
 * See README "Vocabulary" -> Board.
 */

/** Playfield width in columns. */
export const COLS = 6;

/** Visible playfield height in rows. */
export const ROWS = 12;

/**
 * Rows above the visible board. Pieces spawn here and may be manoeuvred
 * through it, but a piece that LOCKS above row 0 is a top-out.
 */
export const HIDDEN_ROWS = 2;

/** Total addressable rows. A larger row index is LOWER on the board. */
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

/**
 * Cell contents. Declared as a const object rather than a TypeScript enum
 * because the compiler runs with `erasableSyntaxOnly`, which forbids syntax
 * that emits runtime code.
 */
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
