import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';

import { config } from './config/index.js';
import { prisma } from './db/prisma.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler, hasInternalKey } from './middleware/index.js';

export const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

// Security middleware
app.use(helmet());

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`[API Request] ${req.method} ${req.url} from ${req.ip} (Origin: ${req.get('Origin')})`);
  next();
});

// Hardcoded allowed origins pattern + explicit Env Var
const allowedOrigins = [
  config.corsOrigin, // The one from ENV (e.g. "https://puyo.live")
  "http://localhost:5173",
  "http://localhost:3000",
  "https://puyio.vercel.app",
  "https://puyo.live",
  "https://www.puyo.live",
  "https://game.puyo.live",
  "https://api.puyo.live"
];


/**
 * Additional allowed origins, comma-separated, from EXTRA_CORS_ORIGINS.
 *
 * Development here happens on one machine while the stack runs in Docker
 * Desktop on another, so the browser origin is a LAN address that no
 * hardcoded list can know in advance. Example:
 *   EXTRA_CORS_ORIGINS=http://192.168.1.42:5173
 *
 * Only honoured outside production, so a stray value in a deployed
 * environment cannot widen the public allowlist.
 */
const extraOrigins =
  process.env.NODE_ENV === 'production'
    ? []
    : (process.env.EXTRA_CORS_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

if (extraOrigins.length > 0) {
  console.log(`[Dev] Extra CORS origins allowed: ${extraOrigins.join(', ')}`);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow extensions/mobile apps (no origin)
    if (!origin) return callback(null, true);

    // Check if origin is allowed
    if (allowedOrigins.includes(origin) || extraOrigins.includes(origin) || origin === config.corsOrigin) {
      return callback(null, true);
    }

    // Vercel preview deployments for THIS project only.
    // A bare `.vercel.app` suffix test admits every site hosted on Vercel,
    // which combined with `credentials: true` below is a real cross-origin
    // hole. Preview URLs look like:
    //   puyolive-<hash>-<scope>.vercel.app
    // so the project prefix is the part worth matching. Override with
    // VERCEL_PREVIEW_PREFIX if the project is ever renamed.
    const previewPrefix = process.env.VERCEL_PREVIEW_PREFIX || 'puyolive';
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) &&
        origin.slice('https://'.length).startsWith(previewPrefix)) {
      return callback(null, true);
    }

    console.log('Blocked by CORS:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Compress responses (JSON lists shrink five- to tenfold). Images are
// skipped by compression's default filter; they are compressed already.
app.use(compression());

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global API rate limiter — prevents general DoS. The game server's calls
// carry the internal key and all come from one address, so they are exempt
// (API-09).
app.use('/api', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  skip: hasInternalKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
}));

// Health check and connection check helper
async function checkConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    return false;
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealthy = await checkConnection();

  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected'
  });
});

// API routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);



// Start server function
export async function startServer(): Promise<void> {
  try {
    // Check database connection
    const dbConnected = await checkConnection();
    if (!dbConnected) {
      console.error('❌ Could not connect to database');
      process.exit(1);
    }
    console.log('✅ Database connected');

    // Migrations are handled by external CLI/scripts now

    // Start listening (Using httpServer instead of app.listen)
    httpServer.listen(Number(config.port), "0.0.0.0", () => {
      console.log(`🚀 Puyo Live API & Game Server running on http://0.0.0.0:${config.port}`);
      console.log(`   Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if running directly
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(err => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}
