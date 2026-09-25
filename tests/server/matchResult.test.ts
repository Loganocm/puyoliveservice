import { describe, it, expect } from 'vitest';
import { matchResultEvents } from '../../server/matchResult';
import type { RecordedMatch } from '../../server/matchResult';

/**
 * NET-14: players were never told their XP after a ranked match. The API
 * computed it and dropped it; the game server now forwards each player
 * their own progression as `match_result`.
 */
const match: RecordedMatch = {
    id: 7, player1_elo_after: 1016, player2_elo_after: 984, elo_change: 16,
    player1_stats: { level: 3, xp: 40, xp_gained: 55, elo_change: 16, new_elo: 1016 },
    player2_stats: { level: 2, xp: 90, xp_gained: 20, elo_change: -16, new_elo: 984 },
};

describe('matchResultEvents', () => {
    it('gives the winner and the loser their own progression', () => {
        const events = matchResultEvents(match, true)!;
        expect(events.winner).toEqual({ matchId: 7, result: 'win', xp_gained: 55, new_level: 3, new_xp: 40, elo_change: 16, new_elo: 1016 });
        expect(events.loser).toEqual({ matchId: 7, result: 'loss', xp_gained: 20, new_level: 2, new_xp: 90, elo_change: -16, new_elo: 984 });
    });

    it('follows the winner when player 2 wins', () => {
        const events = matchResultEvents(match, false)!;
        expect(events.winner.new_elo).toBe(984);
        expect(events.loser.new_elo).toBe(1016);
    });

    it('sends nothing when the API returned no progression', () => {
        const { player1_stats: _a, player2_stats: _b, ...bare } = match;
        expect(matchResultEvents(bare, true)).toBeNull();
    });
});
