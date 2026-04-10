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
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // ELO Configuration
  elo: {
    defaultRating: 1000,
    kFactor: 32, // Higher K-factor for faster rating changes
    minRating: 100 // Floor to prevent negative ratings
  }
} as const;
