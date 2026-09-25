/**
 * The board a Puyo Mines player is attacking, for their target view.
 *
 * Kept free of the MinesRoom singleton so it can be tested alone. The client
 * always listened for `mines_target_board` and the server never sent it, so
 * the target view stayed empty (NET-15).
 */

interface TargetingPlayer {
  currentTarget: string | null;
  board: number[][] | null;
}

export function targetBoardOf(
  players: ReadonlyMap<string, TargetingPlayer>,
  socketId: string,
): { socketId: string; grid: number[][] } | null {
  const targetId = players.get(socketId)?.currentTarget;
  if (!targetId || targetId === socketId) return null;
  const grid = players.get(targetId)?.board;
  return grid ? { socketId: targetId, grid } : null;
}
