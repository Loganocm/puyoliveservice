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


// ═══════════════════════════════════════════════════════════════════════════════
// V3 Replay Types
//
// Declared once, in @puyolive/engine. This file used to carry its own copy of
// ENGINE_VERSION, InputType, ReplayInput, ReplayPlayerSettings,
// DeterministicEvent(Type), StateHash, ReplayFileV3 and ReplayFileV2, kept
// byte-identical to src/core/ReplayEngine.ts by hand. The server WRITES these
// files and the client READS them, so a copy that drifts does not produce a
// type error -- it produces a replay one side cannot play.
//
// Re-exported here so server modules that import them from GameRoom keep
// working. See docs/adr/0006-shared-engine-package.md.
// ═══════════════════════════════════════════════════════════════════════════════

export { ENGINE_VERSION } from '@puyolive/engine';

export type {
    InputType,
    ReplayInput,
    ReplayPlayer,
    ReplayPlayerSettings,
    ReplayRoomSettings,
    DeterministicEventType,
    DeterministicEvent,
    StateHash,
    ReplayFileV3,
    ReplayFileV2,
} from '@puyolive/engine';

import { ENGINE_VERSION } from '@puyolive/engine';
import type {
    InputType,
    ReplayInput,
    ReplayPlayerSettings,
    DeterministicEventType,
    DeterministicEvent,
    StateHash,
    ReplayFileV3,
} from '@puyolive/engine';


// Legacy format for backwards compatibility
export interface ReplayEventLegacy {
    time: number;
    type: 'spawn' | 'move' | 'rotate' | 'drop' | 'place' | 'garbage' | 'chain' | 'game_start' | 'game_over';
    playerId?: string;
    data?: any;
}

/**
 * Return a copy of `map` with `oldKey` renamed to `newKey` at the SAME
 * insertion position. A delete-then-set would move the entry to the end, and
 * GameRoom derives player index from insertion order.
 */
