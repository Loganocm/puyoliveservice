export interface Player {
    id: string;
    name: string;
    ready: boolean;
    userId?: number;       // API user ID (if authenticated)
    authToken?: string;    // JWT token for API calls
    lastBoardUpdate?: number; // Timestamp of last board state sent (heartbeat tracking)
    // Server-side game state validation
    lastPuyoCount?: number;        // Puyo count from last board state
    chainWindow?: number;          // Timestamp when puyos were last cleared (enables garbage sending)
    chainWindowGarbage?: number;   // Total garbage claimed in current chain window
    deathSuspectSince?: number;    // When grid[2][2] was first detected filled (topped-out detection)
}

export interface RoomSettings {
    bestOf: 1 | 3 | 5;
    maxPlayers: 2 | 3 | 4;
    garbageMultiplier: number;
    marginTime: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
    bestOf: 1,
    maxPlayers: 2,
    garbageMultiplier: 1,
    marginTime: 96,
};

export interface MatchStats {
    startedAt: Date;
    player1MaxChain: number;
    player2MaxChain: number;
    player1GarbageSent: number;
    player2GarbageSent: number;
}
// V2 Replay System - Frame-based input recording for deterministic playback
export type InputType = 'L' | 'R' | 'CW' | 'CC' | 'SD' | 'SU' | 'HD' | 'G';
// L=Left, R=Right, CW=RotateCW, CC=RotateCCW, SD=SoftDropStart, SU=SoftDropStop, HD=HardDrop, G=GarbageRecv

export interface ReplayInput {
    f: number;      // Frame number
    p: 0 | 1;       // Player index
    i: InputType;   // Input type
    a?: number;     // Amount (for Garbage 'G')
}

export interface ReplayFile {
    version: 2;
    seed: number;
    players: {
        id: string;
        username: string;
        userId?: number;
        elo?: number;
    }[];
    winner: 0 | 1 | null;   // Player index or null
    duration: number;        // Total frames
    fps: number;             // Frames per second (for timing)
    inputs: ReplayInput[];
}

// Legacy format for backwards compatibility
export interface ReplayEventLegacy {
    time: number;
    type: 'spawn' | 'move' | 'rotate' | 'drop' | 'place' | 'garbage' | 'chain' | 'game_start' | 'game_over';
    playerId?: string;
    data?: any;
}

