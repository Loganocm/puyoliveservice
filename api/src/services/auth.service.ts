import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import type { User, UserProfile, CreateUserInput, LoginInput, AuthResponse } from '../types/user.js';
import { Prisma } from '@prisma/client';

const SALT_ROUNDS = 10;

// Validation constants
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

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
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Create user
    // Note: 'any' cast used as a compatibility bridge between Prisma User and local User interface if needed
    // but they should be compatible.
    const user = await prisma.user.create({
      data: {
        username,
        password_hash: passwordHash,
        email: (input.email || undefined) as any, // Cast to any to bypass local type mismatch
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
      throw new Error('Invalid username or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    // Update last login (Wait, User model in Prisma schema didn't have last_login_at. 
    // I should check schema or types. If schema doesn't have it, I can't update it yet.
    // For now, I will omit updating last_login_at if it's not in schema schema: User model has: id, username, email, password_hash, elo_rating, games_played/won, highest_chain, garbage, created_at, updated_at, but NOT last_login_at.
    // I will skip this update step or add it to schema later.

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
   */
  static async verifyToken(token: string): Promise<User | null> {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as { userId: number };
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
      { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
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
  static async updateUser(userId: number, input: { username?: string, email?: string, password?: string }): Promise<AuthResponse> {
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
        // Check uniqueness (exclude self)
        // Note: Not all users have email, so only check if not null
        const existing = await prisma.user.findFirst({
          where: {
            email: { mode: 'insensitive', equals: input.email },
            NOT: { id: userId }
          }
        });
        if (existing) throw new Error('Email already taken');
        dataToUpdate.email = input.email;
      } else {
        dataToUpdate.email = null; // Clear email (if nullable) or ignore? Assuming nullable.
      }
    }

    // 3. Password
    if (input.password) {
      const validation = this.validatePassword(input.password);
      if (!validation.valid) throw new Error(validation.error);
      const hash = await bcrypt.hash(input.password, SALT_ROUNDS);
      dataToUpdate.password_hash = hash;
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