function rekeyInPlace<V>(map: Map<string, V>, oldKey: string, newKey: string): Map<string, V> {
    if (!map.has(oldKey)) return map;
    return new Map(Array.from(map, ([k, v]): [string, V] => [k === oldKey ? newKey : k, v]));
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

    // V3 Replay Data
    replayInputs: ReplayInput[] = [];
    replayFPS: number = 60;
    seed: number = 0;

    // V3: Per-player settings (keyed by socket ID, stored individually)
    playerSettingsMap: Map<string, ReplayPlayerSettings> = new Map();

    // Legacy compat: single playerSettings reference (deprecated, kept for V2 fallback)
    playerSettings: { sdf: number; softDropProtection: boolean } | null = null;

    // V3: Deterministic event log — every state-changing event recorded
    deterministicEvents: DeterministicEvent[] = [];

    // V3: Periodic state hashes — for desync detection during replay playback
    stateHashes: StateHash[] = [];

    // V3: Piece sequences per player — explicit record of every piece spawned
    // Flattened: [main, sub, main, sub, ...] per player
    pieceSequences: [number[], number[]] = [[], []];

    // V3: Garbage column order log per player
    // Each inner array is the column order used for one garbage drop
    garbageColumns: [number[][], number[][]] = [[], []];

    /**
     * Absolute instant (server epoch ms) at which frame 0 occurs.
     *
     * Both clients derive their frame number from this rather than from a
     * local accumulator started on packet arrival, so frame N is the same
     * moment on every machine. That is what makes cross-player alignment real
     * live, and what makes lockstep replay correct rather than merely assumed.
     * See docs/adr/0003-shared-match-clock.md.
     */
    startAtMs: number = 0;

    /** Frame the shared clock says the match is on right now. */
    currentSharedFrame(): number {
        if (!this.startAtMs) return 0;
        return Math.max(0, Math.floor((Date.now() - this.startAtMs) / (1000 / 60)));
    }

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
    //
    // The swap must keep the player in the SAME POSITION. Player index is
    // derived from Map insertion order (getPlayerIndex), and it is what stamps
    // `p` on every recorded input, decides who is host, and attributes garbage
    // and chain stats. A delete-then-set moved a reconnecting player to the end
    // of the Map, so player 0 became player 1 mid-match: their later inputs
    // were recorded under the opponent's index and the replay was corrupted.
    //
    // Every other map keyed by socket id must follow the player too. The
    // simulator and the recorded handling settings used to stay under the dead
    // socket id, so the server stopped simulating the reconnected player and
    // the replay fell back to default SDF for them.
    // See website/src/content/docs/review/findings.md (NET-07).
    reconnectPlayer(userId: number, newSocketId: string, newAuthToken?: string): string | null {
        for (const [oldSocketId, player] of this.players.entries()) {
            if (player.userId === userId) {
                player.id = newSocketId;
                if (newAuthToken) player.authToken = newAuthToken;
                this.players = rekeyInPlace(this.players, oldSocketId, newSocketId);
                this.simulators = rekeyInPlace(this.simulators, oldSocketId, newSocketId);
                this.playerSettingsMap = rekeyInPlace(this.playerSettingsMap, oldSocketId, newSocketId);
                this.seriesScore = rekeyInPlace(this.seriesScore, oldSocketId, newSocketId);
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
        this.replayInputs = [];
        this.replayLog = [];
        this.matchConcluded = false;
        this.conclusionLoser = null;
        this.startAtMs = 0; // set by the caller once the countdown is announced
        this.simulators.clear();
        this.stopTickLoop(); // Clear any leftover loop from previous game

        // V3: Reset all tracking arrays
        this.deterministicEvents = [];
        this.stateHashes = [];
        this.pieceSequences = [[], []];
        this.garbageColumns = [[], []];
        this.playerSettingsMap.clear();

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

    /** Note that a player's client is alive: it sent a board state or an input. */
    markAlive(socketId: string, now: number = Date.now()): void {
        const player = this.players.get(socketId);
        if (player) player.lastBoardUpdate = now;
    }

    /**
     * The first player whose client has gone silent for longer than
     * `timeoutMs`, or null. Nobody is stalled in the first `graceMs` of a
     * match (loading), or once the match is over. See NET-13.
     */
    findStalledPlayer(now: number, timeoutMs: number, graceMs: number): { socketId: string; silentMs: number } | null {
        if (!this.matchStats || this.matchConcluded) return null;
        if (now - this.matchStats.startedAt.getTime() < graceMs) return null;
        for (const [socketId, player] of this.players) {
            const silentMs = now - (player.lastBoardUpdate || 0);
            if (silentMs > timeoutMs) return { socketId, silentMs };
        }
        return null;
    }

    // V3.1 Replay: Record explicit frame-based input from client
    recordInput(playerIndex: 0 | 1, inputType: InputType, frame: number, amount?: number) {
        this.replayInputs.push({
            f: frame,
            p: playerIndex,
            i: inputType,
            a: amount
        });
    }

    // V3: Record a deterministic event
    recordDeterministicEvent(playerIndex: 0 | 1, type: DeterministicEventType, data?: any) {
        this.deterministicEvents.push({
            f: this.currentSharedFrame(),
            p: playerIndex,
            t: type,
            d: data,
        });
    }

    // V3.1 Replay: Record periodic state hash EXACTLY as calculated on the client
    recordStateHash(playerIndex: 0 | 1, frame: number, hash: string) {
        this.stateHashes.push({
            f: frame,
            p: playerIndex,
            h: hash,
        });
    }

    // V3: Record player settings (per-player, keyed by socket ID)
    recordPlayerSettings(socketId: string, sdf: number, softDropProtection: boolean) {
        this.playerSettingsMap.set(socketId, { sdf, softDropProtection });
    }

    // Get player index from socket ID (supports >2 players)
    getPlayerIndex(socketId: string): number {
        const ids = Array.from(this.players.keys());
        return ids.indexOf(socketId);
    }

    // Build V3 replay file — records everything for 1:1 deterministic playback
    buildReplayFile(winnerIndex: 0 | 1 | null): ReplayFileV3 {
        const playersArr = Array.from(this.players.values());
        const playerIds = Array.from(this.players.keys());

        // Resolve per-player settings (fallback to defaults if not recorded)
        const defaultSettings: ReplayPlayerSettings = { sdf: 10, softDropProtection: true };
        const p0Settings = this.playerSettingsMap.get(playerIds[0]) ?? defaultSettings;
        const p1Settings = this.playerSettingsMap.get(playerIds[1]) ?? defaultSettings;

        const maxInputFrame = this.replayInputs.length > 0 ? this.replayInputs.reduce((max, i) => Math.max(max, i.f), 0) : 0;
        const maxHashFrame = this.stateHashes.length > 0 ? this.stateHashes.reduce((max, h) => Math.max(max, h.f), 0) : 0;
        const actualDuration = Math.max(this.currentSharedFrame(), maxInputFrame, maxHashFrame);

        return {
            version: 3,
            engineVersion: ENGINE_VERSION,
            seed: this.seed,
            players: playersArr.map(p => ({
                id: p.id,
                username: p.name,
                userId: p.userId,
                elo: undefined
            })),
            winner: winnerIndex,
            duration: actualDuration,
            fps: this.replayFPS,
            inputs: this.replayInputs,
            playerSettings: [p0Settings, p1Settings],
            roomSettings: {
                garbageMultiplier: this.settings.garbageMultiplier,
                marginTime: this.settings.marginTime,
            },
            pieceSequences: this.pieceSequences,
            garbageColumns: this.garbageColumns,
            events: this.deterministicEvents,
            stateHashes: this.stateHashes,
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
        this.replayLog = [];
        this.simulators.clear();
        this.currentGame++;

        // V3: Reset all tracking arrays
        this.deterministicEvents = [];
        this.stateHashes = [];
        this.pieceSequences = [[], []];
        this.garbageColumns = [[], []];
        this.playerSettingsMap.clear();

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
