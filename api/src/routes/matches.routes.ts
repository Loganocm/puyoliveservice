import { Router, Request, Response } from 'express';
import { MatchService } from '../services/match.service.js';
import { authenticate, asyncHandler } from '../middleware/index.js';

const router = Router();

/**
 * POST /matches
 * Record a new match result (internal/server use)
 * Requires authentication (server-to-server should use a service token)
 */
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const {
    player1_id,
    player2_id,
    winner_id,
    room_id,
    duration_seconds,
    player1_max_chain,
    player2_max_chain,
    player1_garbage_sent,
    player2_garbage_sent,
    started_at,
    is_ranked,
    replay_data
  } = req.body;

  // Validate required fields
  if (!player1_id || !player2_id || !winner_id) {
    res.status(400).json({
      error: 'player1_id, player2_id, and winner_id are required'
    });
    return;
  }

  // Validate winner is one of the players
  if (winner_id !== player1_id && winner_id !== player2_id) {
    res.status(400).json({
      error: 'winner_id must be either player1_id or player2_id'
    });
    return;
  }

  try {
    const match = await MatchService.recordMatch({
      player1_id,
      player2_id,
      winner_id,
      room_id,
      duration_seconds,
      player1_max_chain,
      player2_max_chain,
      player1_garbage_sent,
      player2_garbage_sent,
      started_at: started_at ? new Date(started_at) : undefined,
      is_ranked,
      replay_data
    });

    res.status(201).json(match);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record match';
    res.status(400).json({ error: message });
  }
}));

/**
 * GET /matches/:id
 * Get a specific match by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.id as string, 10);

  if (isNaN(matchId)) {
    res.status(400).json({ error: 'Invalid match ID' });
    return;
  }

  const match = await MatchService.getMatchById(matchId);

  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  res.json(match);
}));

/**
 * GET /matches/:id/replay
 * Get replay data for a match
 */
router.get('/:id/replay', asyncHandler(async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.id as string, 10);
  if (isNaN(matchId)) {
    res.status(400).json({ error: 'Invalid match ID' });
    return;
  }

  const match = await MatchService.getMatchById(matchId);
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  // Cast because Match interface might not expose replay_data properly yet vs Prisma type
  const replayData = (match as any).replay_data;

  if (!replayData) {
    res.status(404).json({ error: 'No replay data found for this match' });
    return;
  }

  res.json(replayData);
}));

/**
 * GET /matches/user/:userId
 * Get match history for a specific user
 */
router.get('/user/:userId', asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string, 10);
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  if (isNaN(userId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const [history, total] = await Promise.all([
    MatchService.getMatchHistory(userId, limit, offset),
    MatchService.getMatchCount(userId)
  ]);

  res.json({
    matches: history,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + history.length < total
    }
  });
}));

/**
 * GET /matches/recent
 * Get recent matches (global activity)
 */
router.get('/recent/all', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

  const matches = await MatchService.getRecentMatches(limit);

  res.json(matches);
}));

export default router;
