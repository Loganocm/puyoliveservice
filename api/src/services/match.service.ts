import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { XpService } from './xp.service.js';
import type {
  Match,
  CreateMatchInput,
  MatchHistoryEntry,
  EloCalculation,
  MatchRecordResult
} from '../types/match.js';
import type { User } from '../types/user.js';
import { Prisma } from '@prisma/client';

export class MatchService {
  /**
   * Calculate new ELO ratings based on match outcome
   * Uses standard ELO formula with configurable K-factor
   */
  static calculateElo(winnerElo: number, loserElo: number): EloCalculation {
    const { kFactor, minRating } = config.elo;

    // Calculate expected scores
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 - expectedWinner;

    // Calculate new ratings
    const winnerChange = Math.round(kFactor * (1 - expectedWinner));
    // const loserChange = Math.round(kFactor * (0 - expectedLoser)); // This is usually negative of winnerChange

    const winnerNewElo = winnerElo + winnerChange;
    // Standard Elo: Loser drops by same amount, but clamped to minRating
    const loserNewElo = Math.max(loserElo - winnerChange, minRating);

    return {
      winner_new_elo: winnerNewElo,
      loser_new_elo: loserNewElo,
      elo_change: Math.abs(winnerChange)
    };
  }

  /**
   * Record a match result and update player ELOs
   * Uses a transaction to ensure consistency
   */
  static async recordMatch(input: CreateMatchInput): Promise<MatchRecordResult> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get current player ratings
      const player1 = await tx.user.findUnique({ where: { id: input.player1_id } });
      const player2 = await tx.user.findUnique({ where: { id: input.player2_id } });

      if (!player1 || !player2) {
        throw new Error('One or both players not found');
      }

      // Determine winner and loser objects
      const isPlayer1Winner = input.winner_id === input.player1_id;
      const winner = isPlayer1Winner ? player1 : player2;
      const loser = isPlayer1Winner ? player2 : player1;

      const isRanked = input.is_ranked !== false; // Default to true if undefined

      // Calculate new ELO ratings (only if ranked)
      let eloResult: EloCalculation;
      if (isRanked) {
        eloResult = this.calculateElo(winner.elo_rating, loser.elo_rating);
      } else {
        eloResult = {
          winner_new_elo: winner.elo_rating,
          loser_new_elo: loser.elo_rating,
          elo_change: 0
        };
      }

      // Calculate XP for both players
      // For multiplayer, we use isPlayer1Winner logic
      const p1IsWinner = isPlayer1Winner;
      const p2IsWinner = !isPlayer1Winner;

      const xp1 = XpService.calculateMultiplayerXp({
        isWinner: p1IsWinner,
        durationSeconds: input.duration_seconds || 0
      });

      const xp2 = XpService.calculateMultiplayerXp({
        isWinner: p2IsWinner,
        durationSeconds: input.duration_seconds || 0
      });

      const p1Progression = XpService.calculateProgress(player1.level || 1, player1.current_xp || 0, xp1);
      const p2Progression = XpService.calculateProgress(player2.level || 1, player2.current_xp || 0, xp2);

      const player1EloBefore = player1.elo_rating;
      const player2EloBefore = player2.elo_rating;
      const player1EloAfter = isPlayer1Winner ? eloResult.winner_new_elo : eloResult.loser_new_elo;
      const player2EloAfter = isPlayer1Winner ? eloResult.loser_new_elo : eloResult.winner_new_elo;

      // Update winner stats
      await tx.user.update({
        where: { id: winner.id },
        data: {
          elo_rating: eloResult.winner_new_elo,
          games_played: { increment: 1 },
          games_won: { increment: 1 },
          highest_chain: { set: Math.max(winner.highest_chain, isPlayer1Winner ? (input.player1_max_chain || 0) : (input.player2_max_chain || 0)) },
          total_garbage_sent: { increment: isPlayer1Winner ? (input.player1_garbage_sent || 0) : (input.player2_garbage_sent || 0) },
          level: isPlayer1Winner ? p1Progression.level : p2Progression.level,
          current_xp: isPlayer1Winner ? p1Progression.xp : p2Progression.xp
        }
      });

      // Update loser stats
      await tx.user.update({
        where: { id: loser.id },
        data: {
          elo_rating: eloResult.loser_new_elo,
          games_played: { increment: 1 },
          games_lost: { increment: 1 },
          highest_chain: { set: Math.max(loser.highest_chain, isPlayer1Winner ? (input.player2_max_chain || 0) : (input.player1_max_chain || 0)) },
          total_garbage_sent: { increment: isPlayer1Winner ? (input.player2_garbage_sent || 0) : (input.player1_garbage_sent || 0) },
          level: !isPlayer1Winner ? p1Progression.level : p2Progression.level,
          current_xp: !isPlayer1Winner ? p1Progression.xp : p2Progression.xp
        }
      });

      // Insert match record
      const match = await tx.match.create({
        data: {
          player1_id: input.player1_id,
          player2_id: input.player2_id,
          winner_id: input.winner_id,
          loser_id: loser.id,
          player1_elo_before: player1EloBefore,
          player2_elo_before: player2EloBefore,
          player1_elo_after: player1EloAfter,
          player2_elo_after: player2EloAfter,
          elo_change: eloResult.elo_change,
          duration_seconds: input.duration_seconds || null,
          player1_max_chain: input.player1_max_chain || 0,
          player2_max_chain: input.player2_max_chain || 0,
          player1_garbage_sent: input.player1_garbage_sent || 0,
          player2_garbage_sent: input.player2_garbage_sent || 0,
          room_id: input.room_id || null,
          is_ranked: isRanked,
          started_at: input.started_at || null,
          replay_data: input.replay_data || undefined
        }
      });

