import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import type { User, UserProfile, CreateUserInput, LoginInput, AuthResponse } from '../types/user.js';
import { Prisma } from '@prisma/client';

const SALT_ROUNDS = 12;

// Validation constants
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

// ── Per-account progressive lockout ──
const LOGIN_MAX_ATTEMPTS = 5;          // Lock after 5 failures
const LOGIN_LOCKOUT_BASE_MS = 60_000;  // 1 minute initial lockout
const LOGIN_LOCKOUT_MAX_MS = 30 * 60_000; // 30 min max lockout

interface LoginAttemptInfo {
  failures: number;
  lockedUntil: number; // epoch ms
}

const loginAttempts = new Map<string, LoginAttemptInfo>();

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, info] of loginAttempts) {
    if (info.lockedUntil < now && info.failures === 0) {
      loginAttempts.delete(key);
    }
  }
}, 10 * 60_000);

function getAccountLockKey(username: string): string {
  return username.toLowerCase().trim();
}

function checkAccountLock(username: string): { locked: boolean; retryAfterMs?: number } {
  const key = getAccountLockKey(username);
  const info = loginAttempts.get(key);
  if (!info) return { locked: false };
  const now = Date.now();
  if (info.lockedUntil > now) {
    return { locked: true, retryAfterMs: info.lockedUntil - now };
  }
  return { locked: false };
}

function recordLoginFailure(username: string): void {
  const key = getAccountLockKey(username);
  const info = loginAttempts.get(key) || { failures: 0, lockedUntil: 0 };
  info.failures++;
  if (info.failures >= LOGIN_MAX_ATTEMPTS) {
    // Exponential backoff: 1m, 2m, 4m, 8m, 16m, capped at 30m
    const lockMs = Math.min(
      LOGIN_LOCKOUT_BASE_MS * Math.pow(2, info.failures - LOGIN_MAX_ATTEMPTS),
      LOGIN_LOCKOUT_MAX_MS
    );
    info.lockedUntil = Date.now() + lockMs;
  }
  loginAttempts.set(key, info);
}

function clearLoginFailures(username: string): void {
  loginAttempts.delete(getAccountLockKey(username));
}

