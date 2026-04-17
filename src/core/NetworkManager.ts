import { io, Socket } from 'socket.io-client';

type NetworkCallback = (...args: any[]) => void;

export class NetworkManager {
    private static socket: Socket | null = null;
    public static isConnected: boolean = false;
    private static listeners: Map<string, NetworkCallback[]> = new Map();
    private static lastMinesPlayerList: any[] = [];

    public static serverUrl: string = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:3000' : 'https://game.puyo.live');

    public static connect(url: string | null = null) {
        // If already connected, skip
        if (this.socket?.connected) {
            console.log('[NetworkManager] Already connected, skipping');
            return;
        }

        // If socket exists but disconnected, clean it up first
        if (this.socket) {
            console.log('[NetworkManager] Socket exists but disconnected, cleaning up...');
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }

        // Auto-detect URL
        if (!url) {
            // Only allow query param override in development (prevents URL injection attacks in production)
            const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (isDev) {
                const params = new URLSearchParams(window.location.search);
                url = params.get('server') ||
                    import.meta.env.VITE_SOCKET_URL ||
                    import.meta.env.VITE_SERVER_URL ||
                    'http://localhost:3000';
            } else {
                url = import.meta.env.VITE_SOCKET_URL ||
                    import.meta.env.VITE_SERVER_URL ||
                    'https://game.puyo.live';
            }
        }

        const finalUrl = url!;
        this.serverUrl = finalUrl;
        console.log(`Connecting to ${finalUrl}...`);
        this.socket = io(finalUrl, {
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 20000,
            withCredentials: false,
            transports: ['websocket', 'polling'] // Try websocket first, fallback to polling
        });

        this.socket.on('connect', () => {
            console.log('Connected to server:', this.socket?.id);
            this.isConnected = true;
            this.emit('connect');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.emit('disconnect');
        });

        this.socket.on('welcome', (data: { message: string, id: string }) => {
            console.log('Server says:', data.message);
        });

        this.socket.on('room_created', (data: { roomId: string }) => {
            this.emit('room_created', data);
        });

        this.socket.on('queue_update', (data: { count: number, ranked: number, unranked: number }) => {
            this.emit('queue_update', data);
        });

        this.socket.on('match_found', (data: { roomId: string }) => {
            console.log("Match found!", data.roomId);
            this.emit('match_found', data);
        });

        this.socket.on('player_joined', (data: { id: string, count: number }) => {
            this.emit('player_joined', data);
        });

        this.socket.on('game_start', (data: { seed: number }) => {
            this.emit('game_start', data);
        });

        this.socket.on('receive_garbage', (data: { amount: number }) => {
            this.emit('receive_garbage', data);
        });

        this.socket.on('receive_board_state', (data: { grid: number[][], garbageTray?: number, playerId: string }) => {
            this.emit('receive_board_state', data);
        });

        this.socket.on('receive_player_state', (data: { state: any, playerId: string }) => {
            this.emit('receive_player_state', data);
        });

        this.socket.on('receive_score', (data: { score: number, playerId: string }) => {
            this.emit('receive_score', data);
        });

        this.socket.on('opponent_lost', () => {
            this.emit('opponent_lost');
        });

        this.socket.on('opponent_left', () => {
            this.emit('opponent_left');
        });

        this.socket.on('requeue_confirmed', () => {
            console.log("Requeue confirmed by server");
            this.emit('requeue_confirmed');
        });

        this.socket.on('leaderboard_update', () => {
            this.emit('leaderboard_update');
        });

        this.socket.on('elo_update', (data: { new_elo: number, change: number }) => {
            this.emit('elo_update', data);
        });

        this.socket.on('match_result', (data: any) => {
            console.log("Network: Received match_result", data);
            this.emit('match_result', data);
        });

        this.socket.on('game_ended', (data: any) => {
            console.log("Network: Game Ended", data);
            this.emit('game_ended', data);
        });

        this.socket.on('room_settings_update', (data: any) => {
            this.emit('room_settings_update', data);
        });

        this.socket.on('error', (data: { message: string }) => {
            console.error('[NetworkManager] Error:', data.message);
            this.emit('error', data);
        });

        this.socket.on('reconnected', (data: { roomId: string, message: string }) => {
            console.log('[NetworkManager] Reconnected to room:', data.roomId);
            this.emit('reconnected', data);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection Error:', error);
        });

        this.socket.on('room_list_update', (rooms: any[]) => {
            this.emit('room_list_update', rooms);
        });

        this.socket.on('room_update', (data: any) => {
            this.emit('room_update', data);
        });

        // ── Puyo Mines (Quick Play) events ──
        this.socket.on('mines_joined', (data: any) => {
            this.emit('mines_joined', data);
        });

        this.socket.on('mines_state', (data: any) => {
            this.emit('mines_state', data);
        });

        this.socket.on('mines_player_list', (data: any) => {
            this.lastMinesPlayerList = data;
            this.emit('mines_player_list', data);
        });

        this.socket.on('mines_player_joined', (data: any) => {
            this.emit('mines_player_joined', data);
        });

        this.socket.on('mines_player_left', (data: any) => {
            this.emit('mines_player_left', data);
        });

        this.socket.on('mines_receive_garbage', (data: any) => {
            this.emit('mines_receive_garbage', data);
        });

        this.socket.on('mines_target_board', (data: any) => {
            this.emit('mines_target_board', data);
        });

        this.socket.on('mines_target_updated', (data: any) => {
            this.emit('mines_target_updated', data);
        });

        this.socket.on('mines_respawned', (data: any) => {
            this.emit('mines_respawned', data);
        });

        this.socket.on('mines_ko', (data: any) => {
            this.emit('mines_ko', data);
        });

        this.socket.on('mines_player_died_broadcast', (data: any) => {
            this.emit('mines_player_died_broadcast', data);
        });

        this.socket.on('mines_server_death', (data: any) => {
            this.emit('mines_server_death', data);
        });

        this.socket.on('mines_state_sync', (data: any) => {
            this.emit('mines_state_sync', data);
        });

        // Add handler for auth response
        this.socket.on('authenticated', (data: { success: boolean, user?: any, error?: string }) => {
            console.log('Socket Auth:', data);
            if (!data.success) {
                console.warn('Socket authentication failed:', data.error);
                // Emit event so AuthManager can handle token refresh
                this.emit('auth_failed', data);
            }
        });
    }

