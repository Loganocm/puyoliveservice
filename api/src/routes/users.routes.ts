import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { asyncHandler, authenticate, optionalAuth } from '../middleware/index.js';
import { prisma } from '../db/prisma.js';

const router = Router();

/**
 * GET /users/search?q=term&limit=10
 * Search users by username prefix
 */
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 25);

  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }

  const users = await prisma.user.findMany({
    where: { username: { startsWith: q, mode: 'insensitive' } },
    select: {
      id: true, username: true, elo_rating: true, level: true,
      avatar_url: true, games_played: true, games_won: true,
    },
    orderBy: { elo_rating: 'desc' },
    take: limit,
  });

  res.json({ users });
}));

/**
 * GET /users/all?limit=20&offset=0
 * List all players (including those with 0 games), newest first
 */
router.get('/all', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, username: true, elo_rating: true, level: true,
        avatar_url: true, games_played: true, games_won: true,
        created_at: true,
      },
      orderBy: [{ created_at: 'desc' }],
      take: limit,
      skip: offset,
    }),
    prisma.user.count(),
  ]);

  res.json({
    players: users.map((u, i) => ({
      ...u,
      win_rate: u.games_played > 0
        ? Math.round((u.games_won / u.games_played) * 100)
        : 0,
    })),
    pagination: {
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    },
  });
}));

/**
 * GET /users/:identifier
 * Get a user's public profile by ID or username
 */
router.get('/:identifier', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = req.params;

  // Try as numeric ID first, then as username
  let profile;
  const numericId = parseInt(identifier as string, 10);

  if (!isNaN(numericId)) {
    profile = await AuthService.getProfileById(numericId);
  } else {
    profile = await AuthService.getProfileByUsername(identifier as string);
  }

  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(profile);
}));

/**
 * POST /users/:id/avatar
 * Upload/Update user avatar
 */
router.post('/:id/avatar', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const paramId = parseInt(req.params.id as string, 10);

  // Check auth - user can only update their own avatar
  if (!req.user || req.user.id !== paramId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const { avatar } = req.body;
  if (!avatar) {
    res.status(400).json({ error: 'Avatar data required' });
    return;
  }

  // Validate image type and size
  const ALLOWED_TYPES = ['data:image/png;', 'data:image/jpeg;', 'data:image/webp;'];
  if (!ALLOWED_TYPES.some(t => avatar.startsWith(t))) {
    res.status(400).json({ error: 'Only PNG, JPEG, and WebP images are allowed' });
    return;
  }
  if (avatar.length > 150_000) { // ~100KB decoded
    res.status(400).json({ error: 'Avatar too large (max ~100KB)' });
    return;
  }

  await AuthService.updateAvatar(req.user.id, avatar);
  res.json({ success: true });
}));

/**
 * PATCH /users/:id
 * Update user profile (Username, Email, Password)
 */
router.patch('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const paramId = parseInt(req.params.id as string, 10);

  // Check auth - user can only update their own profile
  if (!req.user || req.user.id !== paramId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const { username, email } = req.body;

  if (req.body.password) {
    res.status(400).json({ error: 'Use /auth/change-password to update password' });
    return;
  }

  try {
    const result = await AuthService.updateUser(req.user.id, { username, email });
    res.json(result); // { user, token }
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}));

export default router;