export class AuthService {
  /**
   * Validate username format
   */
  static validateUsername(username: string): { valid: boolean; error?: string } {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();

    if (trimmed.length < USERNAME_MIN_LENGTH) {
      return { valid: false, error: `Username must be at least ${USERNAME_MIN_LENGTH} characters` };
    }

    if (trimmed.length > USERNAME_MAX_LENGTH) {
      return { valid: false, error: `Username must be at most ${USERNAME_MAX_LENGTH} characters` };
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    return { valid: true };
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      return { valid: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` };
    }

    // Check for at least one letter and one number
    if (!/[a-zA-Z]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one letter' };
    }

    if (!/[0-9]/.test(password)) {
      return { valid: false, error: 'Password must contain at least one number' };
    }

    return { valid: true };
  }

  /**
   * Register a new user
   */
  static async register(input: CreateUserInput): Promise<AuthResponse> {
    // Validate username
    const usernameValidation = this.validateUsername(input.username);
    if (!usernameValidation.valid) {
      throw new Error(usernameValidation.error);
    }

    // Validate password
    const passwordValidation = this.validatePassword(input.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.error);
    }

    const username = input.username.trim();

    // Check if username exists (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: {
        username: {
          mode: 'insensitive',
          equals: username
        }
      }
    });

    if (existing) {
      throw new Error('Username already exists');
    }

    // Hash password
    // Validate email if provided
    if (input.email && !EMAIL_REGEX.test(input.email)) {
      throw new Error('Invalid email format');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        password_hash: passwordHash,
        email: (input.email || undefined) as any,
        elo_rating: config.elo.defaultRating,
      }
    });

    const profile = this.toProfile(user as unknown as User);
    const token = this.generateToken(user as unknown as User);

    return { user: profile, token };
  }

  /**
   * Check if username exists
   */
  static async checkUsernameExists(username: string): Promise<boolean> {
    const user = await prisma.user.findFirst({
      where: {
        username: {
          mode: 'insensitive',
          equals: username.trim()
        }
      }
    });
    return !!user;
  }

  /**
   * Login with username and password
   */
  static async login(input: LoginInput): Promise<AuthResponse> {
    if (!input.username || !input.password) {
      throw new Error('Username and password are required');
    }

    // Check account lockout BEFORE doing any database work
    const lockStatus = checkAccountLock(input.username);
    if (lockStatus.locked) {
      const retrySeconds = Math.ceil((lockStatus.retryAfterMs || 0) / 1000);
      throw new Error(`Account temporarily locked. Try again in ${retrySeconds} seconds`);
    }

    // Find user by username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        username: {
          mode: 'insensitive',
          equals: input.username.trim()
        }
      }
    });

    if (!user) {
      // Record failure even for non-existent users (prevents username enumeration via timing)
      recordLoginFailure(input.username);
      throw new Error('Invalid username or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) {
      recordLoginFailure(input.username);
      throw new Error('Invalid username or password');
    }

    // Success — clear lockout state
    clearLoginFailures(input.username);

    const profile = this.toProfile(user as unknown as User);
    const token = this.generateToken(user as unknown as User);

    return { user: profile, token };
  }

  /**
   * Get user by ID
   */
  static async getUserById(id: number): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    return (user as unknown as User) || null;
  }

  /**
   * Get user profile by ID
   */
  static async getProfileById(id: number): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) return null;

    // Get rank efficiently
    const rank = await prisma.user.count({
      where: {
        elo_rating: {
          gt: user.elo_rating
        }
      }
    }) + 1;

    return this.toProfile(user as unknown as User, rank);
  }

  /**
   * Get user profile by username
   */
  static async getProfileByUsername(username: string): Promise<UserProfile | null> {
    const user = await prisma.user.findFirst({
      where: {
        username: {
          mode: 'insensitive',
          equals: username.trim()
        }
      }
    });

    if (!user) return null;

    const rank = await prisma.user.count({
      where: {
        elo_rating: {
          gt: user.elo_rating
        }
      }
    }) + 1;

    return this.toProfile(user as unknown as User, rank);
  }

  /**
   * Verify JWT token and return user
   * Accepts both HS512 (new) and HS256 (legacy) tokens for backward compatibility.
   * New tokens are always signed with HS512. Old HS256 tokens will expire naturally.
   */
  static async verifyToken(token: string): Promise<User | null> {
    try {
      const payload = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS512', 'HS256'],
      }) as { userId: number };
      return this.getUserById(payload.userId);
    } catch {
      return null;
    }
  }

  /**
   * Generate JWT token for user
   */
  static generateToken(user: User): string {
    return jwt.sign(
      { userId: user.id, username: user.username },
      config.jwt.secret,
      {
        algorithm: config.jwt.algorithm,
        expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
      }
    );
  }

  /**
   * Convert User to UserProfile (strips sensitive data)
   */
  static toProfile(user: User, rank?: number): UserProfile {
    const winRate = user.games_played > 0
      ? Math.round((user.games_won / user.games_played) * 100)
      : 0;

    return {
      id: user.id,
      username: user.username,
      elo_rating: user.elo_rating,
      games_played: user.games_played,
      games_won: user.games_won,
      games_lost: user.games_lost,
      highest_chain: user.highest_chain,
      total_garbage_sent: user.total_garbage_sent,
      created_at: user.created_at,
      rank,
      win_rate: winRate,
      avatar_url: (user as any).avatar_url,
      level: (user as any).level || 1,         // Added level
      current_xp: (user as any).current_xp || 0 // Added xp
    };
  }

  /**
   * Change user password
   */
  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.error);
    }

    // Hash and update
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: newHash }
    });
  }

  /**
   * Update user avatar
   */
  static async updateAvatar(userId: number, avatarData: string): Promise<void> {
    // Validate Base64 image somewhat?
    // Postgres TEXT field is huge

    await prisma.user.update({
      where: { id: userId },
      data: {
        avatar_url: avatarData // Removed ts-ignore as schema should have it now
      } as any
    });
  }

  /**
   * Update user profile info (Username, Email, Password)
   */
  static async updateUser(userId: number, input: { username?: string, email?: string }): Promise<AuthResponse> {
    const dataToUpdate: any = {};

    // 1. Username
    if (input.username) {
      const username = input.username.trim();
      const validation = this.validateUsername(username);
      if (!validation.valid) throw new Error(validation.error);

      // Check uniqueness (exclude self)
      const existing = await prisma.user.findFirst({
        where: {
          username: { mode: 'insensitive', equals: username },
          NOT: { id: userId }
        }
      });
      if (existing) throw new Error('Username already taken');

      dataToUpdate.username = username;
    }

    // 2. Email
    if (input.email !== undefined) {
      if (input.email.length > 0) {
        if (!EMAIL_REGEX.test(input.email)) {
          throw new Error('Invalid email format');
        }
        // Check uniqueness (exclude self)
        const existing = await prisma.user.findFirst({
          where: {
            email: { mode: 'insensitive', equals: input.email },
            NOT: { id: userId }
          }
        });
        if (existing) throw new Error('Email already taken');
        dataToUpdate.email = input.email;
      } else {
        dataToUpdate.email = null;
      }
    }

    if (Object.keys(dataToUpdate).length === 0) {
      throw new Error("No changes provided");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate
    });

    // Return new profile and NEW token (since username might have changed, invalidating old token payload)
    const profile = this.toProfile(updatedUser as unknown as User);
    const token = this.generateToken(updatedUser as unknown as User);

    return { user: profile, token };
  }
}
