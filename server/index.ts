import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { roomManager } from './RoomManager.js';
import { minesRoom } from './MinesRoom.js';
import { recordMatch, verifyToken, checkApiHealth } from './ApiClient.js';

const app = express();
const httpServer = createServer(app);

// Trust Render's proxy
app.set('trust proxy', 1);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://puyio.vercel.app",
  "https://puyo.live",
  "https://www.puyo.live",
  "https://game.puyo.live",
  "https://api.puyo.live",
  "https://puyolive-git-main-loganocms-projects.vercel.app"
];

const corsOrigin = process.env.CORS_ORIGIN || allowedOrigins;

// Explicitly add CORS middleware for the Express app
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || (typeof corsOrigin === 'string' && origin === corsOrigin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Root route for health checking via browser
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} from ${req.ip} (Origin: ${req.get('Origin')})`);
  next();
});

app.get('/', (_req, res) => {
  res.json({ status: 'Socket Server Alive', version: '1.0.0', time: new Date().toISOString() });
});

// Explicit health check match
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 256 * 1024, // 256 KB max payload — prevents oversized grid/state DoS
});

const port = process.env.PORT || 3001;

// Track authenticated users: socket.id -> { userId, token }
const authenticatedUsers = new Map<string, {
  userId: number;
  token: string;
  username: string;
  elo?: number;
  games_played?: number;
  games_won?: number;
  total_garbage_sent?: number;
  rank?: number;
  avatar_url?: string;
}>();

// Track socket IP addresses for same-IP ranked prevention
const socketIPs = new Map<string, string>();

/** Get the real IP from a socket (handles proxies/Cloudflare) */
function getSocketIP(socket: Socket): string {
  const cfIP = socket.handshake.headers['cf-connecting-ip'];
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof cfIP === 'string') return cfIP;
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return socket.handshake.address;
}

// Separate queues for ranked and unranked matchmaking
let rankedQueue: string[] = [];
let unrankedQueue: string[] = [];

// ── Per-socket rate limiting ──
const socketEventTimestamps = new Map<string, Map<string, number[]>>();

/** Returns true if the event is allowed, false if rate-limited */
function checkSocketRate(socketId: string, eventName: string, maxPerSec: number): boolean {
  if (!socketEventTimestamps.has(socketId)) {
    socketEventTimestamps.set(socketId, new Map());
  }
  const events = socketEventTimestamps.get(socketId)!;
  if (!events.has(eventName)) {
    events.set(eventName, []);
  }
  const timestamps = events.get(eventName)!;
  const now = Date.now();
  const cutoff = now - 1000;

  // Remove old timestamps
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= maxPerSec) {
    return false;
  }
  timestamps.push(now);
  return true;
}

/** Validate a Puyo board grid: must be 6 columns × 14 rows (col-major) with valid cell values */
function isValidGrid(grid: unknown): grid is number[][] {
  if (!Array.isArray(grid) || grid.length !== 6) return false; // Exactly 6 columns
  for (const col of grid) {
    if (!Array.isArray(col) || col.length !== 14) return false; // Exactly 14 rows per column
    for (const cell of col) {
      if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 15) return false;
    }
  }
  return true;
}

// Wire up mines bot callbacks (needs io reference)
minesRoom.onBotGarbage = (targetSocketId: string, amount: number) => {
  const targetSocket = io.sockets.sockets.get(targetSocketId);
  if (targetSocket) {
    targetSocket.emit('mines_receive_garbage', {
      amount,
      fromSocketId: '__MINES_BOT__',
      fromUsername: '⛏ MineBot',
    });
  }
  io.to('MINES_LOBBY').emit('mines_player_list', minesRoom.getPlayerList());
};
minesRoom.onBroadcastPlayerList = () => {
  io.to('MINES_LOBBY').emit('mines_player_list', minesRoom.getPlayerList());
};

io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // Track IP for same-IP ranked prevention
  socketIPs.set(socket.id, getSocketIP(socket));

  socket.emit('welcome', {
    message: 'Connected to Puyo Server',
    id: socket.id
  });

  // Send current queue count immediately on connect
  socket.emit('queue_update', {
    count: rankedQueue.length + unrankedQueue.length,
    ranked: rankedQueue.length,
    unranked: unrankedQueue.length
  });

  // Handle user authentication
  socket.on('authenticate', async (data: { token: string }) => {
    if (!data || typeof data.token !== 'string' || data.token.length > 2048) return;
    if (!checkSocketRate(socket.id, 'authenticate', 3)) return;
    try {
      const user = await verifyToken(data.token);
      if (user) {
        authenticatedUsers.set(socket.id, {
          userId: user.id,
          token: data.token,
          username: user.username,
          elo: user.elo_rating,
          games_played: user.games_played,
          games_won: user.games_won,
          total_garbage_sent: user.total_garbage_sent,
          rank: user.rank || undefined,
          avatar_url: user.avatar_url || undefined
        });
        socket.emit('authenticated', {
          success: true,
          user: { id: user.id, username: user.username, elo_rating: user.elo_rating }
        });
        console.log(`User ${socket.id} authenticated as ${user.username} (ID: ${user.id})`);
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });

  // Helper to broadcast queue updates
  const broadcastQueueUpdate = () => {
    io.emit('queue_update', {
      count: rankedQueue.length + unrankedQueue.length,
      ranked: rankedQueue.length,
      unranked: unrankedQueue.length
    });
  };

  // Helper to remove a socket from all queues
  const removeFromQueues = (socketId: string) => {
    let changed = false;
    if (rankedQueue.includes(socketId)) {
      rankedQueue = rankedQueue.filter(id => id !== socketId);
      changed = true;
    }
    if (unrankedQueue.includes(socketId)) {
      unrankedQueue = unrankedQueue.filter(id => id !== socketId);
      changed = true;
    }
    return changed;
  };

  socket.on('join_queue', (data: { ranked?: boolean } = {}) => {
    if (!checkSocketRate(socket.id, 'join_queue', 2)) return;
    const isRanked = data.ranked || false;

    // Ranked queue requires authentication
    if (isRanked && !authenticatedUsers.has(socket.id)) {
      socket.emit('error', { message: 'You must be logged in to play ranked' });
      return;
    }

    // Ranked requires minimum 5 games played (prevents fresh puppet accounts)
    if (isRanked) {
      const auth = authenticatedUsers.get(socket.id);
      if (!auth || (auth.games_played || 0) < 5) {
        socket.emit('error', { message: 'You need at least 5 games played to enter ranked' });
        return;
      }
    }

    const queueName = isRanked ? 'ranked' : 'unranked';
    const queue = isRanked ? rankedQueue : unrankedQueue;

    // Prevent duplicates in both queues
    if (!rankedQueue.includes(socket.id) && !unrankedQueue.includes(socket.id)) {
      queue.push(socket.id);
      console.log(`User ${socket.id} joined ${queueName} queue. Queue size: ${queue.length}`);
      broadcastQueueUpdate();
    }

    // Try to match players from the same queue
    if (queue.length >= 2) {
      const p1 = queue.shift()!;
      const p2 = queue.shift()!;

      broadcastQueueUpdate();

      const room = roomManager.createRoom();

      // Mark room as ranked if it's a ranked match
      // BUT: if both players share the same IP, force unranked (anti-puppet ELO inflation)
      if (isRanked) {
        const ip1 = socketIPs.get(p1);
        const ip2 = socketIPs.get(p2);
        if (ip1 && ip2 && ip1 === ip2) {
          console.log(`[Anti-Puppet] Same IP detected (${ip1}) for ${p1} and ${p2} — forcing unranked`);
          room.ranked = false;
        } else {
          room.ranked = true;
        }
      }

      const socket1 = io.sockets.sockets.get(p1);
      const socket2 = io.sockets.sockets.get(p2);

      if (socket1 && socket2) {
        // Get authenticated user info if available
        const auth1 = authenticatedUsers.get(p1);
        const auth2 = authenticatedUsers.get(p2);

        room.addPlayer({
          id: p1,
          name: auth1?.username || `Player ${p1.substring(0, 4)}`,
          ready: true,
          userId: auth1?.userId,
          authToken: auth1?.token
        });
        room.addPlayer({
          id: p2,
          name: auth2?.username || `Player ${p2.substring(0, 4)}`,
          ready: true,
          userId: auth2?.userId,
          authToken: auth2?.token
        });

        socket1.join(room.id);
        socket2.join(room.id);

        console.log(`${isRanked ? 'Ranked' : 'Unranked'} match found: ${p1} vs ${p2} in room ${room.id}`);
        if (room.isRankedMatch()) {
          console.log(`  Ranked match: User ${auth1?.userId} vs User ${auth2?.userId}`);
        } else {
          // Log why it's not ranked if intended
          if (isRanked) console.log(`  Match NOT Ranked despite queue: P1(${auth1?.userId}) P2(${auth2?.userId})`);
        }

        // Prepare player data for VS screen
        io.to(room.id).emit('match_found', {
          roomId: room.id,
          opponent: 'Opponent',
          ranked: isRanked,
          players: [
            {
              username: auth1?.username || `Player ${p1.substring(0, 4)}`,
              elo: auth1?.elo || 0,
              userId: auth1?.userId,
              gamesPlayed: auth1?.games_played || 0,
              garbageSent: auth1?.total_garbage_sent || 0,
              avatarUrl: auth1?.avatar_url,
              rank: auth1?.rank
            },
            {
              username: auth2?.username || `Player ${p2.substring(0, 4)}`,
              elo: auth2?.elo || 0,
              userId: auth2?.userId,
              gamesPlayed: auth2?.games_played || 0,
              garbageSent: auth2?.total_garbage_sent || 0,
              avatarUrl: auth2?.avatar_url,
              rank: auth2?.rank
            }
          ]
        });



        io.to(room.id).emit('player_joined', { id: p2, count: 2 });

        // Auto-start game after short delay
        setTimeout(() => {
          room.startMatch();
          const playerIds = Array.from(room.players.keys());
          io.to(room.id).emit('game_start', { seed: Date.now(), roomId: room.id, players: playerIds });
        }, 3000);
      }
    }
  });

  socket.on('leave_queue', () => {
    if (removeFromQueues(socket.id)) {
      console.log(`User ${socket.id} left queue.`);
      broadcastQueueUpdate();
    }
  });

  // Helper to broadcast room state to all players in the room
  const broadcastRoomUpdate = (roomId: string) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const players = Array.from(room.players.values()).map(p => ({
      id: p.id,
      username: p.name,
      ready: p.ready,
      isHost: room.getPlayerIndex(p.id) === 0, // Assume first player is host
      userId: p.userId,
      elo: undefined, // Add logic if available
      avatarUrl: undefined // Add if available in Player struct
    }));

    io.to(roomId).emit('room_update', {
      roomId: room.id,
      players,
      maxPlayers: room.maxPlayers
    });
  };

  const broadcastRoomList = () => {
    // Only send PUBLIC rooms to the lobby list
    const rooms = roomManager.getAllRooms()
      .filter(r => !r.isPrivate)
      .map(r => ({
        id: r.id,
        name: `Room ${r.id.substring(0, 4)}`,
        players: r.playerCount,
        maxPlayers: r.maxPlayers,
        status: r.matchStats ? 'playing' : 'waiting',
        isPrivate: false
      }));
    io.emit('room_list_update', rooms);
  };

  socket.on('get_rooms', () => {
    broadcastRoomList();
  });

  socket.on('create_room', (data: { isPrivate?: boolean } = {}) => {
    if (!checkSocketRate(socket.id, 'create_room', 1)) return;
    const room = roomManager.createRoom();
    room.isPrivate = !!data.isPrivate;

    room.addPlayer({ id: socket.id, name: `Player ${socket.id.substring(0, 4)}`, ready: false });
    socket.join(room.id);
    socket.emit('room_created', { roomId: room.id });
    console.log(`Room created: ${room.id} (Private: ${room.isPrivate})`);
    broadcastRoomUpdate(room.id);
    broadcastRoomList();
  });

  socket.on('start_game', (roomId: string) => {
    if (!roomId || typeof roomId !== 'string') return;
    if (!checkSocketRate(socket.id, 'start_game', 2)) return;
    const room = roomManager.getRoom(roomId);
    if (room) {
      if (room.players.has(socket.id)) {
        // Verify this is the host (first player)
        const isHost = room.getPlayerIndex(socket.id) === 0;
        if (!isHost) {
          socket.emit('error', { message: 'Only the host can start the game' });
          return;
        }

        // Check all players are ready
        const allReady = Array.from(room.players.values()).every(p => p.ready);
        if (!allReady) {
          socket.emit('error', { message: 'All players must be ready' });
          return;
        }

        // Need at least 2 players
        if (room.playerCount < 2) {
          socket.emit('error', { message: 'Need at least 2 players' });
          return;
        }

        console.log(`Starting game in room ${roomId}`);
        room.startMatch();
        const playerIds = Array.from(room.players.keys());
        io.to(roomId).emit('game_start', { seed: Date.now(), roomId: room.id, players: playerIds });
      } else {
        console.warn(`Unauthorized start_game attempt by ${socket.id} for room ${roomId}`);
      }
    }
  });

  socket.on('join_room', (roomId: string) => {
    if (!roomId || typeof roomId !== 'string') return;
    if (!checkSocketRate(socket.id, 'join_room', 3)) return;
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Check if this is a reconnection attempt by an authenticated user
    const auth = authenticatedUsers.get(socket.id);
    if (auth?.userId) {
      const oldSocketId = room.reconnectPlayer(auth.userId, socket.id, auth.token);
      if (oldSocketId) {
        // Force-disconnect old socket to prevent dual-socket monitoring
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
          oldSocket.leave(roomId);
          oldSocket.disconnect(true);
        }
        // Successfully reconnected - join the socket.io room
        socket.join(roomId);
        socket.emit('reconnected', { roomId, message: 'Reconnected to match' });
        console.log(`[Reconnect] User ${auth.username} rejoined room ${roomId}`);
        return;
      }
    }

    // Not a reconnect - prevent joining mid-game
    if (room.matchStats) {
      socket.emit('error', { message: 'Cannot join room during active match' });
      return;
    }

    // Try to add as new player
    const playerName = auth?.username || `Player ${socket.id.substring(0, 4)}`;
    if (room.addPlayer({
      id: socket.id,
      name: playerName,
      ready: false,
      userId: auth?.userId,
      authToken: auth?.token
    })) {
      socket.join(roomId);
      console.log(`${socket.id} joined room ${roomId}`);
      io.to(roomId).emit('player_joined', { id: socket.id, count: room.playerCount });

      // Broadcast full room update for lobby
      const players = Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.name,
        ready: p.ready,
        isHost: room.getPlayerIndex(p.id) === 0,
        userId: p.userId
      }));
      io.to(roomId).emit('room_update', {
        roomId: room.id,
        players: room.getPlayersForClient(),
        maxPlayers: room.settings.maxPlayers,
        settings: room.settings
      });

    } else {
      socket.emit('error', { message: 'Room full' });
    }
  });

  // Toggle ready state
  socket.on('toggle_ready', (data: { roomId: string, ready: boolean }) => {
    if (!data || typeof data.roomId !== 'string' || typeof data.ready !== 'boolean') return;
    if (!checkSocketRate(socket.id, 'toggle_ready', 5)) return;
    const room = roomManager.getRoom(data.roomId);
    if (room && room.players.has(socket.id)) {
      const player = room.players.get(socket.id)!;
      player.ready = data.ready;
      console.log(`Player ${socket.id} ready: ${data.ready} in room ${data.roomId}`);
      // Broadcast updated room state
      io.to(data.roomId).emit('room_update', {
        roomId: room.id,
        players: room.getPlayersForClient(),
        maxPlayers: room.settings.maxPlayers,
        settings: room.settings
      });
    }
  });

  // Get room details
  socket.on('get_room_details', (data: { roomId: string }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (!checkSocketRate(socket.id, 'get_room_details', 5)) return;
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      socket.emit('room_update', {
        roomId: room.id,
        players: room.getPlayersForClient(),
        maxPlayers: room.settings.maxPlayers,
        settings: room.settings
      });
    }
  });

  // Update room settings (host only)
  socket.on('update_room_settings', (data: { roomId: string, settings: any }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) return;
    if (!checkSocketRate(socket.id, 'update_room_settings', 5)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    // Cannot change settings during an active match
    if (room.matchStats) return;
    // Only the host (first player) can update settings
    const isHost = room.getPlayerIndex(socket.id) === 0;
    if (!isHost) {
      socket.emit('error', { message: 'Only the host can change settings' });
      return;
    }
    // Whitelist only known setting keys to prevent prototype pollution
    const ALLOWED_KEYS = ['bestOf', 'maxPlayers', 'garbageMultiplier', 'marginTime'];
    const sanitized: Record<string, any> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in data.settings) {
        sanitized[key] = data.settings[key];
      }
    }
    if (Object.keys(sanitized).length === 0) return;
    room.updateSettings(sanitized);
    console.log(`Room ${data.roomId} settings updated:`, room.settings);
    // Broadcast to all players
    io.to(data.roomId).emit('room_settings_update', { settings: room.settings });
    io.to(data.roomId).emit('room_update', {
      roomId: room.id,
      players: room.getPlayersForClient(),
      maxPlayers: room.settings.maxPlayers,
      settings: room.settings
    });
  });

  // V2 Replay: Record player inputs
  socket.on('record_input', (data: { roomId: string, input: string }) => {
    if (!data || typeof data.roomId !== 'string' || typeof data.input !== 'string') return;
    const validInputs = ['L', 'R', 'CW', 'CC', 'SD', 'SU', 'HD', 'G'];
    if (!validInputs.includes(data.input)) return;
    if (!checkSocketRate(socket.id, 'record_input', 120)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    if (!room.matchStats || room.matchConcluded) return;
    const playerIndex = room.getPlayerIndex(socket.id) as 0 | 1;
    room.recordInput(playerIndex, data.input as any);
  });

  // V2 Replay: Tick frame counter (only player 0 is authoritative to prevent double-counting)
  socket.on('tick_frame', (data: { roomId: string }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (!checkSocketRate(socket.id, 'tick_frame', 65)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    if (!room.matchStats || room.matchConcluded) return;
    const playerIndex = room.getPlayerIndex(socket.id);
    if (playerIndex === 0) {
      room.tick();
    }
  });

  socket.on('send_garbage', (data: { roomId: string, amount: number, chainLength?: number }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (typeof data.amount !== 'number' || !Number.isInteger(data.amount) || data.amount <= 0 || data.amount > 100) return;
    if (data.chainLength !== undefined && (typeof data.chainLength !== 'number' || !Number.isInteger(data.chainLength) || data.chainLength < 1 || data.chainLength > 25)) return;
    if (!checkSocketRate(socket.id, 'send_garbage', 30)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    // MUST have an active, non-concluded match
    if (!room.matchStats || room.matchConcluded) return;
    // Player must have recently cleared puyos to send garbage (server-validated chain window)
    const garbagePlayer = room.players.get(socket.id)!;
    if (!garbagePlayer.chainWindow || Date.now() - garbagePlayer.chainWindow > 5000) return;
    // Cap total garbage per chain window (prevents claiming infinite garbage from one chain)
    garbagePlayer.chainWindowGarbage = (garbagePlayer.chainWindowGarbage || 0) + data.amount;
    if (garbagePlayer.chainWindowGarbage > 60) return;
    room.recordGarbage(socket.id, data.amount);
    if (data.chainLength) {
      room.recordChain(socket.id, data.chainLength);
      room.recordReplayEvent('chain', socket.id, { length: data.chainLength });
    }
    // V2 Replay: Record garbage event
    const senderIndex = room.getPlayerIndex(socket.id);
    if (senderIndex !== -1) {
      const targetIndex = senderIndex === 0 ? 1 : 0;
      room.recordInput(targetIndex as 0 | 1, 'G', data.amount);
    }
    room.recordReplayEvent('garbage', socket.id, { amount: data.amount });

    // Send to everyone else in the room
    socket.broadcast.to(data.roomId).emit('receive_garbage', { amount: data.amount });
  });

  socket.on('send_board_state', (data: { roomId: string, grid: number[][] }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (!isValidGrid(data.grid)) return;
    if (!checkSocketRate(socket.id, 'send_board_state', 10)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    if (!room.matchStats || room.matchConcluded) return;
    // Update heartbeat timestamp — proves player is actively playing
    const boardPlayer = room.players.get(socket.id)!;
    boardPlayer.lastBoardUpdate = Date.now();

    // ── Server-side death detection ──
    // Grid is [col][row]. Death = grid[2][2] (col 2, first visible row in kill column)
    if (data.grid[2][2] !== 0) {
      // Spawn point blocked — start death suspect timer
      if (!boardPlayer.deathSuspectSince) {
        boardPlayer.deathSuspectSince = Date.now();
      }
    } else {
      // Spawn point clear — cancel suspect
      boardPlayer.deathSuspectSince = undefined;
    }

    // ── Puyo count tracking for garbage validation ──
    let currentPuyoCount = 0;
    for (const col of data.grid) {
      for (const cell of col) {
        if (cell !== 0) currentPuyoCount++;
      }
    }
    if (boardPlayer.lastPuyoCount !== undefined && boardPlayer.lastPuyoCount - currentPuyoCount >= 4) {
      // Puyos were cleared (minimum Puyo match group = 4) — open chain window
      boardPlayer.chainWindow = Date.now();
      boardPlayer.chainWindowGarbage = 0;
    }
    boardPlayer.lastPuyoCount = currentPuyoCount;

    socket.broadcast.to(data.roomId).emit('receive_board_state', { grid: data.grid, playerId: socket.id });
    room.recordReplayEvent('move', socket.id, { grid: data.grid });
  });

  socket.on('send_player_state', (data: { roomId: string, state: any }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (!data.state || typeof data.state !== 'object' || Array.isArray(data.state)) return;
    // Whitelist only known player state keys to prevent data injection
    const s = data.state;
    if (typeof s.x !== 'number' || typeof s.y !== 'number' || typeof s.rot !== 'number' ||
        typeof s.main !== 'number' || typeof s.sub !== 'number') return;
    const sanitizedState = { x: s.x, y: s.y, rot: s.rot, main: s.main, sub: s.sub };
    if (!checkSocketRate(socket.id, 'send_player_state', 60)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    if (!room.matchStats || room.matchConcluded) return;
    socket.broadcast.to(data.roomId).emit('receive_player_state', { state: sanitizedState, playerId: socket.id });
  });

  // Score is COSMETIC RELAY ONLY — does not affect match results, ELO, or any server state.
  // Server-authoritative data (garbage sent, chains) is tracked via recordGarbage/recordChain.
  socket.on('send_score', (data: { roomId: string, score: number }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (typeof data.score !== 'number' || !Number.isFinite(data.score) || data.score < 0 || data.score > 999999) return;
    if (!checkSocketRate(socket.id, 'send_score', 10)) return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    if (!room.matchStats || room.matchConcluded) return;
    socket.broadcast.to(data.roomId).emit('receive_score', { score: data.score, playerId: socket.id });
  });

  // Helper to handle match end, recording, and notifications
  const handleMatchEnd = async (roomId: string, loserSocketId: string, reason: 'lost' | 'disconnect') => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // CRITICAL: Atomic match conclusion to prevent dual-win race conditions
    // If both players AFK simultaneously, only the first one to arrive here will trigger the win.
    // The second player's loss is silently ignored (they already lost by being second).
    if (!room.concludeMatch(loserSocketId)) {
      // Match was already concluded - this player's loss event arrived second.
      // Do NOT broadcast opponent_lost again (would cause dual-win on client side).
      console.log(`[handleMatchEnd] Ignoring duplicate loss from ${loserSocketId} - match already resolved`);
      return;
    }

    if (reason === 'disconnect') {
      console.log(`User ${loserSocketId} disconnected from active room ${roomId} (ABORT)`);
      socket.broadcast.to(roomId).emit('opponent_left');
    } else {
      console.log(`Player ${loserSocketId} lost in room ${roomId}. Broadcasting win.`);
      socket.broadcast.to(roomId).emit('opponent_lost');
    }

    if (room.isRankedMatch()) {
      const playerIds = Array.from(room.players.keys());
      const winnerSocketId = playerIds.find(id => id !== loserSocketId);

      if (winnerSocketId) {
        const winner = room.players.get(winnerSocketId);
        const loser = room.players.get(loserSocketId);

        if (winner?.userId && loser?.userId) {
          const { player1Id, player2Id } = room.getPlayerUserIds();
          const isPlayer1Winner = winner.userId === player1Id;

          try {
            // Build Replay Data
            let replayData: any;

            // Only save replay if it was a distinct LOSS (not disconnect/abort)
            if (reason === 'lost') {
              const winnerIndex = room.getPlayerIndex(winnerSocketId) as 0 | 1;
              if (room.replayInputs.length > 0) {
                replayData = room.buildReplayFile(winnerIndex);
              } else {
                // Legacy fallback
                replayData = {
                  version: 1,
                  seed: room.matchStats?.startedAt.getTime() || Date.now(),
                  duration: room.getMatchDuration() || 0,
                  winnerId: winner.userId,
                  players: Array.from(room.players.values()).map(p => ({
                    id: p.id,
                    userId: p.userId,
                    name: p.name
                  })),
                  events: room.replayLog
                };
              }
            } else {
              // Aborted games do not save replays
              replayData = undefined;
            }

            const matchResult = await recordMatch({
              player1_id: player1Id!,
              player2_id: player2Id!,
              winner_id: winner.userId,
              room_id: roomId,
              duration_seconds: room.getMatchDuration(),
              player1_max_chain: room.matchStats?.player1MaxChain || 0,
              player2_max_chain: room.matchStats?.player2MaxChain || 0,
              player1_garbage_sent: room.matchStats?.player1GarbageSent || 0,
              player2_garbage_sent: room.matchStats?.player2GarbageSent || 0,
              started_at: room.matchStats?.startedAt,
              replay_data: replayData
            });

            if (matchResult) {
              console.log(`Match recorded: ${winner.userId} beat ${loser.userId}, ELO change: ${matchResult.elo_change}`);

              const winnerSocket = io.sockets.sockets.get(winnerSocketId);
              // Loser socket might be null if disconnected
              const loserSocket = io.sockets.sockets.get(loserSocketId);

              if (winnerSocket) {
                winnerSocket.emit('elo_update', {
                  new_elo: isPlayer1Winner ? matchResult.player1_elo_after : matchResult.player2_elo_after,
                  change: matchResult.elo_change
                });
              }
              if (loserSocket) {
                loserSocket.emit('elo_update', {
                  new_elo: isPlayer1Winner ? matchResult.player2_elo_after : matchResult.player1_elo_after,
                  change: -matchResult.elo_change
                });
              }

              io.emit('leaderboard_update');
            }
          } catch (error) {
            console.error('Failed to record match:', error);
          }
        }
      }
    }

    // Emit game_ended to all players so clients can clean up their lobby state
    io.to(roomId).emit('game_ended', {
      roomId: room.id,
      reason
    });

    // Clean up: remove players from socket.io room and delete game room
    // Give a short delay so clients can process game_ended
    setTimeout(() => {
      // Remove all players from socket.io room
      const playerIds = Array.from(room.players.keys());
      for (const pid of playerIds) {
        const playerSocket = io.sockets.sockets.get(pid);
        if (playerSocket) {
          playerSocket.leave(roomId);
        }
      }
      // Delete the room
      roomManager.deleteRoom(roomId);
      console.log(`Room ${roomId} cleaned up after game end`);
      broadcastRoomList();
    }, 1000);
  };

  socket.on('player_lost', async (data: { roomId: string }) => {
    if (!data || typeof data.roomId !== 'string') return;
    const room = roomManager.getRoom(data.roomId);
    if (!room || !room.players.has(socket.id)) return;
    // Match must be active and not already concluded
    if (!room.matchStats || room.matchConcluded) return;
    console.log(`[Server] player_lost received from ${socket.id} for room ${data.roomId}`);
    await handleMatchEnd(data.roomId, socket.id, 'lost');
  });

  socket.on('leave_room', (data: { roomId: string }) => {
    if (!data || typeof data.roomId !== 'string') return;
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      console.log(`Player ${socket.id} leaving room ${data.roomId}`);
      room.removePlayer(socket.id);
      socket.leave(data.roomId);
      if (room.playerCount === 0) {
        roomManager.deleteRoom(data.roomId);
        console.log(`Room ${data.roomId} deleted (empty)`);
      } else {
        // Notify remaining players
        io.to(data.roomId).emit('opponent_left', { id: socket.id });
        io.to(data.roomId).emit('room_update', {
          roomId: room.id,
          players: room.getPlayersForClient(),
          maxPlayers: room.settings.maxPlayers,
          settings: room.settings
        });
      }
      broadcastRoomList();
    }
  });

  socket.on('requeue', (data: { roomId: string }) => {
    if (!data || typeof data.roomId !== 'string') return;
    if (!checkSocketRate(socket.id, 'requeue', 2)) return;
    console.log(`Player ${socket.id} requesting requeue from room ${data.roomId}`);

    // Step 1: Clean up current room
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      socket.broadcast.to(data.roomId).emit('opponent_left');
      room.removePlayer(socket.id);
      socket.leave(data.roomId);
      if (room.playerCount === 0) {
        roomManager.deleteRoom(data.roomId);
        console.log(`Room ${data.roomId} deleted (player requeued)`);
      }
    }

    // Step 2: Remove from both queues
    removeFromQueues(socket.id);

    // Step 3: Confirm requeue to client (reset their state)
    socket.emit('requeue_confirmed');

    // Step 4: Add back to unranked matchmaking queue (default)
    unrankedQueue.push(socket.id);
    console.log(`User ${socket.id} requeued. Unranked queue size: ${unrankedQueue.length}`);
    broadcastQueueUpdate();

    // Step 5: Check for match immediately (unranked)
    if (unrankedQueue.length >= 2) {
      const p1 = unrankedQueue.shift()!;
      const p2 = unrankedQueue.shift()!;
      broadcastQueueUpdate();

      const newRoom = roomManager.createRoom();
      const socket1 = io.sockets.sockets.get(p1);
      const socket2 = io.sockets.sockets.get(p2);
      const auth1 = authenticatedUsers.get(p1);
      const auth2 = authenticatedUsers.get(p2);

      if (socket1 && socket2) {
        newRoom.addPlayer({ id: p1, name: auth1?.username || `Player ${p1.substring(0, 4)}`, ready: true, userId: auth1?.userId, authToken: auth1?.token });
        newRoom.addPlayer({ id: p2, name: auth2?.username || `Player ${p2.substring(0, 4)}`, ready: true, userId: auth2?.userId, authToken: auth2?.token });

        socket1.join(newRoom.id);
        socket2.join(newRoom.id);

        console.log(`Unranked match found (requeue): ${p1} vs ${p2} in room ${newRoom.id}`);

        io.to(newRoom.id).emit('match_found', {
          roomId: newRoom.id,
          opponent: 'Opponent',
          ranked: false,
          players: [
            { username: auth1?.username || `Player ${p1.substring(0, 4)}`, elo: auth1?.elo || 0 },
            { username: auth2?.username || `Player ${p2.substring(0, 4)}`, elo: auth2?.elo || 0 }
          ]
        });

        io.to(newRoom.id).emit('player_joined', { id: p2, count: 2 });

        setTimeout(() => {
          newRoom.startMatch();
          const replayerIds = Array.from(newRoom.players.keys());
          io.to(newRoom.id).emit('game_start', { seed: Date.now(), roomId: newRoom.id, players: replayerIds });
        }, 3000);
      }
    }
  });

  // ═══════════════════════════════════════════════════════
  // PUYO MINES (Quick Play) — Persistent FFA Room
  // ═══════════════════════════════════════════════════════

  /** Helper: broadcast current mines state to all players in the room */
  const broadcastMinesState = () => {
    io.to('MINES_LOBBY').emit('mines_state', minesRoom.getState());
  };

  /** Helper: broadcast compact player list (for sidebar updates) */
  const broadcastMinesPlayerList = () => {
    io.to('MINES_LOBBY').emit('mines_player_list', minesRoom.getPlayerList());
  };

  socket.on('join_mines', () => {
    if (!checkSocketRate(socket.id, 'join_mines', 2)) return;
    const auth = authenticatedUsers.get(socket.id);
    let username = auth?.username || `Guest_${socket.id.substring(0, 6)}`;
    // Sanitize and cap username length
    if (typeof username !== 'string' || username.trim().length === 0) {
      username = `Player_${socket.id.substring(0, 6)}`;
    }
    username = username.substring(0, 32).replace(/[\x00-\x1F\x7F]/g, '');

    const added = minesRoom.addPlayer({
      socketId: socket.id,
      username,
      userId: auth?.userId,
      avatarUrl: auth?.avatar_url,
      elo: auth?.elo,
    });

    if (!added) {
      // Already in mines, treat as rejoin/respawn
      minesRoom.respawnPlayer(socket.id);
    }

    socket.join('MINES_LOBBY');
    console.log(`[Mines] ${username} joined. Players: ${minesRoom.players.size}`);

    // Send current seed + full state to the joining player
    socket.emit('mines_joined', {
      seed: minesRoom.seed,
      state: minesRoom.getState(),
      yourSocketId: socket.id,
    });

    // Notify everyone
    io.to('MINES_LOBBY').emit('mines_player_joined', {
      socketId: socket.id,
      username,
      userId: auth?.userId,
      avatarUrl: auth?.avatar_url,
    });

    minesRoom.updateBotPresence();
    broadcastMinesPlayerList();
  });

  socket.on('leave_mines', () => {
    if (!checkSocketRate(socket.id, 'leave_mines', 2)) return;
    const player = minesRoom.players.get(socket.id);
    if (!player) return;

    console.log(`[Mines] ${player.username} left. Players: ${minesRoom.players.size - 1}`);
    minesRoom.removePlayer(socket.id);
    socket.leave('MINES_LOBBY');

    io.to('MINES_LOBBY').emit('mines_player_left', { socketId: socket.id });
    minesRoom.updateBotPresence();
    broadcastMinesPlayerList();
  });

  socket.on('mines_respawn', () => {
    if (!checkSocketRate(socket.id, 'mines_respawn', 2)) return; // Max 2 respawns/sec
    const player = minesRoom.players.get(socket.id);
    if (!player || player.alive) return; // Must be dead to respawn

    minesRoom.respawnPlayer(socket.id);
    console.log(`[Mines] ${player.username} respawned`);

    // Send new seed for fresh piece sequence
    socket.emit('mines_respawned', { seed: Date.now() });
    broadcastMinesPlayerList();
  });

  socket.on('mines_set_target', (data: { mode: string }) => {
    if (!data || typeof data.mode !== 'string') return;
    if (!checkSocketRate(socket.id, 'mines_set_target', 5)) return;
    const valid = ['random', 'attackers', 'badges', 'vulnerable'];
    if (!valid.includes(data.mode)) return;
    const targetPlayer = minesRoom.players.get(socket.id);
    if (!targetPlayer) return;

    minesRoom.setTargetingMode(socket.id, data.mode as any);
    socket.emit('mines_target_updated', {
      mode: targetPlayer.targetingMode,
      targetSocketId: targetPlayer.currentTarget,
      targetUsername: targetPlayer.currentTarget
        ? minesRoom.players.get(targetPlayer.currentTarget)?.username
        : null,
    });
  });

  socket.on('mines_send_garbage', (data: { amount: number, chainLength?: number }) => {
    if (!data || typeof data.amount !== 'number' || !Number.isInteger(data.amount) || data.amount <= 0 || data.amount > 100) return;
    if (data.chainLength !== undefined && (typeof data.chainLength !== 'number' || !Number.isInteger(data.chainLength) || data.chainLength < 1 || data.chainLength > 25)) return;
    if (!checkSocketRate(socket.id, 'mines_send_garbage', 30)) return;
    // Must be an alive player in the mines lobby
    const sender = minesRoom.players.get(socket.id);
    if (!sender || !sender.alive) return;

    const result = minesRoom.processGarbage(socket.id, data.amount, data.chainLength || 0);
    if (!result) return;

    // Send garbage only to the target player
    const targetSocket = io.sockets.sockets.get(result.targetSocketId);
    if (targetSocket) {
      targetSocket.emit('mines_receive_garbage', {
        amount: result.amount,
        fromSocketId: socket.id,
        fromUsername: minesRoom.players.get(socket.id)?.username || '???',
      });
    }

    // Broadcast updated player list (garbage stats changed)
    broadcastMinesPlayerList();
  });

  socket.on('mines_board_state', (data: { grid: number[][] }) => {
    if (!isValidGrid(data?.grid)) return;
    if (!checkSocketRate(socket.id, 'mines_board_state', 10)) return;
    // Must be an alive player in the mines lobby
    const boardPlayer = minesRoom.players.get(socket.id);
    if (!boardPlayer || !boardPlayer.alive) return;
    minesRoom.updateBoard(socket.id, data.grid);

    // Relay board to everyone for sidebar mini-boards (optional, can be expensive)
    // Only send to players targeting this player for efficiency
    for (const [id, p] of minesRoom.players) {
      if (p.currentTarget === socket.id && id !== socket.id) {
        const s = io.sockets.sockets.get(id);
        if (s) {
          s.emit('mines_target_board', { grid: data.grid, socketId: socket.id });
        }
      }
    }
  });

  socket.on('mines_score_update', (data: { score: number }) => {
    if (!data || typeof data.score !== 'number' || !Number.isFinite(data.score)) return;
    if (data.score < 0 || data.score > 100_000_000) return;
    if (!checkSocketRate(socket.id, 'mines_score_update', 10)) return;
    const player = minesRoom.players.get(socket.id);
    if (!player || !player.alive) return;
    // Score must not decrease (prevent manipulation)
    if (data.score < player.score) return;
    const depth = minesRoom.updateScore(socket.id, data.score);

    // Periodically broadcast updated player list
    // (to avoid flooding, client should throttle score updates)
    broadcastMinesPlayerList();
  });

  socket.on('mines_player_died', () => {
    if (!checkSocketRate(socket.id, 'mines_player_died', 3)) return;
    const player = minesRoom.players.get(socket.id);
    if (!player || !player.alive) return;

    // Find who was targeting this player — they get the KO credit
    for (const [id, p] of minesRoom.players) {
      if (p.alive && p.currentTarget === socket.id && id !== socket.id) {
        minesRoom.recordKO(id);
        const killerSocket = io.sockets.sockets.get(id);
        if (killerSocket) {
          killerSocket.emit('mines_ko', {
            targetUsername: player.username,
            totalKOs: p.kos,
          });
        }
        break; // Only one KO credit per death
      }
    }

    const deadPlayer = minesRoom.killPlayer(socket.id);
    if (deadPlayer) {
      console.log(`[Mines] ${deadPlayer.username} died at depth ${deadPlayer.depth}`);
      io.to('MINES_LOBBY').emit('mines_player_died_broadcast', {
        socketId: socket.id,
        username: deadPlayer.username,
        depth: deadPlayer.depth,
      });
      broadcastMinesPlayerList();
    }
  });

  // ═══════════════════════════════════════════════════════
  // END PUYO MINES
  // ═══════════════════════════════════════════════════════

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.id}`);
    if (removeFromQueues(socket.id)) {
      broadcastQueueUpdate();
    }

    // Clean up mines lobby
    if (minesRoom.players.has(socket.id)) {
      const player = minesRoom.players.get(socket.id);
      console.log(`[Mines] ${player?.username} disconnected`);
      minesRoom.removePlayer(socket.id);
      io.to('MINES_LOBBY').emit('mines_player_left', { socketId: socket.id });
      minesRoom.updateBotPresence();
      broadcastMinesPlayerList();
    }

    // Check if user was in a room and HANDLE ABORT/LOSS
    const room = roomManager.findRoomByPlayer(socket.id);
    if (room) {
      await handleMatchEnd(room.id, socket.id, 'disconnect');
    }

    authenticatedUsers.delete(socket.id);
    socketEventTimestamps.delete(socket.id);
    socketIPs.delete(socket.id);
  });
});

