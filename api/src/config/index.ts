import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from api/ root (two levels up from config/)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export const config = {
  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'puyolive',
    user: process.env.DB_USER || 'puyolive',
    password: process.env.DB_PASSWORD || 'puyolive_secret',
    connectionString: process.env.DATABASE_URL
  },

  // JWT — HS512 requires a 64-byte (512-bit) key minimum
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (process.env.NODE_ENV === 'production') {
        if (!secret) throw new Error('JWT_SECRET must be set in production');
        if (secret.length < 64) throw new Error('JWT_SECRET must be at least 64 characters in production');
        return secret;
      }
      // Dev: use env var or generate a per-process random secret (tokens don't survive restart — intentional)
      return secret || crypto.randomBytes(64).toString('base64url');
    })(),
    algorithm: 'HS512' as const,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // API
  // 8080 matches both docker-compose and the client's dev fallback in
  // src/api/client.ts. It previously defaulted to 3001, which collided with the
  // game server's default and meant local dev could not work unconfigured.
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Where browsers reach this API: the base of URLs the API hands out, such
  // as avatar images. Set API_PUBLIC_URL when deploying anywhere else.
  publicUrl: (process.env.API_PUBLIC_URL || (process.env.NODE_ENV === 'production'
    ? 'https://api.puyo.live'
    : `http://localhost:${process.env.PORT || '8080'}`)).replace(/\/$/, ''),

  // Internal API key for server-to-server calls (match recording)
  internalApiKey: (() => {
    const key = process.env.INTERNAL_API_KEY;
    if (process.env.NODE_ENV === 'production') {
      if (!key) throw new Error('INTERNAL_API_KEY must be set in production');
      if (key.length < 32) throw new Error('INTERNAL_API_KEY must be at least 32 characters');
      return key;
    }
    return key || crypto.randomBytes(32).toString('base64url');
  })(),

  // ELO Configuration
  elo: {
    defaultRating: 1000,
    kFactor: 32, // Higher K-factor for faster rating changes
    minRating: 100 // Floor to prevent negative ratings
  }
} as const;
