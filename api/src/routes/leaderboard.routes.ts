import { Router, Request, Response } from 'express';
import { LeaderboardService } from '../services/leaderboard.service.js';
import { asyncHandler, optionalAuth } from '../middleware/index.js';

const router = Router();

/**
 * GET /leaderboard
 * Get the top players leaderboard
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const [players, total] = await Promise.all([
    LeaderboardService.getTopPlayers(limit, offset),
    LeaderboardService.getRankedPlayerCount()
  ]);

  res.json({
    leaderboard: players,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + players.length < total
    }
  });
}));

/**
 * GET /leaderboard/around/:userId
 * Get players around a specific user's rank
 */
router.get('/around/:userId', asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string, 10);
  const range = Math.min(parseInt(req.query.range as string) || 5, 10);

  if (isNaN(userId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const players = await LeaderboardService.getPlayersAround(userId, range);
  const rank = await LeaderboardService.getPlayerRank(userId);

  res.json({
    current_user_rank: rank,
    players
  });
}));

/**
 * GET /leaderboard/rank/:userId
 * Get a specific user's rank
 */
router.get('/rank/:userId', asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string, 10);

  if (isNaN(userId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const rank = await LeaderboardService.getPlayerRank(userId);

  if (rank === null) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user_id: userId, rank });
}));

/**
 * GET /leaderboard/stats
 * Get global statistics
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await LeaderboardService.getStats();
  res.json(stats);
}));

/**
 * GET /leaderboard/me
 * Get current user's rank and surrounding players
 */
router.get('/me', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const range = Math.min(parseInt(req.query.range as string) || 5, 10);

  const [rank, players] = await Promise.all([
    LeaderboardService.getPlayerRank(req.user.id),
    LeaderboardService.getPlayersAround(req.user.id, range)
  ]);

  res.json({
    my_rank: rank,
    players
  });
}));

export default router;
