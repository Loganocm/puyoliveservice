import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../services/auth.service.js';
import { prisma } from '../db/prisma.js';

describe('AuthService', () => {
  // Test user data
  const testUser = {
    username: 'testuser_' + Date.now(),
    password: 'SecurePass123',
    email: 'test@example.com'
  };

  // Cleanup created users
  afterEach(async () => {
    try {
      await prisma.user.deleteMany({
        where: { username: { startsWith: 'testuser_' } }
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(AuthService.validateUsername('alice').valid).toBe(true);
      expect(AuthService.validateUsername('Bob123').valid).toBe(true);
      expect(AuthService.validateUsername('test_user').valid).toBe(true);
      expect(AuthService.validateUsername('abc').valid).toBe(true); // min length
      expect(AuthService.validateUsername('a'.repeat(32)).valid).toBe(true); // max length
    });

    it('should reject usernames that are too short', () => {
      const result = AuthService.validateUsername('ab');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3 characters');
    });

    it('should reject usernames that are too long', () => {
      const result = AuthService.validateUsername('a'.repeat(33));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 32 characters');
    });

    it('should reject usernames with invalid characters', () => {
      expect(AuthService.validateUsername('user@name').valid).toBe(false);
      expect(AuthService.validateUsername('user name').valid).toBe(false);
      expect(AuthService.validateUsername('user-name').valid).toBe(false);
      expect(AuthService.validateUsername('user.name').valid).toBe(false);
      expect(AuthService.validateUsername('用户名').valid).toBe(false);
    });

    it('should reject empty or null usernames', () => {
      expect(AuthService.validateUsername('').valid).toBe(false);
      expect(AuthService.validateUsername(null as any).valid).toBe(false);
      expect(AuthService.validateUsername(undefined as any).valid).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      expect(AuthService.validatePassword('Password1').valid).toBe(true);
      expect(AuthService.validatePassword('abc12345').valid).toBe(true);
      expect(AuthService.validatePassword('SuperSecure123!@#').valid).toBe(true);
    });

    it('should reject passwords that are too short', () => {
      const result = AuthService.validatePassword('Pass1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 8 characters');
    });

    it('should reject passwords that are too long', () => {
      const result = AuthService.validatePassword('a1'.repeat(65));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 128 characters');
    });

    it('should reject passwords without letters', () => {
      const result = AuthService.validatePassword('12345678');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one letter');
    });

    it('should reject passwords without numbers', () => {
      const result = AuthService.validatePassword('abcdefgh');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one number');
    });

    it('should reject empty passwords', () => {
      expect(AuthService.validatePassword('').valid).toBe(false);
      expect(AuthService.validatePassword(null as any).valid).toBe(false);
    });
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const result = await AuthService.register(testUser);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user.username).toBe(testUser.username);
      expect(result.user.elo_rating).toBe(1000); // Default ELO
      expect((result.user as any).password_hash).toBeUndefined(); // Should not expose hash
    });

    it('should reject duplicate usernames (case insensitive)', async () => {
      await AuthService.register(testUser);

      // Try with same username
      await expect(AuthService.register(testUser))
        .rejects.toThrow('Username already exists');

      // Try with different case
      await expect(AuthService.register({
        ...testUser,
        username: testUser.username.toUpperCase()
      })).rejects.toThrow('Username already exists');
    });

    it('should reject invalid usernames', async () => {
      await expect(AuthService.register({
        username: 'ab',
        password: 'ValidPass123'
      })).rejects.toThrow('at least 3 characters');
    });

    it('should reject weak passwords', async () => {
      await expect(AuthService.register({
        username: 'validuser123',
        password: 'nodigits'
      })).rejects.toThrow('at least one number');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a test user
      await AuthService.register(testUser);
    });

    it('should login with correct credentials', async () => {
      const result = await AuthService.login({
        username: testUser.username,
        password: testUser.password
      });

      expect(result).toBeDefined();
      expect(result.user.username).toBe(testUser.username);
      expect(result.token).toBeDefined();
    });

    it('should login with case-insensitive username', async () => {
      const result = await AuthService.login({
        username: testUser.username.toUpperCase(),
        password: testUser.password
      });

      expect(result.user.username).toBe(testUser.username);
    });

    it('should reject incorrect password', async () => {
      await expect(AuthService.login({
        username: testUser.username,
        password: 'WrongPassword123'
      })).rejects.toThrow('Invalid username or password');
    });

    it('should reject non-existent username', async () => {
      await expect(AuthService.login({
        username: 'nonexistent_user_xyz',
        password: 'AnyPassword123'
      })).rejects.toThrow('Invalid username or password');
    });

    it('should reject empty credentials', async () => {
      await expect(AuthService.login({
        username: '',
        password: 'password'
      })).rejects.toThrow('Username and password are required');

      await expect(AuthService.login({
        username: 'username',
        password: ''
      })).rejects.toThrow('Username and password are required');
    });

    // Regression for API-01: the ban check used to be wrapped in a catch-all
    // that also swallowed its own "Account suspended" error, so a banned user
    // logged in normally.
    describe('when the user is banned', () => {
      const banUser = async (expires_at: Date | null) => {
        const user = await prisma.user.findFirstOrThrow({ where: { username: testUser.username } });
        await prisma.ban.create({ data: { user_id: user.id, reason: 'test ban', expires_at } });
        return user;
      };

      afterEach(async () => {
        await prisma.ban.deleteMany({ where: { reason: 'test ban' } });
      });

      it('rejects login while a permanent ban is in force', async () => {
        await banUser(null);
        await expect(AuthService.login({
          username: testUser.username,
          password: testUser.password
        })).rejects.toThrow('Account suspended: test ban');
      });

      it('allows login once a temporary ban has expired', async () => {
        await banUser(new Date(Date.now() - 60_000));
        const result = await AuthService.login({
          username: testUser.username,
          password: testUser.password
        });
        expect(result.user.username).toBe(testUser.username);
      });

      it('invalidates tokens issued before the ban', async () => {
        const { token } = await AuthService.login({
          username: testUser.username,
          password: testUser.password
        });
        expect(await AuthService.verifyToken(token)).not.toBeNull();

        await banUser(null);
        expect(await AuthService.verifyToken(token)).toBeNull();
      });
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const { user, token } = await AuthService.register({
        ...testUser,
        username: 'testuser_token_' + Date.now()
      });

      const verifiedUser = await AuthService.verifyToken(token);

      expect(verifiedUser).toBeDefined();
      expect(verifiedUser?.id).toBe(user.id);
    });

    it('should return null for invalid token', async () => {
      const result = await AuthService.verifyToken('invalid.token.here');
      expect(result).toBeNull();
    });

    it('should return null for empty token', async () => {
      const result = await AuthService.verifyToken('');
      expect(result).toBeNull();
    });
  });

  describe('changePassword', () => {
    let userId: number;

    beforeEach(async () => {
      const result = await AuthService.register({
        ...testUser,
        username: 'testuser_pwchange_' + Date.now()
      });
      userId = result.user.id;
    });

    it('should change password with correct current password', async () => {
      await AuthService.changePassword(userId, testUser.password, 'NewPassword123');

      // Old password should no longer work
      await expect(AuthService.login({
        username: 'testuser_pwchange_' + Math.floor(Date.now() / 1000) * 1000, // Approximate
        password: testUser.password
      })).rejects.toThrow();
    });

    it('should reject incorrect current password', async () => {
      await expect(AuthService.changePassword(
        userId,
        'WrongOldPassword123',
        'NewPassword123'
      )).rejects.toThrow('Current password is incorrect');
    });

    it('should reject weak new password', async () => {
      await expect(AuthService.changePassword(
        userId,
        testUser.password,
        'weak'
      )).rejects.toThrow();
    });
  });
});