    public static authenticate(token: string) {
        if (!this.socket) return;
        console.log('Authenticating socket...');
        this.socket.emit('authenticate', { token });
    }

    public static createRoom(isPrivate: boolean = false) {
        if (!this.socket) return;
        this.socket.emit('create_room', { isPrivate });
    }

    public static joinQueue(ranked: boolean = false) {
        if (!this.socket) {
            // Auto connect if not connected
            this.connect();
        }
        if (this.socket && this.socket.connected) {
            this.socket.emit('join_queue', { ranked });
        } else {
            // If reconnecting, wait for 'connect' event
            console.warn("Socket not connected, attempting to join queue...");
            if (this.socket) {
                this.socket.once('connect', () => {
                    this.socket?.emit('join_queue', { ranked });
                });
            }
        }
    }

    public static leaveQueue() {
        if (!this.socket) return;
        this.socket.emit('leave_queue');
    }

    public static leaveRoom(roomId: string) {
        if (!this.socket) return;
        this.socket.emit('leave_room', { roomId });
    }

    public static joinRoom(roomId: string) {
        if (!this.socket) {
            console.warn("Cannot join room: Socket not connected.");
            return;
        }
        this.socket.emit('join_room', roomId);
    }

    public static startGame(roomId: string) {
        if (!this.socket) return;
        this.socket.emit('start_game', roomId);
    }

    public static sendGarbage(roomId: string, amount: number) {
        if (!this.socket) return;
        this.socket.emit('send_garbage', { roomId, amount });
    }

    public static sendBoardState(roomId: string, grid: number[][], garbageTray?: number) {
        if (!this.socket) return;
        this.socket.emit('send_board_state', { roomId, grid, garbageTray });
    }

    public static sendPlayerLost(roomId: string) {
        if (!this.socket) return;
        this.socket.emit('player_lost', { roomId });
    }

