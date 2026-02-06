// Match-related types
export interface Match {
  id: number;
  player1_id: number | null;
  player2_id: number | null;
  winner_id: number | null;
  loser_id: number | null;
  player1_elo_before: number;
  player2_elo_before: number;
  player1_elo_after: number;
  player2_elo_after: number;
  elo_change: number;
  duration_seconds: number | null;
  player1_max_chain: number;
  player2_max_chain: number;
  player1_garbage_sent: number;
  player2_garbage_sent: number;
  room_id: string | null;
  is_ranked: boolean;
  started_at: Date | null;
  ended_at: Date;
}

// Match creation input (from game server)
export interface CreateMatchInput {
  player1_id: number;
  player2_id: number;
  winner_id: number;
  room_id?: string;
  duration_seconds?: number;
  player1_max_chain?: number;
  player2_max_chain?: number;
  player1_garbage_sent?: number;
  player2_garbage_sent?: number;
  started_at?: Date;
  is_ranked?: boolean;
  replay_data?: any;
}

// Match history response with player info
export interface MatchHistoryEntry {
  id: number;
  opponent_username: string;
  opponent_id: number;
  result: 'win' | 'loss';
  elo_before: number;
  elo_after: number;
  elo_change: number;
  my_max_chain: number;
  opponent_max_chain: number;
  my_garbage_sent: number;
  opponent_garbage_sent: number;
  duration_seconds: number | null;
  ended_at: Date;
}

// ELO calculation result
export interface EloCalculation {
  winner_new_elo: number;
  loser_new_elo: number;
  elo_change: number;
}

export interface PlayerMatchStats {
  level: number;
  xp: number;
  xp_gained: number;
  elo_change: number;
  new_elo: number;
}

export interface MatchRecordResult {
  match: Match;
  player1_stats: PlayerMatchStats;
  player2_stats: PlayerMatchStats;
}
