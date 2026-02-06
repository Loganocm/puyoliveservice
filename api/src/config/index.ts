import dotenv from 'dotenv';
import path from 'path';
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

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
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