    public static sendPlayerState(roomId: string, state: { x: number, y: number, rot: number, main: number, sub: number }) {
        if (!this.socket) return;
        this.socket.emit('send_player_state', { roomId, state });
    }

    public static sendScore(roomId: string, score: number) {
        if (!this.socket) return;
        this.socket.emit('send_score', { roomId, score });
    }

    public static sendLost(roomId: string) {
        if (!this.socket) {
            console.error("NetworkManager: Cannot send player_lost - Socket disconnected");
            return;
        }
        console.log("NetworkManager: Sending player_lost for room", roomId);
        this.socket.emit('player_lost', { roomId });
    }

    // V2 Replay: Record player input for replay
    public static recordInput(roomId: string, input: string) {
        if (!this.socket) return;
        this.socket.emit('record_input', { roomId, input });
    }

    // V2 Replay: Record player settings for determinism
    public static recordSettings(roomId: string, sdf: number, softDropProtection: boolean) {
        if (!this.socket) return;
        this.socket.emit('record_settings', { roomId, sdf, softDropProtection });
    }

    // V2 Replay: Advance frame counter on server
    public static tickFrame(roomId: string) {
        if (!this.socket) return;
        this.socket.emit('tick_frame', { roomId });
    }

    public static requeue(roomId: string) {
        if (!this.socket) {
            console.error("NetworkManager: Cannot requeue - Socket disconnected");
            return;
        }
        console.log("NetworkManager: Requesting requeue from room", roomId);
        this.socket.emit('requeue', { roomId });
    }

    public static getRooms() {
        if (!this.socket) return;
        this.socket.emit('get_rooms');
    }

    public static getRoomDetails(roomId: string) {
        if (!this.socket) return;
        this.socket.emit('get_room_details', { roomId });
    }

    public static updateRoomSettings(roomId: string, settings: any) {
        if (!this.socket) return;
        this.socket.emit('update_room_settings', { roomId, settings });
    }

    // Public method to emit to socket server (for components that need direct access)
    public static emitToServer(event: string, data?: any) {
        if (!this.socket) return;
        this.socket.emit(event, data);
    }

    public static toggleReady(roomId: string, ready: boolean) {
        if (!this.socket) return;
        this.socket.emit('toggle_ready', { roomId, ready });
    }

    public static on(event: string, callback: NetworkCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);

        // Ensure we listen for this event on the socket if it's set up
        if (this.socket && !this.socket.hasListeners(event)) {
            // Forward socket event to our listeners
            // Note: We already set up most specific listeners in connect(), 
            // but for dynamic ones like 'room_update', we might need to add them.
            // However, our connect() method sets up specific handlers that emit to our internal listeners.
            // We should add 'room_update' to the connect method instead to be consistent.
        }
    }


    public static off(event: string, callback: NetworkCallback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event)!;
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    }

    private static emit(event: string, ...args: any[]) {
        if (this.listeners.has(event)) {
            this.listeners.get(event)!.forEach(cb => cb(...args));
        }
    }

    public static getSocket(): Socket | null {
        return this.socket;
    }

    // ── Puyo Mines (Quick Play) methods ──

    public static joinMines() {
        if (!this.socket) {
            this.connect();
        }
        if (this.socket?.connected) {
            this.socket.emit('join_mines');
        } else {
            this.socket?.once('connect', () => {
                this.socket?.emit('join_mines');
            });
        }
    }

    public static leaveMines() {
        if (!this.socket) return;
        this.socket.emit('leave_mines');
    }

    public static minesRespawn() {
        if (!this.socket) return;
        this.socket.emit('mines_respawn');
    }

    public static minesSetTarget(mode: string) {
        if (!this.socket) return;
        this.socket.emit('mines_set_target', { mode });
    }

    public static minesPlayerLost() {
        if (!this.socket) return;
        this.socket.emit('mines_player_lost');
    }

    public static minesSendGarbage(amount: number) {
        if (!this.socket) return;
        this.socket.emit('mines_send_garbage', { amount });
    }

    public static minesTickFrame() {
        if (!this.socket) return;
        this.socket.emit('mines_tick_frame');
    }

    public static getMinesPlayerList() {
        return this.lastMinesPlayerList;
    }
}

