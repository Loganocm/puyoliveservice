import { prisma } from '../db/prisma.js';
import type { LeaderboardEntry } from '../types/user.js';
import { Prisma } from '@prisma/client';

export class LeaderboardService {
  /**
   * Get the top players by ELO rating
   */
  static async getTopPlayers(limit: number = 50, offset: number = 0): Promise<LeaderboardEntry[]> {
    const users = await prisma.user.findMany({
      where: {
        games_played: { gt: 0 }
      },
      orderBy: [
        { elo_rating: 'desc' },
        { games_won: 'desc' }
      ],
      take: limit,
      skip: offset
    });

    return users.map((user: any, index: number) => ({
      rank: offset + index + 1,
      id: user.id,
      username: user.username,
      elo_rating: user.elo_rating,
      games_played: user.games_played,
      games_won: user.games_won,
      win_rate: user.games_played > 0
        ? Math.round((user.games_won / user.games_played) * 100)
        : 0
    }));
  }

  /**
   * Get total number of ranked players
   */
  static async getRankedPlayerCount(): Promise<number> {
    return prisma.user.count({
      where: { games_played: { gt: 0 } }
    });
  }

  /**
   * Get a player's rank
   */
  static async getPlayerRank(userId: number): Promise<number | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { elo_rating: true }
    });

    if (!user) return null;

    const higherEloCount = await prisma.user.count({
      where: {
        elo_rating: { gt: user.elo_rating },
        games_played: { gt: 0 }
      }
    });

    return higherEloCount + 1;
  }

  /**
   * Get players around a specific user (for context)
   */
  static async getPlayersAround(userId: number, range: number = 5): Promise<LeaderboardEntry[]> {
    // First get user's rank
    const rank = await this.getPlayerRank(userId);
    if (rank === null) return [];

    // Calculate offset to show players around this user
    const offset = Math.max(0, rank - range - 1);
    const limit = range * 2 + 1;

    return this.getTopPlayers(limit, offset);
  }

  /**
   * Get statistics summary
   */
  static async getStats(): Promise<{
    total_players: number;
    total_matches: number;
    matches_today: number;
    average_elo: number;
  }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalPlayers, totalMatches, matchesToday, avgEloResult] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.match.count({
        where: { ended_at: { gt: twentyFourHoursAgo } }
      }),
      prisma.user.aggregate({
        _avg: { elo_rating: true },
        where: { games_played: { gt: 0 } }
      })
    ]);

    return {
      total_players: totalPlayers,
      total_matches: totalMatches,
      matches_today: matchesToday,
      average_elo: Math.round(avgEloResult._avg.elo_rating || 1000)
    };
  }

  /**
   * Get a user's percentile rankings for various stats.
   * Returns "Top X%" for each stat (lower = better).
   */
  static async getUserPercentiles(userId: number): Promise<{
    elo_percentile: number;
    win_rate_percentile: number;
    chain_percentile: number;
    garbage_percentile: number;
    games_percentile: number;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        elo_rating: true,
        games_played: true,
        games_won: true,
        highest_chain: true,
        total_garbage_sent: true,
      }
    });

    if (!user || user.games_played === 0) return null;

    const totalRanked = await prisma.user.count({
      where: { games_played: { gt: 0 } }
    });

    if (totalRanked === 0) return null;

    // Count how many players are above this user for each stat
    const [aboveElo, aboveChain, aboveGarbage, aboveGames] = await Promise.all([
      prisma.user.count({
        where: { games_played: { gt: 0 }, elo_rating: { gt: user.elo_rating } }
      }),
      prisma.user.count({
        where: { games_played: { gt: 0 }, highest_chain: { gt: user.highest_chain } }
      }),
      prisma.user.count({
        where: { games_played: { gt: 0 }, total_garbage_sent: { gt: user.total_garbage_sent } }
      }),
      prisma.user.count({
        where: { games_played: { gt: user.games_played } }
      }),
    ]);

    // Win rate percentile: count users with better win rate
    // We need a raw query for computed win rate comparison
    const userWinRate = user.games_won / user.games_played;
    const aboveWinRate: [{count: bigint}] = await prisma.$queryRaw(
      Prisma.sql`SELECT COUNT(*) as count FROM users WHERE games_played > 0 AND (CAST(games_won AS FLOAT) / CAST(games_played AS FLOAT)) > ${userWinRate}`
    );

    const toPercentile = (above: number) =>
      Math.max(1, Math.round(((above + 1) / totalRanked) * 100));

    return {
      elo_percentile: toPercentile(aboveElo),
      win_rate_percentile: toPercentile(Number(aboveWinRate[0].count)),
      chain_percentile: toPercentile(aboveChain),
      garbage_percentile: toPercentile(aboveGarbage),
      games_percentile: toPercentile(aboveGames),
    };
  }
}