// Startup
(async () => {
  // Start listening IMMEDIATELY - Don't wait for API check
  httpServer.listen(Number(port), "0.0.0.0", () => {
    console.log(`🎮 Puyo Game Server running on port ${port}`);
  });

  // Stale room cleanup — runs every 5 minutes
  const STALE_ROOM_INTERVAL = 5 * 60 * 1000;
  const IDLE_ROOM_MAX_AGE = 30 * 60 * 1000;    // 30 min for rooms with no active match
  const ACTIVE_ROOM_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours safety net for active matches

  setInterval(() => {
    const now = Date.now();
    const rooms = roomManager.getAllRooms();
    for (const room of rooms) {
      const age = now - room.createdAt;
      const isPlaying = !!room.matchStats;
      const isEmpty = room.playerCount === 0;

      if (isEmpty || (!isPlaying && age > IDLE_ROOM_MAX_AGE) || (isPlaying && age > ACTIVE_ROOM_MAX_AGE)) {
        console.log(`[Cleanup] Removing stale room ${room.id} (age=${Math.round(age / 60000)}min, players=${room.playerCount}, playing=${isPlaying})`);
        // Notify any remaining players
        io.to(room.id).emit('room_closed', { reason: 'Room timed out due to inactivity' });
        // Remove players from socket.io room
        for (const pid of room.players.keys()) {
          const playerSocket = io.sockets.sockets.get(pid);
          if (playerSocket) playerSocket.leave(room.id);
        }
        roomManager.deleteRoom(room.id);
      }
    }
    // Broadcast updated room list after cleanup
    const publicRooms = roomManager.getAllRooms()
      .filter(r => !r.isPrivate)
      .map(r => ({
        id: r.id,
        name: `Room ${r.id.substring(0, 4)}`,
        players: r.playerCount,
        maxPlayers: r.maxPlayers,
        status: r.matchStats ? 'playing' : 'waiting',
        isPrivate: false
      }));
    io.emit('room_list_update', publicRooms);
  }, STALE_ROOM_INTERVAL);

  // ── Board state heartbeat — auto-forfeit players who stop sending board updates ──
  // If a player doesn't send a board state for 20 seconds during an active match,
  // they are auto-forfeited. This prevents: hiding board, refusing to die, AFK stalling.
  // Also detects topped-out boards (death column filled for 3+ seconds).
  const HEARTBEAT_INTERVAL = 5_000; // Check every 5 seconds
  const HEARTBEAT_TIMEOUT = 20_000; // 20 seconds without board update = forfeit
  const HEARTBEAT_GRACE = 10_000;   // Don't check until 10s after match start (loading grace)
  const DEATH_SUSPECT_TIMEOUT = 3_000; // 3 seconds with grid[2][2] filled = forced death

  setInterval(() => {
    const now = Date.now();
    const rooms = roomManager.getAllRooms();
    for (const room of rooms) {
      if (!room.matchStats || room.matchConcluded) continue;
      const matchAge = now - room.matchStats.startedAt.getTime();
      if (matchAge < HEARTBEAT_GRACE) continue; // Still in grace period

      for (const [socketId, player] of room.players) {
        const lastUpdate = player.lastBoardUpdate || 0;
        let shouldForfeit = false;
        let reason = '';

        // Check 1: No board state sent for 20 seconds
        if (now - lastUpdate > HEARTBEAT_TIMEOUT) {
          shouldForfeit = true;
          reason = `no board state for ${Math.round((now - lastUpdate) / 1000)}s`;
        }
        // Check 2: Board topped out (kill column blocked) for 3+ seconds
        else if (player.deathSuspectSince && now - player.deathSuspectSince > DEATH_SUSPECT_TIMEOUT) {
          shouldForfeit = true;
          reason = `board topped out for ${Math.round((now - player.deathSuspectSince) / 1000)}s`;
        }

        if (shouldForfeit) {
          console.log(`[Heartbeat] Player ${player.name} (${socketId}) in room ${room.id}: ${reason}. Auto-forfeiting.`);
          if (!room.concludeMatch(socketId)) continue; // Already concluded
          const playerSocket = io.sockets.sockets.get(socketId);
          if (playerSocket) {
            playerSocket.broadcast.to(room.id).emit('opponent_lost');
          } else {
            io.to(room.id).emit('opponent_lost');
          }
          // Emit game_ended
          io.to(room.id).emit('game_ended', { roomId: room.id, reason: 'timeout' });
          // Clean up after delay
          setTimeout(() => {
            for (const pid of room.players.keys()) {
              const ps = io.sockets.sockets.get(pid);
              if (ps) ps.leave(room.id);
            }
            roomManager.deleteRoom(room.id);
          }, 1000);
          break; // Only one player can forfeit per check cycle
        }
      }
    }
  }, HEARTBEAT_INTERVAL);

  // Check API health in background
  try {
    const apiHealthy = await checkApiHealth();
    if (apiHealthy) {
      console.log('✅ Connected to Puyo Live API');
    } else {
      console.log('⚠️  Puyo Live API not available - ranked matches will not be recorded');
    }
  } catch (err) {
    console.log('⚠️  Error checking API health:', err instanceof Error ? err.message : err);
  }
})();
