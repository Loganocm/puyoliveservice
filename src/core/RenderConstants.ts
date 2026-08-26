/**
 * Presentation constants.
 *
 * How the game LOOKS. Deliberately separate from Constants.ts, which holds the
 * rules: the server runs the rules and has no use for a sprite size or a hex
 * colour, so mixing the two would drag the renderer into the engine package.
 *
 * Only scenes should import this.
 */

/** Size of one board cell in pixels, before scene scaling. */
export const CELL_SIZE = 60;

/** Fallback tint per PuyoColor, indexed by its numeric value. Used where a
 *  sprite is unavailable; the sprite sheet is the normal path. */
export const PUYO_COLORS = [
  0x000000, // None
  0xFF0000, // Red
  0x00FF00, // Green
  0x0000FF, // Blue
  0xFFFF00, // Yellow
  0x800080, // Purple
  0x808080  // Garbage
];
