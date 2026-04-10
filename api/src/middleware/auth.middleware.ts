import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config/index.js';
import type { User } from '../types/user.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate requests via JWT Bearer token
 */
export async function authenticate(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer '
  
  try {
    const user = await AuthService.verifyToken(token);
    
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export async function optionalAuth(
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const user = await AuthService.verifyToken(token);
      if (user) {
        req.user = user;
      }
    } catch {
      // Ignore invalid tokens in optional auth
    }
  }
  
  next();
}

/**
 * Internal-only middleware — requires a valid X-Internal-Key header.
 * Used for server-to-server endpoints (e.g., match recording from game server).
 * This key is NOT a user JWT — it's a shared secret only the game server knows.
 */
export async function internalOnly(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const key = req.headers['x-internal-key'];

  if (!key || typeof key !== 'string') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const expected = config.internalApiKey;
  if (key.length !== expected.length) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { timingSafeEqual } = await import('crypto');
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

/**
 * Admin-only middleware — must be chained AFTER authenticate.
 * Checks that req.user.is_admin is true.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || !(req.user as any).is_admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
