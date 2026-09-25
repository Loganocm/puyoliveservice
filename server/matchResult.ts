/**
 * What each player is told when their ranked match has been recorded.
 *
 * The API computes both players' progression when it records a match; the
 * game server forwards each player their own half as `match_result`, which
 * the client uses to show "XP +N" on the results screen and to update the
 * level, XP and rating in the menu without a reload (NET-14).
 */

export interface PlayerProgress {
  level: number;
  xp: number;
  xp_gained: number;
  elo_change: number;
  new_elo: number;
}

/** The API's response to recording a match (POST /api/matches). */
export interface RecordedMatch {
  id: number;
  player1_elo_after: number;
  player2_elo_after: number;
  elo_change: number;
  player1_stats?: PlayerProgress;
  player2_stats?: PlayerProgress;
}

/** The `match_result` socket event, as the client's GameEvents map declares it. */
export interface MatchResultEvent {
  matchId: number;
  result: 'win' | 'loss';
  xp_gained: number;
  new_level: number;
  new_xp: number;
  elo_change: number;
  new_elo: number;
}

/** The event for the winner and for the loser, or null if the API sent no progression. */
export function matchResultEvents(match: RecordedMatch, player1Won: boolean): { winner: MatchResultEvent; loser: MatchResultEvent } | null {
  if (!match.player1_stats || !match.player2_stats) return null;
  const event = (stats: PlayerProgress, result: 'win' | 'loss'): MatchResultEvent => ({
    matchId: match.id,
    result,
    xp_gained: stats.xp_gained,
    new_level: stats.level,
    new_xp: stats.xp,
    elo_change: stats.elo_change,
    new_elo: stats.new_elo,
  });
  const [winnerStats, loserStats] = player1Won ? [match.player1_stats, match.player2_stats] : [match.player2_stats, match.player1_stats];
  return { winner: event(winnerStats, 'win'), loser: event(loserStats, 'loss') };
}
