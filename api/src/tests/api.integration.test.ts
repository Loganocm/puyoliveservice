import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../db/prisma.js';

describe('API Integration Tests', () => {
  // Test user data
  let authToken: string;
  let testUserId: number;
  const timestamp = Date.now();

  const testUser = {
    username: `apitest_${timestamp}`,
    password: 'TestPass123',
    email: `apitest_${timestamp}@test.com`
  };

  // Cleanup
  afterAll(async () => {
    try {
      // Delete test users (cascade delete matches if schema configured, otherwise delete matches first)
      // Since schema doesn't explicitly have cascade in the relation field, we should delete matches manually or rely on DB FK cascade if set (Prisma default is NoAction/SetNull usually).
      // Safest to delete matches.
      await prisma.match.deleteMany({
        where: {
          OR: [
            { player1: { username: { startsWith: 'apitest_' } } },
            { player2: { username: { startsWith: 'apitest_' } } }
          ]
        }
      });

      await prisma.user.deleteMany({
        where: { username: { startsWith: 'apitest_' } }
      });
    } catch (e) {
      console.error('Cleanup failed', e);
    }
  });

  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('healthy');
      expect(res.body.database).toBe('connected');
    });
  });

  describe('Authentication Routes', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user', async () => {
        const res = await request(app)
          .post('/api/auth/register')
          .send(testUser)
          .expect(201);

        expect(res.body.user).toBeDefined();
        expect(res.body.token).toBeDefined();
        expect(res.body.user.username).toBe(testUser.username);
        expect(res.body.user.elo_rating).toBe(1000);

        authToken = res.body.token;
        testUserId = res.body.user.id;
      });

      it('should reject duplicate username', async () => {
        const res = await request(app)
          .post('/api/auth/register')
          .send(testUser)
          .expect(400);

        expect(res.body.error).toContain('already exists');
      });

      it('should reject invalid username', async () => {
        const res = await request(app)
          .post('/api/auth/register')
          .send({ username: 'ab', password: 'ValidPass123' })
          .expect(400);

        expect(res.body.error).toBeDefined();
      });

      it('should reject weak password', async () => {
        const res = await request(app)
          .post('/api/auth/register')
          .send({ username: 'validuser999', password: 'nodigit' })
          .expect(400);

        expect(res.body.error).toBeDefined();
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login with correct credentials', async () => {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: testUser.password
          })
          .expect(200);

        expect(res.body.user).toBeDefined();
        expect(res.body.token).toBeDefined();
      });

      it('should reject wrong password', async () => {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: 'WrongPassword123'
          })
          .expect(401);

        expect(res.body.error).toBe('Invalid username or password');
      });

      it('should reject non-existent user', async () => {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            username: 'nonexistent_xyz_999',
            password: 'AnyPassword123'
          })
          .expect(401);

        expect(res.body.error).toBe('Invalid username or password');
      });
    });

    describe('GET /api/auth/me', () => {
      it('should return current user with valid token', async () => {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.username).toBe(testUser.username);
      });

      it('should reject without token', async () => {
        await request(app)
          .get('/api/auth/me')
          .expect(401);
      });

      it('should reject invalid token', async () => {
        await request(app)
          .get('/api/auth/me')
          .set('Authorization', 'Bearer invalid.token.here')
          .expect(401);
      });
    });
  });

  describe('User Routes', () => {
    describe('GET /api/users/:identifier', () => {
      it('should get user by ID', async () => {
        const res = await request(app)
          .get(`/api/users/${testUserId}`)
          .expect(200);

        expect(res.body.username).toBe(testUser.username);
      });

      it('should get user by username', async () => {
        const res = await request(app)
          .get(`/api/users/${testUser.username}`)
          .expect(200);

        expect(res.body.id).toBe(testUserId);
      });

      it('should return 404 for non-existent user', async () => {
        await request(app)
          .get('/api/users/99999999')
          .expect(404);
      });
    });
  });

  describe('Match Routes', () => {
    let secondUserId: number;
    let secondUserToken: string;

    beforeAll(async () => {
      // Create a second test user for matches
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: `apitest_opponent_${timestamp}`,
          password: 'TestPass123'
        });

      secondUserId = res.body.user.id;
      secondUserToken = res.body.token;
    });

    describe('POST /api/matches', () => {
      it('should record a match result', async () => {
        const res = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            player1_id: testUserId,
            player2_id: secondUserId,
            winner_id: testUserId,
            player1_max_chain: 5,
            player2_max_chain: 3
          })
          .expect(201);

        expect(res.body.id).toBeDefined();
        expect(res.body.winner_id).toBe(testUserId);
        expect(res.body.elo_change).toBeGreaterThan(0);
      });

      it('should reject without authentication', async () => {
        await request(app)
          .post('/api/matches')
          .send({
            player1_id: testUserId,
            player2_id: secondUserId,
            winner_id: testUserId
          })
          .expect(401);
      });

      it('should reject invalid winner_id', async () => {
        await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            player1_id: testUserId,
            player2_id: secondUserId,
            winner_id: 99999 // Not a participant
          })
          .expect(400);
      });
    });

    describe('GET /api/matches/user/:userId', () => {
      it('should get match history', async () => {
        const res = await request(app)
          .get(`/api/matches/user/${testUserId}`)
          .expect(200);

        expect(res.body.matches).toBeDefined();
        expect(Array.isArray(res.body.matches)).toBe(true);
        expect(res.body.pagination).toBeDefined();
      });
    });
  });

  describe('Leaderboard Routes', () => {
    describe('GET /api/leaderboard', () => {
      it('should return leaderboard', async () => {
        const res = await request(app)
          .get('/api/leaderboard')
          .expect(200);

        expect(res.body.leaderboard).toBeDefined();
        expect(Array.isArray(res.body.leaderboard)).toBe(true);
        expect(res.body.pagination).toBeDefined();
      });

      it('should respect limit parameter', async () => {
        const res = await request(app)
          .get('/api/leaderboard?limit=5')
          .expect(200);

        expect(res.body.leaderboard.length).toBeLessThanOrEqual(5);
      });
    });

    describe('GET /api/leaderboard/stats', () => {
      it('should return global stats', async () => {
        const res = await request(app)
          .get('/api/leaderboard/stats')
          .expect(200);

        expect(res.body.total_players).toBeDefined();
        expect(res.body.total_matches).toBeDefined();
        expect(res.body.average_elo).toBeDefined();
      });
    });

    describe('GET /api/leaderboard/rank/:userId', () => {
      it('should return user rank', async () => {
        const res = await request(app)
          .get(`/api/leaderboard/rank/${testUserId}`)
          .expect(200);

        expect(res.body.rank).toBeDefined();
        expect(typeof res.body.rank).toBe('number');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });
});
