import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service.js';
import { authenticate, asyncHandler } from '../middleware/index.js';

const router = Router();

// Rate limiters for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created, please try again later' },
});

/**
 * POST /auth/register
 * Register a new user account
 */
router.post('/register', registerLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { username, password, email } = req.body;

  try {
    const result = await AuthService.register({ username, password, email });
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(400).json({ error: message });
  }
}));

/**
 * POST /auth/login
 * Login with username and password
 */
router.post('/login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const result = await AuthService.login({ username, password });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(401).json({ error: message });
  }
}));

/**
 * GET /auth/me
 * Get current authenticated user's profile
 */
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const profile = await AuthService.getProfileById(req.user!.id);

  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Include private info for own profile
  const fullProfile = {
    ...profile,
    email: req.user!.email
  };

  res.json(fullProfile);
}));

/**
 * POST /auth/change-password
 * Change the authenticated user's password
 */
router.post('/change-password', authenticate, authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new passwords are required' });
    return;
  }

  try {
    await AuthService.changePassword(req.user!.id, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password change failed';
    res.status(400).json({ error: message });
  }
}));

/**
 * POST /auth/verify
 * Verify if a token is valid
 */
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ valid: false, error: 'Token required' });
    return;
  }

  const user = await AuthService.verifyToken(token);

  if (user) {
    const profile = await AuthService.getProfileById(user.id);
    res.json({ valid: true, user: profile });
  } else {
    res.json({ valid: false });
  }
}));

/**
 * POST /auth/check
 * Check if username exists
 */
router.post('/check', asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }

  try {
    const exists = await AuthService.checkUsernameExists(username);
    res.json({ exists });
  } catch (error) {
    console.error('Check username failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}));

export default router;
