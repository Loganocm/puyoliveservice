import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { roomManager } from './RoomManager.js';
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
console.log(`🔒 CORS Origin configured: ${corsOrigin}`);

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
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false,
    allowedHeaders: ["*"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
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

// Separate queues for ranked and unranked matchmaking
let rankedQueue: string[] = [];
let unrankedQueue: string[] = [];

io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

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
    const isRanked = data.ranked || false;
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
      if (isRanked) {
        room.ranked = true;
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
          io.to(room.id).emit('game_start', { seed: Date.now(), roomId: room.id });
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

  socket.on('get_room_details', (data: { roomId: string }) => {
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      broadcastRoomUpdate(data.roomId); // Just broadcast to everyone to be safe/lazy, or emit back to socket
    }
  });

  socket.on('toggle_ready', (data: { roomId: string, ready: boolean }) => {
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      const player = room.players.get(socket.id);
      if (player) {
        player.ready = data.ready;
        console.log(`Player ${player.name} in room ${data.roomId} is now ${data.ready ? 'READY' : 'NOT READY'}`);
        broadcastRoomUpdate(data.roomId);
      }
    }
  });

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
    const room = roomManager.getRoom(roomId);
    if (room) {
      if (room.players.has(socket.id)) {
        console.log(`Starting game in room ${roomId}`);
        io.to(roomId).emit('game_start', { seed: Date.now() });
      } else {
        console.warn(`Unauthorized start_game attempt by ${socket.id} for room ${roomId}`);
      }
    }
  });

  socket.on('join_room', (roomId: string) => {
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
        // Successfully reconnected - join the socket.io room
        socket.join(roomId);
        socket.emit('reconnected', { roomId, message: 'Reconnected to match' });
        console.log(`[Reconnect] User ${auth.username} rejoined room ${roomId}`);
        return;
      }
    }

    // Not a reconnect - try to add as new player
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
        players,
        maxPlayers: room.maxPlayers
      });

    } else {
      socket.emit('error', { message: 'Room full' });
    }
  });

  // V2 Replay: Record player inputs
  socket.on('record_input', (data: { roomId: string, input: string }) => {
    const room = roomManager.getRoom(data.roomId);
    if (room && room.matchStats) {
      const playerIndex = room.getPlayerIndex(socket.id);
      room.recordInput(playerIndex, data.input as any);
    }
  });

  // V2 Replay: Tick frame counter (called by host/authoritative client)
  socket.on('tick_frame', (data: { roomId: string }) => {
    const room = roomManager.getRoom(data.roomId);
    if (room && room.matchStats) {
      room.tick();
    }
  });

  socket.on('send_garbage', (data: { roomId: string, amount: number, chainLength?: number }) => {
    // Track garbage stats
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      room.recordGarbage(socket.id, data.amount);
      if (data.chainLength) {
        room.recordChain(socket.id, data.chainLength);
        room.recordReplayEvent('chain', socket.id, { length: data.chainLength });
      }
      room.recordReplayEvent('garbage', socket.id, { amount: data.amount });
    }
    // Send to everyone else in the room
    socket.broadcast.to(data.roomId).emit('receive_garbage', { amount: data.amount });
  });

  socket.on('send_board_state', (data: { roomId: string, grid: number[][] }) => {
    // Relay board state to opponent
    socket.broadcast.to(data.roomId).emit('receive_board_state', { grid: data.grid, playerId: socket.id });

    // Record for replay (sampling or full?)
    // For a perfect replay we need every state change.
    // If bandwidth is concern, we can rely on moves, but board state is safer for sync.
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      room.recordReplayEvent('move', socket.id, { grid: data.grid });
    }

  });

  socket.on('send_player_state', (data: { roomId: string, state: any }) => {
    // Relay active piece state
    socket.broadcast.to(data.roomId).emit('receive_player_state', { state: data.state, playerId: socket.id });
  });

  socket.on('send_score', (data: { roomId: string, score: number }) => {
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

        if (winner?.userId && loser?.userId && winner.authToken) {
          const { player1Id, player2Id } = room.getPlayerUserIds();
          const isPlayer1Winner = winner.userId === player1Id;

          try {
            // Build Replay Data
            let replayData: any;

            // Only save replay if it was a distinct LOSS (not disconnect/abort)
            if (reason === 'lost') {
              const winnerIndex = room.getPlayerIndex(winnerSocketId);
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
            }, winner.authToken);

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

    if (reason === 'disconnect') {
      room.removePlayer(loserSocketId);
      if (room.playerCount === 0) {
        roomManager.deleteRoom(room.id);
      }
    }
  };

  socket.on('player_lost', async (data: { roomId: string }) => {
    console.log(`[Server] player_lost received from ${socket.id} for room ${data.roomId}`);
    await handleMatchEnd(data.roomId, socket.id, 'lost');
  });

  socket.on('leave_room', (data: { roomId: string }) => {
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      console.log(`Player ${socket.id} leaving room ${data.roomId}`);
      room.removePlayer(socket.id);
      socket.leave(data.roomId);
      if (room.playerCount === 0) {
        roomManager.deleteRoom(data.roomId);
        console.log(`Room ${data.roomId} deleted (empty)`);
      }
    }
  });

  socket.on('requeue', (data: { roomId: string }) => {
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

      if (socket1 && socket2) {
        newRoom.addPlayer({ id: p1, name: `Player ${p1.substring(0, 4)}`, ready: true });
        newRoom.addPlayer({ id: p2, name: `Player ${p2.substring(0, 4)}`, ready: true });

        socket1.join(newRoom.id);
        socket2.join(newRoom.id);

        console.log(`Unranked match found (requeue): ${p1} vs ${p2} in room ${newRoom.id}`);

        const auth1 = authenticatedUsers.get(p1);
        const auth2 = authenticatedUsers.get(p2);

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
          io.to(newRoom.id).emit('game_start', { seed: Date.now(), roomId: newRoom.id });
        }, 3000);
      }
    }
  });

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.id}`);
    if (removeFromQueues(socket.id)) {
      broadcastQueueUpdate();
    }

    // Check if user was in a room and HANDLE ABORT/LOSS
    const room = roomManager.findRoomByPlayer(socket.id);
    if (room) {
      await handleMatchEnd(room.id, socket.id, 'disconnect');
    }

    authenticatedUsers.delete(socket.id);
  });
});

// Startup
(async () => {
  // Start listening IMMEDIATELY - Don't wait for API check
  httpServer.listen(Number(port), "0.0.0.0", () => {
    console.log(`🎮 Puyo Game Server running on port ${port}`);
    console.log(`📡 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`}`);
  });

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
