import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin, asyncHandler } from '../middleware/index.js';
import { prisma } from '../db/prisma.js';

const router = Router();

// All admin routes require authentication + admin check
router.use(authenticate, requireAdmin);

// Rate limit admin actions
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(adminLimiter);

/**
 * GET /admin/users?page=1&limit=25&search=term
 * List all users with pagination and optional search
 */
router.get('/users', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const search = (req.query.search as string || '').trim();
  const skip = (page - 1) * limit;

  const where = search.length >= 1
    ? { username: { contains: search, mode: 'insensitive' as const } }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        elo_rating: true,
        games_played: true,
        games_won: true,
        games_lost: true,
        highest_chain: true,
        total_garbage_sent: true,
        level: true,
        current_xp: true,
        is_admin: true,
        created_at: true,
      },
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, limit, totalPages: Math.ceil(total / limit) });
}));

/**
 * GET /admin/users/:id
 * Get full details for a single user
 */
router.get('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid user ID' }); return; }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      elo_rating: true,
      games_played: true,
      games_won: true,
      games_lost: true,
      highest_chain: true,
      total_garbage_sent: true,
      level: true,
      current_xp: true,
      is_admin: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
}));

/**
 * PATCH /admin/users/:id
 * Update a user's stats/profile (admin override)
 */
router.patch('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid user ID' }); return; }

  // Whitelist allowed fields — never allow password_hash or is_admin changes via this route
  const ALLOWED_FIELDS: Record<string, 'string' | 'number'> = {
    username: 'string',
    email: 'string',
    elo_rating: 'number',
    games_played: 'number',
    games_won: 'number',
    games_lost: 'number',
    highest_chain: 'number',
    total_garbage_sent: 'number',
    level: 'number',
    current_xp: 'number',
  };

  const data: Record<string, any> = {};
  for (const [key, type] of Object.entries(ALLOWED_FIELDS)) {
    if (key in req.body) {
      const val = req.body[key];
      if (typeof val !== type) {
        res.status(400).json({ error: `${key} must be a ${type}` });
        return;
      }
      if (type === 'number' && (!Number.isFinite(val) || val < 0)) {
        res.status(400).json({ error: `${key} must be a non-negative finite number` });
        return;
      }
      if (type === 'string' && typeof val === 'string' && val.length > 255) {
        res.status(400).json({ error: `${key} is too long` });
        return;
      }
      data[key] = val;
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  const updated = await prisma.user.update({ where: { id }, data });
  res.json({ success: true, user: { id: updated.id, username: updated.username } });
}));

/**
 * DELETE /admin/users/:id
 * Delete a user account and all their match records
 */
router.delete('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid user ID' }); return; }

  // Prevent deleting yourself
  if (req.user!.id === id) {
    res.status(400).json({ error: 'Cannot delete your own admin account' });
    return;
  }

  // Check user exists
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // Delete matches referencing this user first (foreign key constraints)
  await prisma.match.deleteMany({
    where: { OR: [{ player1_id: id }, { player2_id: id }, { winner_id: id }, { loser_id: id }] }
  });

  await prisma.user.delete({ where: { id } });
  res.json({ success: true, deleted: user.username });
}));

/**
 * GET /admin/audit-logs
 * List all audit logs
 */
router.get('/audit-logs', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const skip = (page - 1) * limit;

  try {
    const [logs, total] = await Promise.all([
        (prisma as any).auditLog.findMany({
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        include: { admin: { select: { username: true } } }
        }),
        (prisma as any).auditLog.count(),
    ]);
    res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch(e) { res.json({ logs: [], total: 0, page, limit, totalPages: 0 }); }
}));

/**
 * GET /admin/bans
 * List all bans
 */
router.get('/bans', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const skip = (page - 1) * limit;

  try {
    const [bans, total] = await Promise.all([
        (prisma as any).ban.findMany({
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { username: true } } }
        }),
        (prisma as any).ban.count(),
    ]);

    res.json({ bans, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch(e) { res.json({ bans: [], total: 0, page, limit, totalPages: 0 }); }
}));

/**
 * POST /admin/bans
 * Create a new ban
 */
router.post('/bans', asyncHandler(async (req: Request, res: Response) => {
  const { user_id, ip_address, reason, duration_hours } = req.body;
  if (!reason) { res.status(400).json({ error: 'Reason is required' }); return; }
  
  const expires_at = duration_hours ? new Date(Date.now() + duration_hours * 60 * 60 * 1000) : null;

  try {
    const newBan = await (prisma as any).ban.create({
        data: {
        user_id: user_id ? parseInt(user_id) : null,
        ip_address: ip_address || null,
        reason,
        banned_by: req.user!.id,
        expires_at
        }
    });

    await (prisma as any).auditLog.create({
        data: {
        admin_id: req.user!.id,
        action: 'CREATE_BAN',
        target_id: user_id ? parseInt(user_id) : null,
        target_ip: ip_address || null,
        details: { reason, duration_hours }
        }
    });

    res.json({ success: true, ban: newBan });
  } catch(e) { res.status(500).json({ error: 'Database error. Migration missing?' }); }
}));

/**
 * DELETE /admin/bans/:id
 * Remove a ban
 */
router.delete('/bans/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ban ID' }); return; }

  try {
    const ban = await (prisma as any).ban.findUnique({ where: { id } });
    if (!ban) { res.status(404).json({ error: 'Ban not found' }); return; }

    await (prisma as any).ban.delete({ where: { id } });

    await (prisma as any).auditLog.create({
        data: {
        admin_id: req.user!.id,
        action: 'REMOVE_BAN',
        target_id: ban.user_id,
        target_ip: ban.ip_address,
        details: { original_reason: ban.reason }
        }
    });

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Database error. Migration missing?' }); }
}));

/**
 * GET /admin/login-logs
 * List all login logs
 */
router.get('/login-logs', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const skip = (page - 1) * limit;

  try {
    const [logs, total] = await Promise.all([
        (prisma as any).loginLog.findMany({
        orderBy: { id: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { username: true } } }
        }),
        (prisma as any).loginLog.count(),
    ]);

    res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch(e) { res.json({ logs: [], total: 0, page, limit, totalPages: 0 }); }
}));

/**
 * GET /admin/stats
 * Dashboard statistics
 */
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [totalUsers, totalMatches, recentUsers, recentMatches] = await Promise.all([
    prisma.user.count(),
    prisma.match.count(),
    prisma.user.count({ where: { created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.match.count({ where: { ended_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);

  res.json({ totalUsers, totalMatches, recentUsers, recentMatches });
}));

export default router;