export class GameRoom {
    id: string;
    players: Map<string, Player> = new Map();
    maxPlayers: number = 2;
    matchStats: MatchStats | null = null;
    ranked: boolean = false;
    isPrivate: boolean = false;
    settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };

    // Series tracking
    seriesScore: Map<string, number> = new Map();  // socketId -> wins
    currentGame: number = 1;

    // Match conclusion lock - prevents dual-win race conditions
    matchConcluded: boolean = false;
    conclusionLoser: string | null = null; // Socket ID of the first loser

    // Server-authoritative game simulators (one per player)
    simulators: Map<string, any> = new Map();

    // V2 Replay Data
    replayInputs: ReplayInput[] = [];
    frameCount: number = 0;
    replayFPS: number = 60;
    seed: number = 0;

    // Anti-cheat: tracks last time player 0 sent a tick_frame
    // If this goes stale during an active match, player 0 is forfeited
    lastTickFrame: number = 0;

    // Server-side game loop interval (runs sim independently of client tick_frame)
    tickInterval: ReturnType<typeof setInterval> | null = null;

    stopTickLoop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    // Legacy (kept for backwards compat during transition)
    replayLog: ReplayEventLegacy[] = [];

    // Room lifecycle
    createdAt: number = Date.now();

    constructor(id: string) {
        this.id = id;
    }

    // Atomically conclude match - returns TRUE if this call is the first to conclude
    // Returns FALSE if match was already concluded (second player loses silently)
    concludeMatch(loserSocketId: string): boolean {
        if (this.matchConcluded) {
            console.log(`[Room ${this.id}] Match already concluded. Second loss from ${loserSocketId} ignored.`);
            return false;
        }
        this.matchConcluded = true;
        this.conclusionLoser = loserSocketId;
        console.log(`[Room ${this.id}] Match concluded. Loser: ${loserSocketId}`);
        return true;
    }

    addPlayer(player: Player): boolean {
        if (this.players.size >= this.settings.maxPlayers) return false;
        this.players.set(player.id, player);
        return true;
    }

    removePlayer(playerId: string) {
        this.players.delete(playerId);
    }

    // Reconnect: Find player by userId and swap their socket ID
    // Returns the old socket ID if found, null if not found
    reconnectPlayer(userId: number, newSocketId: string, newAuthToken?: string): string | null {
        for (const [oldSocketId, player] of this.players.entries()) {
            if (player.userId === userId) {
                // Swap socket ID
                this.players.delete(oldSocketId);
                player.id = newSocketId;
                if (newAuthToken) player.authToken = newAuthToken;
                this.players.set(newSocketId, player);
                console.log(`[Room ${this.id}] Player ${player.name} (userId ${userId}) reconnected: ${oldSocketId} -> ${newSocketId}`);
                return oldSocketId;
            }
        }
        return null;
    }

    get playerCount() {
        return this.players.size;
    }

    // Start tracking match stats
    startMatch() {
        this.matchStats = {
            startedAt: new Date(),
            player1MaxChain: 0,
            player2MaxChain: 0,
            player1GarbageSent: 0,
            player2GarbageSent: 0
        };
        this.seed = this.matchStats.startedAt.getTime();
        this.frameCount = 0;
        this.replayInputs = [];
        this.replayLog = [];
        this.matchConcluded = false;
        this.conclusionLoser = null;
        this.simulators.clear();
        this.stopTickLoop(); // Clear any leftover loop from previous game
        this.lastTickFrame = Date.now(); // Initialize tick heartbeat
        // Initialize heartbeat + game state tracking for all players
        const now = Date.now();
        for (const player of this.players.values()) {
            player.lastBoardUpdate = now;
            player.lastPuyoCount = undefined;
            player.chainWindow = undefined;
            player.chainWindowGarbage = undefined;
            player.deathSuspectSince = undefined;
        }
        this.recordReplayEvent('game_start', undefined, { seed: this.seed });
    }

    // V2: Record frame-based input
    recordInput(playerIndex: 0 | 1, inputType: InputType, amount?: number) {
        this.replayInputs.push({
            f: this.frameCount,
            p: playerIndex,
            i: inputType,
            a: amount
        });
    }

    // Get player index from socket ID (supports >2 players)
    getPlayerIndex(socketId: string): number {
        const ids = Array.from(this.players.keys());
        return ids.indexOf(socketId);
    }

    // Increment frame (called each game tick)
    tick() {
        this.frameCount++;
    }

    // Build V2 replay file
    buildReplayFile(winnerIndex: 0 | 1 | null): ReplayFile {
        const playersArr = Array.from(this.players.values());
        return {
            version: 2,
            seed: this.seed,
            players: playersArr.map(p => ({
                id: p.id,
                username: p.name,
                userId: p.userId,
                elo: undefined // Could be added if tracked
            })),
            winner: winnerIndex,
            duration: this.frameCount,
            fps: this.replayFPS,
            inputs: this.replayInputs
        };
    }

    // Legacy: Record time-based event (kept for backwards compat)
    recordReplayEvent(type: ReplayEventLegacy['type'], playerId?: string, data?: any) {
        if (!this.matchStats) return;

        this.replayLog.push({
            time: Date.now() - this.matchStats.startedAt.getTime(),
            type,
            playerId,
            data
        });
    }


    // Update stats when garbage is sent
    recordGarbage(playerId: string, amount: number) {
        if (!this.matchStats) return;

        const playerIds = Array.from(this.players.keys());
        if (playerIds[0] === playerId) {
            this.matchStats.player1GarbageSent += amount;
        } else {
            this.matchStats.player2GarbageSent += amount;
        }
    }

    // Update max chain for a player
    recordChain(playerId: string, chainLength: number) {
        if (!this.matchStats) return;

        const playerIds = Array.from(this.players.keys());
        if (playerIds[0] === playerId) {
            this.matchStats.player1MaxChain = Math.max(
                this.matchStats.player1MaxChain,
                chainLength
            );
        } else {
            this.matchStats.player2MaxChain = Math.max(
                this.matchStats.player2MaxChain,
                chainLength
            );
        }
    }

    // Get match duration in seconds
    getMatchDuration(): number | undefined {
        if (!this.matchStats) return undefined;
        return Math.floor((Date.now() - this.matchStats.startedAt.getTime()) / 1000);
    }

    // Check if this is a ranked match (both players authenticated AND room is ranked)
    isRankedMatch(): boolean {
        if (!this.ranked) return false;

        const players = Array.from(this.players.values());
        return players.length === 2 &&
            players.every(p => p.userId !== undefined);
    }

    // Get player API user IDs
    getPlayerUserIds(): { player1Id?: number; player2Id?: number } {
        const players = Array.from(this.players.values());
        return {
            player1Id: players[0]?.userId,
            player2Id: players[1]?.userId
        };
    }

    // Update room settings (host only) — explicit key assignment to prevent prototype pollution
    updateSettings(newSettings: Partial<RoomSettings>) {
        if (newSettings.bestOf !== undefined && ![1, 3, 5].includes(newSettings.bestOf)) return;
        if (newSettings.maxPlayers !== undefined && ![2, 3, 4].includes(newSettings.maxPlayers)) return;
        if (newSettings.garbageMultiplier !== undefined && (typeof newSettings.garbageMultiplier !== 'number' || newSettings.garbageMultiplier < 0.5 || newSettings.garbageMultiplier > 3)) return;
        if (newSettings.marginTime !== undefined && (typeof newSettings.marginTime !== 'number' || newSettings.marginTime < 30 || newSettings.marginTime > 300)) return;
        // Only copy known keys (never use object spread with untrusted input)
        if (newSettings.bestOf !== undefined) this.settings.bestOf = newSettings.bestOf;
        if (newSettings.maxPlayers !== undefined) {
            this.settings.maxPlayers = newSettings.maxPlayers;
            this.maxPlayers = newSettings.maxPlayers;
        }
        if (newSettings.garbageMultiplier !== undefined) this.settings.garbageMultiplier = newSettings.garbageMultiplier;
        if (newSettings.marginTime !== undefined) this.settings.marginTime = newSettings.marginTime;
    }

    // Reset for next game in a series
    resetForNextGame() {
        this.matchConcluded = false;
        this.conclusionLoser = null;
        this.matchStats = null;
        this.replayInputs = [];
        this.frameCount = 0;
        this.replayLog = [];
        this.simulators.clear();
        this.currentGame++;
        // Reset all player ready states
        for (const player of this.players.values()) {
            player.ready = false;
        }
    }

    // Get the player data formatted for client room_update events
    getPlayersForClient(): any[] {
        const playerArr = Array.from(this.players.values());
        return playerArr.map((p, idx) => ({
            id: p.id,
            username: p.name,
            ready: p.ready,
            isHost: idx === 0,
            elo: undefined,
            userId: p.userId,
        }));
    }
}
