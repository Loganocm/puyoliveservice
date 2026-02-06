import { Server, Socket } from 'socket.io';
import { roomManager } from './RoomManager.js';
import { AuthService } from '../services/auth.service.js';
import { MatchService } from '../services/match.service.js';

// Track authenticated users: socket.id -> { userId, token }
const authenticatedUsers = new Map<string, { userId: number; token: string; username: string; elo?: number }>();

// Separate queues for ranked and unranked matchmaking
let rankedQueue: string[] = [];
let unrankedQueue: string[] = [];

export function initializeSocket(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.log(`User connected: ${socket.id}`);

        socket.emit('welcome', {
            message: 'Connected to Puyo Server (Integrated)',
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
                const user = await AuthService.verifyToken(data.token);
                if (user) {
                    authenticatedUsers.set(socket.id, {
                        userId: user.id,
                        token: data.token,
                        username: user.username,
                        elo: user.elo_rating
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

        socket.on('join_queue', (data: { ranked?: boolean } = {}) => {
            const isRanked = data.ranked || false;
            const queueName = isRanked ? 'ranked' : 'unranked';
            const queue = isRanked ? rankedQueue : unrankedQueue;

            // Prevent duplicates in both queues
            if (!rankedQueue.includes(socket.id) && !unrankedQueue.includes(socket.id)) {
                queue.push(socket.id);
                console.log(`User ${socket.id} joined ${queueName} queue. Queue size: ${queue.length}`);

                // Update everyone with both queue counts
                io.emit('queue_update', {
                    count: rankedQueue.length + unrankedQueue.length,
                    ranked: rankedQueue.length,
                    unranked: unrankedQueue.length
                });
            }

            // Try to match players from the same queue
            if (queue.length >= 2) {
                const p1 = queue.shift()!;
                const p2 = queue.shift()!;

                // Notify everyone of new queue size immediately
                io.emit('queue_update', {
                    count: rankedQueue.length + unrankedQueue.length,
                    ranked: rankedQueue.length,
                    unranked: unrankedQueue.length
                });

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
                    }

                    // Prepare player data for VS screen
                    io.to(room.id).emit('match_found', {
                        roomId: room.id,
                        opponent: 'Opponent',
                        ranked: isRanked,
                        players: [
                            { id: p1, username: auth1?.username || `Player ${p1.substring(0, 4)}`, elo: auth1?.elo || 0 },
                            { id: p2, username: auth2?.username || `Player ${p2.substring(0, 4)}`, elo: auth2?.elo || 0 }
                        ]
                    });

                    socket1.emit('room_created', { roomId: room.id });
                    socket2.emit('room_created', { roomId: room.id });

                    io.to(room.id).emit('player_joined', { id: p2, count: 2 });

                    // Auto-start game after short delay
                    setTimeout(() => {
                        room.startMatch();
                        // Send players array so clients know who is who (for filtering ghosts)
                        io.to(room.id).emit('game_start', { seed: Date.now(), roomId: room.id, players: [p1, p2] });
                    }, 3000);
                }
            }
        });

        socket.on('leave_queue', () => {
            rankedQueue = rankedQueue.filter((id: string) => id !== socket.id);
            unrankedQueue = unrankedQueue.filter((id: string) => id !== socket.id);
            console.log(`User ${socket.id} left queue.`);

            // Notify everyone
            io.emit('queue_update', {
                count: rankedQueue.length + unrankedQueue.length,
                ranked: rankedQueue.length,
                unranked: unrankedQueue.length
            });
        });

        socket.on('create_room', () => {
            const room = roomManager.createRoom();
            room.addPlayer({ id: socket.id, name: `Player ${socket.id.substring(0, 4)}`, ready: false });
            socket.join(room.id);
            socket.emit('room_created', { roomId: room.id });
            console.log(`Room created: ${room.id}`);
        });

        socket.on('start_game', (roomId: string) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                console.log(`Starting game in room ${roomId}`);
                io.to(roomId).emit('game_start', { seed: Date.now() }); // Send a seed so RNG is same (prepared for future)
            }
        });

        socket.on('join_room', (roomId: string) => {
            const room = roomManager.getRoom(roomId);
            if (room) {
                if (room.addPlayer({ id: socket.id, name: `Player ${socket.id.substring(0, 4)}`, ready: false })) {
                    socket.join(roomId);
                    console.log(`${socket.id} joined room ${roomId}`);
                    io.to(roomId).emit('player_joined', { id: socket.id, count: room.playerCount });
                } else {
                    socket.emit('error', { message: 'Room full' });
                }
            } else {
                socket.emit('error', { message: 'Room not found' });
            }
        });

        socket.on('send_garbage', (data: { roomId: string, amount: number, chainLength?: number }) => {
            // Track garbage stats
            const room = roomManager.getRoom(data.roomId);
            if (room) {
                room.recordGarbage(socket.id, data.amount);
                if (data.chainLength) {
                    room.recordChain(socket.id, data.chainLength);
                }
            }
            // Send to everyone else in the room
            socket.broadcast.to(data.roomId).emit('receive_garbage', { amount: data.amount });
        });

        socket.on('send_board_state', (data: { roomId: string, grid: number[][], garbageTray?: number }) => {
            // Relay board state to opponent
            socket.broadcast.to(data.roomId).emit('receive_board_state', {
                grid: data.grid,
                garbageTray: data.garbageTray || 0,
                playerId: socket.id
            });
        });

        socket.on('send_player_state', (data: { roomId: string, state: any }) => {
            // Relay active piece state
            socket.broadcast.to(data.roomId).emit('receive_player_state', { state: data.state, playerId: socket.id });
        });

        socket.on('player_lost', async (data: { roomId: string }) => {
            // Logic: sender LOST. Broadcast to everyone else that "opponent lost" (so they win).
            // We do NOT send this back to sender. Sender already knows they lost.
            console.log(`Player ${socket.id} lost in room ${data.roomId}. Broadcasting win.`);
            socket.broadcast.to(data.roomId).emit('opponent_lost');

            // Record match result to API if this is a ranked match
            const room = roomManager.getRoom(data.roomId);
            if (room && room.isRankedMatch()) {
                const playerIds = Array.from(room.players.keys());
                const loserSocketId = socket.id;
                const winnerSocketId = playerIds.find(id => id !== loserSocketId);

                if (winnerSocketId) {
                    const winner = room.players.get(winnerSocketId);
                    const loser = room.players.get(loserSocketId);

                    if (winner?.userId && loser?.userId && winner.authToken) {
                        const { player1Id, player2Id } = room.getPlayerUserIds();

                        const isPlayer1Winner = winner.userId === player1Id;

                        try {
                            // Call MatchService directly instead of HTTP 
                            const matchResult = await MatchService.recordMatch({
                                player1_id: player1Id!,
                                player2_id: player2Id!,
                                winner_id: winner.userId,
                                room_id: data.roomId,
                                duration_seconds: room.getMatchDuration(),
                                player1_max_chain: room.matchStats?.player1MaxChain || 0,
                                player2_max_chain: room.matchStats?.player2MaxChain || 0,
                                player1_garbage_sent: room.matchStats?.player1GarbageSent || 0,
                                player2_garbage_sent: room.matchStats?.player2GarbageSent || 0,
                                started_at: room.matchStats?.startedAt
                            });

                            if (matchResult) {
                                const { match, player1_stats, player2_stats } = matchResult;
                                console.log(`Match recorded: ${winner.userId} beat ${loser.userId}, ELO change: ${player1_stats.elo_change}`);

                                // Notify players of ELO changes and XP
                                const winnerSocket = io.sockets.sockets.get(winnerSocketId);
                                const loserSocket = io.sockets.sockets.get(loserSocketId);

                                if (winnerSocket) {
                                    // Winner is either P1 or P2
                                    const stats = isPlayer1Winner ? player1_stats : player2_stats;
                                    winnerSocket.emit('match_result', {
                                        matchId: match.id,
                                        result: 'win',
                                        xp_gained: stats.xp_gained,
                                        new_level: stats.level,
                                        new_xp: stats.xp,
                                        elo_change: stats.elo_change, // This is positive
                                        new_elo: stats.new_elo
                                    });
                                    // Keep legacy event for now just in case
                                    winnerSocket.emit('elo_update', {
                                        new_elo: stats.new_elo,
                                        change: stats.elo_change
                                    });
                                }
                                if (loserSocket) {
                                    const stats = isPlayer1Winner ? player2_stats : player1_stats;
                                    loserSocket.emit('match_result', {
                                        matchId: match.id,
                                        result: 'loss',
                                        xp_gained: stats.xp_gained,
                                        new_level: stats.level,
                                        new_xp: stats.xp,
                                        elo_change: stats.elo_change, // This is negative
                                        new_elo: stats.new_elo
                                    });
                                    // Keep legacy event
                                    loserSocket.emit('elo_update', {
                                        new_elo: stats.new_elo,
                                        change: stats.elo_change
                                    });
                                }
                            }
                        } catch (error) {
                            console.error('Failed to record match:', error);
                        }
                    }
                }
            }
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
                // Notify opponent that this player left (they win if game was ongoing)
                socket.broadcast.to(data.roomId).emit('opponent_left');

                room.removePlayer(socket.id);
                socket.leave(data.roomId);

                // Delete room if empty
                if (room.playerCount === 0) {
                    roomManager.deleteRoom(data.roomId);
                    console.log(`Room ${data.roomId} deleted (player requeued)`);
                }
            }

            // Step 2: Remove from both queues if somehow still there
            rankedQueue = rankedQueue.filter((id: string) => id !== socket.id);
            unrankedQueue = unrankedQueue.filter((id: string) => id !== socket.id);

            // Step 3: Confirm requeue to client (reset their state)
            socket.emit('requeue_confirmed');

            // Step 4: Add back to unranked matchmaking queue (default)
            unrankedQueue.push(socket.id);
            console.log(`User ${socket.id} requeued. Unranked queue size: ${unrankedQueue.length}`);

            // Update everyone with new queue count
            io.emit('queue_update', {
                count: rankedQueue.length + unrankedQueue.length,
                ranked: rankedQueue.length,
                unranked: unrankedQueue.length
            });

            // Step 5: Check for match immediately (unranked)
            if (unrankedQueue.length >= 2) {
                const p1 = unrankedQueue.shift()!;
                const p2 = unrankedQueue.shift()!;

                io.emit('queue_update', {
                    count: rankedQueue.length + unrankedQueue.length,
                    ranked: rankedQueue.length,
                    unranked: unrankedQueue.length
                });

                const newRoom = roomManager.createRoom();

                const socket1 = io.sockets.sockets.get(p1);
                const socket2 = io.sockets.sockets.get(p2);

                if (socket1 && socket2) {
                    newRoom.addPlayer({ id: p1, name: `Player ${p1.substring(0, 4)}`, ready: true });
                    newRoom.addPlayer({ id: p2, name: `Player ${p2.substring(0, 4)}`, ready: true });

                    socket1.join(newRoom.id);
                    socket2.join(newRoom.id);

                    console.log(`Unranked match found (requeue): ${p1} vs ${p2} in room ${newRoom.id}`);

                    // Get auth info for new room
                    const auth1 = authenticatedUsers.get(p1);
                    const auth2 = authenticatedUsers.get(p2);

                    io.to(newRoom.id).emit('match_found', {
                        roomId: newRoom.id,
                        opponent: 'Opponent',
                        ranked: false,
                        players: [
                            { id: p1, username: auth1?.username || `Player ${p1.substring(0, 4)}`, elo: auth1?.elo || 0 },
                            { id: p2, username: auth2?.username || `Player ${p2.substring(0, 4)}`, elo: auth2?.elo || 0 }
                        ]
                    });

                    io.to(newRoom.id).emit('player_joined', { id: p2, count: 2 });

                    setTimeout(() => {
                        io.to(newRoom.id).emit('game_start', { seed: Date.now(), roomId: newRoom.id, players: [p1, p2] });
                    }, 3000);
                }
            }
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.id}`);
            rankedQueue = rankedQueue.filter((id: string) => id !== socket.id);
            unrankedQueue = unrankedQueue.filter((id: string) => id !== socket.id);

            // Clean up authenticated user tracking
            authenticatedUsers.delete(socket.id);

            // Find room and notify opponent
            const room = roomManager.findRoomByPlayer(socket.id);
            if (room) {
                console.log(`Player ${socket.id} disconnected from room ${room.id}`);
                room.removePlayer(socket.id);

                // Notify remaining players (Opponent wins)
                // Using 'opponent_lost' triggers the "YOU WIN" state on the remaining client
                socket.broadcast.to(room.id).emit('opponent_lost');

                // If room is empty, delete it
                if (room.playerCount === 0) {
                    roomManager.deleteRoom(room.id);
                }
            }
        });
    });
}
