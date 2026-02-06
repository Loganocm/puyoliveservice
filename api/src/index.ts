import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import { prisma } from './db/prisma.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/index.js';
// import { initializeSocket } from './socket/index.js';

export const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet());
// Hardcoded allowed origins pattern + explicit Env Var
const allowedOrigins = [
  config.corsOrigin, // The one from ENV (e.g. "https://puyo.live")
  "http://localhost:5173",
  "https://puyio.vercel.app",
  "https://puyo.live",
  "https://www.puyo.live",
  "https://game.puyo.live",
  "https://api.puyo.live"
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow extensions/mobile apps (no origin)
    if (!origin) return callback(null, true);

    // Check if origin is allowed
    if (allowedOrigins.includes(origin) || origin === config.corsOrigin) {
      return callback(null, true);
    }

    // Optional: Allow Vercel preview deployments (wildcard matching)
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    console.log('Blocked by CORS:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

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

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for socket.io to avoid issues
    methods: ["GET", "POST"],
    credentials: false
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket.IO removed (moved to standalone server)
// initializeSocket(io);
// console.log('🔌 Socket.IO Initialized');

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
    httpServer.listen(config.port, () => {
      console.log(`🚀 Puyo Live API & Game Server running on http://localhost:${config.port}`);
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