      return {
        match: match as unknown as Match,
        player1_stats: {
          level: p1Progression.level,
          xp: p1Progression.xp,
          xp_gained: xp1,
          elo_change: isPlayer1Winner ? eloResult.elo_change : -eloResult.elo_change,
          new_elo: player1EloAfter
        },
        player2_stats: {
          level: p2Progression.level,
          xp: p2Progression.xp,
          xp_gained: xp2,
          elo_change: isPlayer1Winner ? -eloResult.elo_change : eloResult.elo_change,
          new_elo: player2EloAfter
        }
      };
    });
  }

  /**
   * Get match by ID
   */
  static async getMatchById(matchId: number): Promise<Match | null> {
    const match = await prisma.match.findUnique({
      where: { id: matchId }
    });
    return (match as unknown as Match) || null;
  }

  /**
   * Get match history for a user
   */
  static async getMatchHistory(
    userId: number,
    limit: number = 20,
    offset: number = 0
  ): Promise<MatchHistoryEntry[]> {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { player1_id: userId },
          { player2_id: userId }
        ]
      },
      include: {
        player1: { select: { username: true } },
        player2: { select: { username: true } }
      },
      orderBy: { ended_at: 'desc' },
      take: limit,
      skip: offset
    });

    const total = await this.getMatchCount(userId); // Not strictly needed for the array return but often useful

    return matches.map((m: any) => {
      const isPlayer1 = m.player1_id === userId;
      const opponentId = isPlayer1 ? m.player2_id : m.player1_id;
      // We included player1/player2 relations to get usernames
      // Prisma types here will have player1/player2 as objects
      // We cast to any to avoid strict type gymnastics for now if types aren't perfectly aligned
      const opponentUsername = isPlayer1 ? (m as any).player2.username : (m as any).player1.username;

      const isWinner = m.winner_id === userId;

      // Check if replay_data exists and is a valid V2 replay
      const rd = m.replay_data;
      const has_valid_replay = !!(
        rd &&
        rd.version === 2 &&
        Array.isArray(rd.inputs) &&
        rd.inputs.length > 0 &&
        Number.isFinite(rd.seed) &&
        Number.isFinite(rd.fps) &&
        Number.isFinite(rd.duration) &&
        rd.duration > 0 &&
        Array.isArray(rd.players) &&
        rd.players.length >= 2
      );

      return {
        id: m.id,
        opponent_username: opponentUsername,
        opponent_id: opponentId,
        result: isWinner ? 'win' : 'loss',
        elo_before: isPlayer1 ? m.player1_elo_before : m.player2_elo_before,
        elo_after: isPlayer1 ? m.player1_elo_after : m.player2_elo_after,
        // Calculate actual change from stored values to handle asymmetric updates (inflationary system)
        elo_change: isPlayer1
          ? (m.player1_elo_after - m.player1_elo_before)
          : (m.player2_elo_after - m.player2_elo_before),
        my_max_chain: isPlayer1 ? m.player1_max_chain : m.player2_max_chain,
        opponent_max_chain: isPlayer1 ? m.player2_max_chain : m.player1_max_chain,
        my_garbage_sent: isPlayer1 ? m.player1_garbage_sent : m.player2_garbage_sent,
        opponent_garbage_sent: isPlayer1 ? m.player2_garbage_sent : m.player1_garbage_sent,
        duration_seconds: m.duration_seconds,
        ended_at: m.ended_at,
        has_valid_replay
      };
    });
  }

  /**
   * Get total match count for a user
   */
  static async getMatchCount(userId: number): Promise<number> {
    return prisma.match.count({
      where: {
        OR: [
          { player1_id: userId },
          { player2_id: userId }
        ]
      }
    });
  }

  /**
   * Get recent matches (for global activity feed)
   */
  static async getRecentMatches(limit: number = 10) {
    const matches = await prisma.match.findMany({
      where: { is_ranked: true },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } }
      },
      orderBy: { ended_at: 'desc' },
      take: limit
    });
    return matches.map((m: any) => {
      const rd = m.replay_data;
      const has_valid_replay = !!(
        rd &&
        rd.version === 2 &&
        Array.isArray(rd.inputs) &&
        rd.inputs.length > 0 &&
        Number.isFinite(rd.seed) &&
        Number.isFinite(rd.fps) &&
        Number.isFinite(rd.duration) &&
        rd.duration > 0 &&
        Array.isArray(rd.players) &&
        rd.players.length >= 2
      );
      return {
        id: m.id,
        winner_id: m.winner_id,
        player1: m.player1,
        player2: m.player2,
        player1_max_chain: m.player1_max_chain,
        player2_max_chain: m.player2_max_chain,
        duration_seconds: m.duration_seconds,
        ended_at: m.ended_at,
        elo_change: m.player1_elo_after - m.player1_elo_before,
        has_valid_replay
      };
    });
  }
}
