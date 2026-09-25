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

/*
 * Match layout, in the scenes' 1000 x 1000 base coordinates (SceneManager
 * scales that box to fit the window). A piece spawns four rows above the
 * visible board (the two hidden rows, then two more of open sky), so the
 * board sits low enough for all of that to be on screen.
 */

/** Left edge of the player's board: centred in the base width. */
export const BOARD_LEFT = (1000 - 6 * CELL_SIZE) / 2;
/** Top edge of the player's visible board: four rows of spawn space above it. */
export const BOARD_TOP = 4 * CELL_SIZE + 10;
/** Space between the board and the panels either side of it. */
export const SIDE_GAP = 28;
/** Size of the opponent's board relative to the player's. */
export const OPPONENT_SCALE = 0.42;
