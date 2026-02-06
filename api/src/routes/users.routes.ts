import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { asyncHandler, optionalAuth } from '../middleware/index.js';

const router = Router();

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
router.post('/:id/avatar', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
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

  // Basic validation for Base64 image
  if (!avatar.startsWith('data:image/')) {
    res.status(400).json({ error: 'Invalid image specificiation' });
    return;
  }

  await AuthService.updateAvatar(req.user.id, avatar);
  res.json({ success: true });
}));

/**
 * PATCH /users/:id
 * Update user profile (Username, Email, Password)
 */
router.patch('/:id', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const paramId = parseInt(req.params.id as string, 10);

  // Check auth - user can only update their own profile
  if (!req.user || req.user.id !== paramId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const { username, email, password } = req.body;

  // Basic empty check? AuthService handles validatin, but we should pass only defaults
  try {
    const result = await AuthService.updateUser(req.user.id, { username, email, password });
    res.json(result); // { user, token }
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
}));

export default router;
