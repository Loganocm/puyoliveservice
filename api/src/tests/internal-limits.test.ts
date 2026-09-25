import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { config } from '../config/index.js';

/**
 * The game server reaches the API from one address and verifies every player
 * who signs in. Per-address limits meant for players must not apply to it, or
 * the 61st sign-in in 15 minutes fails for everyone (API-09).
 *
 * Its own file so the rate limiter's in-memory counts start from zero.
 */
describe('rate limits and the game server', () => {
    it('does not limit token verification carrying the internal key', async () => {
        for (let i = 0; i < 70; i++) {
            const res = await request(app)
                .post('/api/auth/verify')
                .set('X-Internal-Key', config.internalApiKey)
                .send({ token: 'not-a-real-token' });
            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(false);
        }
    });

    it('still limits other callers, and a wrong key counts as another caller', async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 61; i++) {
            const res = await request(app)
                .post('/api/auth/verify')
                .set('X-Internal-Key', 'x'.repeat(config.internalApiKey.length))
                .send({ token: 'not-a-real-token' });
            statuses.push(res.status);
        }
        expect(statuses.slice(0, 60).every(s => s === 200)).toBe(true);
        expect(statuses[60]).toBe(429);
    });
});
