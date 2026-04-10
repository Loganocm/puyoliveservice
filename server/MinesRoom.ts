/**
 * MinesRoom - Persistent FFA "Puyo Mines" room
 * 
 * Inspired by TETR.IO's Quick Play mode:
 * - Always-open room that anyone can join (including guests)
 * - Players "descend" into the Puyo Mines — score is converted to depth
 * - Targeting system: Random, Attackers, Badges (most KOs), Vulnerable
 * - Player list sidebar showing all participants and their depth
 * - Players who top out are eliminated, can rejoin immediately
 * - Garbage mechanics follow TETR.IO patterns (targeted distribution)
 * - Bot fills in when < 10 players, scales difficulty by depth level
 */

import { PuyoSimulator } from './PuyoSimulator';

export type TargetingMode = 'random' | 'attackers' | 'badges' | 'vulnerable';

/**
 * Depth level thresholds — reaching these depths advances the mine level.
 * The bot's garbage output scales with the highest level in the room.
 */
export const DEPTH_LEVELS = [
    { depth: 0,    level: 1, name: 'Surface',        color: '#4ade80' },
    { depth: 500,  level: 2, name: 'Shallow Mines',  color: '#22d3ee' },
    { depth: 1000, level: 3, name: 'Deep Caverns',   color: '#818cf8' },
    { depth: 2000, level: 4, name: 'Crystal Veins',  color: '#a78bfa' },
    { depth: 3500, level: 5, name: 'Magma Layer',    color: '#f97316' },
    { depth: 5000, level: 6, name: 'The Abyss',      color: '#ef4444' },
    { depth: 7500, level: 7, name: 'Void Core',      color: '#dc2626' },
    { depth: 10000,level: 8, name: 'Bedrock',        color: '#991b1b' },
];

/** Get the depth level for a given depth value */
export function getDepthLevel(depth: number): typeof DEPTH_LEVELS[number] {
    for (let i = DEPTH_LEVELS.length - 1; i >= 0; i--) {
        if (depth >= DEPTH_LEVELS[i].depth) return DEPTH_LEVELS[i];
    }
    return DEPTH_LEVELS[0];
}

export interface MinesPlayer {
    socketId: string;
    username: string;
    userId?: number;         // Authenticated user ID (undefined for guests)
    avatarUrl?: string;
    elo?: number;

    // Game state
    alive: boolean;
    depth: number;           // Score converted to depth (score / DEPTH_DIVISOR)
    score: number;           // Raw score accumulator
    kos: number;             // Number of kills this session
    garbageSent: number;     // Total garbage sent this session
    board: number[][] | null; // Last known board state (for spectating)
    simulator: PuyoSimulator;

    // Targeting
    targetingMode: TargetingMode;
    currentTarget: string | null; // socketId of current target

    // Timing
    joinedAt: number;
    diedAt?: number;
}

export interface MinesState {
    players: {
        socketId: string;
        username: string;
        userId?: number;
        avatarUrl?: string;
        alive: boolean;
        depth: number;
        kos: number;
        targetingMode: TargetingMode;
        currentTarget: string | null;
        isBot?: boolean;
        depthLevel: number;
    }[];
    activePlayers: number;
    totalPlayers: number;
    seed: number;
    highestLevel: number;
}

/** Points of score per 1 unit of depth */
const DEPTH_DIVISOR = 100;

/**
 * TETR.IO-style garbage distribution table.
 * Maps chain length → base garbage lines sent.
 * This mirrors Puyo's chain scoring but simplified for FFA.
 */
const CHAIN_GARBAGE_TABLE: Record<number, number> = {
    1: 0,    // 1-chain: no garbage
    2: 1,    // 2-chain: 1 line
    3: 2,    // 3-chain: 2 lines
    4: 4,    // 4-chain: 4 lines 
    5: 6,    // 5-chain: 6 lines
    6: 8,    // 6-chain: 8 lines
    7: 10,   // 7+ chain: scales further
};

export class MinesRoom {
    public readonly id = 'MINES_LOBBY';
    public players: Map<string, MinesPlayer> = new Map();
    public seed: number = Date.now();
    public createdAt: number = Date.now();

    /**
     * Server-authoritative garbage calculation from chain length.
     * Client-reported amounts are NEVER trusted — this is the only source of truth.
     */
    static calculateGarbage(chainLength: number): number {
        // Clamp to sane input range
        const chain = Math.max(1, Math.min(chainLength, 25));
        const base = CHAIN_GARBAGE_TABLE[Math.min(chain, 7)] ?? 10;
        // For chains beyond 7, add 2 per additional chain level
        const bonus = chain > 7 ? (chain - 7) * 2 : 0;
        return base + bonus;
    }

    // Round tracking
    private roundNumber: number = 0;

    // ── Bot system ──
    /** Minimum real (non-bot) players before the bot activates. Below this, bot fills the gap. */
    private static readonly BOT_THRESHOLD = 10;
    /** Bot garbage sending interval handle */
    private botInterval: ReturnType<typeof setInterval> | null = null;
    /** Callback for server to emit garbage to a specific player */
    public onBotGarbage: ((targetSocketId: string, amount: number) => void) | null = null;
    /** Callback for server to broadcast updated player list */
    public onBroadcastPlayerList: (() => void) | null = null;
    /** Callback for server to notify a player death */
    public onPlayerDiedServer: ((socketId: string) => void) | null = null;
    /** Seed rotation interval handle */
    private seedInterval: ReturnType<typeof setInterval> | null = null;
    /** Server simulation tick interval */
    private simulatorTickInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Rotate seed periodically for variety
        this.seedInterval = setInterval(() => {
            if (this.getAlivePlayers().length === 0) {
                this.seed = Date.now();
                this.roundNumber++;
            }
        }, 60000); // Check every minute

        // Server-authoritative tick loop
        this.simulatorTickInterval = setInterval(() => this.tickSimulators(), 16);
    }

    // ── Bot Management ──

    /** The bot's socketId is a fixed sentinel value */
    private static readonly BOT_ID = '__MINES_BOT__';
    private static readonly BOT_NAMES = [
        'MineBot', 'CaveDigger', 'DrillMaster', 'RockCrusher',
        'TunnelRat', 'DepthSeeker', 'GemHunter', 'MoleMachine'
    ];

    /** Whether the bot is currently active in the room */
    get botActive(): boolean {
        return this.players.has(MinesRoom.BOT_ID);
    }

    /** Get only real (non-bot) players */
    getRealPlayerCount(): number {
        let count = 0;
        for (const p of this.players.values()) {
            if (p.socketId !== MinesRoom.BOT_ID) count++;
        }
        return count;
    }

    /** Get the highest depth level among all alive real players */
    getHighestAliveLevel(): number {
        let max = 1;
        for (const p of this.players.values()) {
            if (p.alive && p.socketId !== MinesRoom.BOT_ID) {
                const lvl = getDepthLevel(p.depth).level;
                if (lvl > max) max = lvl;
            }
        }
        return max;
    }

    /**
     * Check if bot should be added or removed.
     * Called after player join/leave events.
     */
    updateBotPresence(): void {
        const realCount = this.getRealPlayerCount();
        const aliveReal = this.getAlivePlayers().filter(p => p.socketId !== MinesRoom.BOT_ID).length;

        if (realCount > 0 && realCount < MinesRoom.BOT_THRESHOLD && !this.botActive) {
            // Add bot
            const name = MinesRoom.BOT_NAMES[Math.floor(Math.random() * MinesRoom.BOT_NAMES.length)];
            this.players.set(MinesRoom.BOT_ID, {
                socketId: MinesRoom.BOT_ID,
                username: `⛏ ${name}`,
                alive: true,
                depth: 0,
                score: 0,
                kos: 0,
                garbageSent: 0,
                board: null,
                targetingMode: 'random',
                currentTarget: null,
                joinedAt: Date.now(),
            });
            this.startBotLoop();
            console.log(`[Mines Bot] Activated (${realCount} real players)`);
        } else if ((realCount >= MinesRoom.BOT_THRESHOLD || realCount === 0) && this.botActive) {
            // Remove bot
            this.stopBotLoop();
            this.players.delete(MinesRoom.BOT_ID);
            // Reassign anyone targeting the bot
            for (const [id, p] of this.players) {
                if (p.currentTarget === MinesRoom.BOT_ID) {
                    this.reassignTarget(id);
                }
            }
            console.log(`[Mines Bot] Deactivated (${realCount} real players)`);
        }
    }

    /**
     * Bot garbage loop — sends garbage to a random alive player at intervals
     * scaled by the room's highest depth level.
     *
     * Level scaling:
     *   Level 1: 1 garbage every 12s
     *   Level 2: 1 garbage every 10s
     *   Level 3: 2 garbage every 8s
     *   Level 4: 2 garbage every 6s
     *   Level 5: 3 garbage every 5s
     *   Level 6: 3 garbage every 4s
     *   Level 7: 4 garbage every 3s
     *   Level 8: 5 garbage every 2.5s
     */
    private static readonly BOT_SCHEDULE: { amount: number; intervalMs: number }[] = [
        { amount: 1, intervalMs: 12000 }, // Level 1
        { amount: 1, intervalMs: 10000 }, // Level 2
        { amount: 2, intervalMs: 8000 },  // Level 3
        { amount: 2, intervalMs: 6000 },  // Level 4
        { amount: 3, intervalMs: 5000 },  // Level 5
        { amount: 3, intervalMs: 4000 },  // Level 6
        { amount: 4, intervalMs: 3000 },  // Level 7
        { amount: 5, intervalMs: 2500 },  // Level 8
    ];

    private botLastLevel: number = 0;

    private startBotLoop(): void {
        this.stopBotLoop();
        this.botLastLevel = 0;
        this.tickBot();
    }

    private tickSimulators(): void {
        for (const [socketId, player] of this.players) {
            if (socketId === MinesRoom.BOT_ID || !player.alive) continue;

            player.simulator.update();
            player.score = player.simulator.stats.score;
            player.depth = Math.floor(player.score / DEPTH_DIVISOR);
            
            // Periodically sync the visible board
            if (player.simulator.frameCount % 6 === 0) {
                player.board = player.simulator.getSerializedData();
            }

            if (player.simulator.isGameOver && player.alive) {
                if (this.onPlayerDiedServer) {
                    this.onPlayerDiedServer(socketId);
                } else {
                    this.killPlayer(socketId);
                }
            }
        }
    }

    private stopBotLoop(): void {
        if (this.botInterval) {
            clearTimeout(this.botInterval);
            this.botInterval = null;
        }
    }

    private tickBot(): void {
        const level = this.getHighestAliveLevel();
        const schedule = MinesRoom.BOT_SCHEDULE[Math.min(level - 1, MinesRoom.BOT_SCHEDULE.length - 1)];

        // If level changed, update bot's simulated depth to match theme
        if (level !== this.botLastLevel) {
            this.botLastLevel = level;
            const bot = this.players.get(MinesRoom.BOT_ID);
            if (bot) {
                // Bot depth tracks the level threshold so it shows in the correct zone
                const lvlDef = DEPTH_LEVELS[Math.min(level - 1, DEPTH_LEVELS.length - 1)];
                bot.depth = lvlDef.depth;
                bot.score = lvlDef.depth * DEPTH_DIVISOR;
            }
        }

        // Pick a random alive real player to send garbage to
        const targets = this.getAlivePlayers().filter(p => p.socketId !== MinesRoom.BOT_ID);
        if (targets.length > 0 && this.onBotGarbage) {
            const target = targets[Math.floor(Math.random() * targets.length)];
            try {
                this.onBotGarbage(target.socketId, schedule.amount);
            } catch (err) {
                console.error('[Mines Bot] Error sending garbage:', err);
            }
            const bot = this.players.get(MinesRoom.BOT_ID);
            if (bot) bot.garbageSent += schedule.amount;
        }

        // Schedule next tick
        if (this.botActive) {
            this.botInterval = setTimeout(() => this.tickBot(), schedule.intervalMs);
        }
    }

    /**
     * Add a player to the mines lobby.
     * Returns false if socketId already exists.
     */
    addPlayer(data: {
        socketId: string;
        username: string;
        userId?: number;
        avatarUrl?: string;
        elo?: number;
    }): boolean {
        if (this.players.has(data.socketId)) return false;

        const player: MinesPlayer = {
            socketId: data.socketId,
            username: data.username,
            userId: data.userId,
            avatarUrl: data.avatarUrl,
            elo: data.elo,
            alive: true,
            depth: 0,
            score: 0,
            kos: 0,
            garbageSent: 0,
            board: null,
            simulator: new PuyoSimulator(this.seed),
            targetingMode: 'random',
            currentTarget: null,
            joinedAt: Date.now(),
        };

        player.simulator.onGarbageGenerated = (amount: number) => {
            // Note: client events now ignore 'mines_send_garbage' from clients
            // Instead, this directly applies the server simulated garbage.
            const chainLength = player.simulator.stats.chainCount;
            // The simulation amount is the raw amount (which is 1:1 in simulator but we override using FFA logic)
            // Replace standard PuyoSimulator garbage logic with FFA formula
            const ffaAmount = MinesRoom.calculateGarbage(chainLength);
            if (ffaAmount <= 0) return;

            const targetId = player.currentTarget;
            if (targetId) {
                const target = this.players.get(targetId);
                if (target && target.alive && this.onBotGarbage) {
                     // We can reuse the onBotGarbage for standard player garbage dispatch!
                     // Actually, we'll create a dedicated callback or update here.
                     player.garbageSent += ffaAmount;
                     target.simulator.addGarbage(ffaAmount);
                     // The actual network emit must happen from index.ts, so we'll fire onPlayerGarbage
                     if (this.onPlayerGarbage) {
                         this.onPlayerGarbage(targetId, ffaAmount, player.username, socketId);
                     }
                }
            }
        };

        this.players.set(data.socketId, player);

        // Auto-assign initial target
        this.reassignTarget(data.socketId);

        return true;
    }

    /**
     * Remove a player from the lobby.
     * Also clears any other player targeting this player.
     */
    removePlayer(socketId: string): void {
        this.players.delete(socketId);

        // Reassign targets for anyone targeting the removed player
        for (const [id, p] of this.players) {
            if (p.currentTarget === socketId) {
                this.reassignTarget(id);
            }
        }
    }

    /**
     * Mark a player as dead (topped out).
     * Returns the player's final stats.
     */
    killPlayer(socketId: string): MinesPlayer | null {
        const player = this.players.get(socketId);
        if (!player || !player.alive) return null;

        player.alive = false;
        player.diedAt = Date.now();

        // Reassign targets for anyone targeting the dead player
        for (const [id, p] of this.players) {
            if (p.currentTarget === socketId) {
                this.reassignTarget(id);
            }
        }

        return player;
    }

    /**
     * Respawn a player (reset their game state, keep session stats).
     */
    respawnPlayer(socketId: string): boolean {
        const player = this.players.get(socketId);
        if (!player) return false;

        player.alive = true;
        player.depth = 0;
        player.score = 0;
        player.board = null;
        player.simulator = new PuyoSimulator(this.seed);
        player.diedAt = undefined;

        // Reattach garbage listener
        player.simulator.onGarbageGenerated = (amount: number) => {
            const chainLength = player.simulator.stats.chainCount;
            const ffaAmount = MinesRoom.calculateGarbage(chainLength);
            if (ffaAmount <= 0) return;
            const targetId = player.currentTarget;
            if (targetId) {
                const target = this.players.get(targetId);
                if (target && target.alive && this.onPlayerGarbage) {
                     player.garbageSent += ffaAmount;
                     target.simulator.addGarbage(ffaAmount);
                     this.onPlayerGarbage(targetId, ffaAmount, player.username, socketId);
                }
            }
        };

        this.reassignTarget(socketId);
        return true;
    }

    /**
     * Update a player's score and compute depth.
     */
    updateScore(socketId: string, score: number): number {
        const player = this.players.get(socketId);
        if (!player || !player.alive) return 0;

        player.score = score;
        player.depth = Math.floor(score / DEPTH_DIVISOR);
        return player.depth;
    }

    /**
     * Update a player's board state (for spectating/sidebar preview).
     */
    updateBoard(socketId: string, grid: number[][]): void {
        const player = this.players.get(socketId);
        if (player) {
            player.board = grid;
        }
    }

    /**
     * Process garbage from a chain.
     * Returns the target socketId and amount.
     */
    processGarbage(senderSocketId: string, amount: number, chainLength: number): {
        targetSocketId: string;
        amount: number;
    } | null {
        const sender = this.players.get(senderSocketId);
        if (!sender || !sender.alive) return null;

        sender.garbageSent += amount;

        const targetId = sender.currentTarget;
        if (!targetId) return null;

        const target = this.players.get(targetId);
        if (!target || !target.alive) {
            // Target died/left, reassign and try again
            this.reassignTarget(senderSocketId);
            const newTarget = sender.currentTarget;
            if (!newTarget) return null;
            return { targetSocketId: newTarget, amount };
        }

        return { targetSocketId: targetId, amount };
    }

    /** Callback for server to route garbage from players */
    public onPlayerGarbage: ((targetSocketId: string, amount: number, senderName: string, senderSocketId: string) => void) | null = null;

    /**
     * Record a KO (when targeted player dies from your garbage).
     */
    recordKO(killerSocketId: string): void {
        const player = this.players.get(killerSocketId);
        if (player) {
            player.kos++;
        }
    }

    /**
     * Change a player's targeting mode.
     */
    setTargetingMode(socketId: string, mode: TargetingMode): void {
        const player = this.players.get(socketId);
        if (!player) return;
        player.targetingMode = mode;
        this.reassignTarget(socketId);
    }

    /**
     * Reassign target for a player based on their targeting mode.
     * TETR.IO targeting logic:
     * - random: pick a random alive player
     * - attackers: target whoever is targeting you
     * - badges: target player with most KOs
     * - vulnerable: target player closest to topping out (most filled board)
     */
    reassignTarget(socketId: string): void {
        const player = this.players.get(socketId);
        if (!player) return;

        const candidates = this.getAlivePlayers().filter(p => p.socketId !== socketId);
        if (candidates.length === 0) {
            player.currentTarget = null;
            return;
        }

        switch (player.targetingMode) {
            case 'random': {
                const idx = Math.floor(Math.random() * candidates.length);
                player.currentTarget = candidates[idx].socketId;
                break;
            }
            case 'attackers': {
                // Find players targeting you
                const attackers = candidates.filter(c => c.currentTarget === socketId);
                if (attackers.length > 0) {
                    const idx = Math.floor(Math.random() * attackers.length);
                    player.currentTarget = attackers[idx].socketId;
                } else {
                    // No attackers, fall back to random
                    const idx = Math.floor(Math.random() * candidates.length);
                    player.currentTarget = candidates[idx].socketId;
                }
                break;
            }
            case 'badges': {
                // Target player with most KOs
                const sorted = [...candidates].sort((a, b) => b.kos - a.kos);
                player.currentTarget = sorted[0].socketId;
                break;
            }
            case 'vulnerable': {
                // Target player with highest board fill (most cells occupied)
                const withFill = candidates.map(c => {
                    let fill = 0;
                    if (c.board) {
                        for (const row of c.board) {
                            for (const cell of row) {
                                if (cell !== 0) fill++;
                            }
                        }
                    }
                    return { ...c, fill };
                });
                withFill.sort((a, b) => b.fill - a.fill);
                player.currentTarget = withFill[0].socketId;
                break;
            }
        }
    }

    /**
     * Get all alive players.
     */
    getAlivePlayers(): MinesPlayer[] {
        return Array.from(this.players.values()).filter(p => p.alive);
    }

    /**
     * Count how many alive players are targeting a given player.
     * Displayed as "badge" count / incoming attack indicator.
     */
    getAttackerCount(socketId: string): number {
        let count = 0;
        for (const p of this.players.values()) {
            if (p.alive && p.socketId !== socketId && p.currentTarget === socketId) {
                count++;
            }
        }
        return count;
    }

    /**
     * Build serializable state for broadcasting to all clients.
     */
    getState(): MinesState {
        const players = Array.from(this.players.values()).map(p => ({
            socketId: p.socketId,
            username: p.username,
            userId: p.userId,
            avatarUrl: p.avatarUrl,
            alive: p.alive,
            depth: p.depth,
            kos: p.kos,
            targetingMode: p.targetingMode,
            currentTarget: p.currentTarget,
            isBot: p.socketId === MinesRoom.BOT_ID,
            depthLevel: getDepthLevel(p.depth).level,
        }));

        // Sort: alive first (by depth desc), then dead (by depth desc)
        players.sort((a, b) => {
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            return b.depth - a.depth;
        });

        return {
            players,
            activePlayers: this.getAlivePlayers().length,
            totalPlayers: this.players.size,
            seed: this.seed,
            highestLevel: this.getHighestAliveLevel(),
        };
    }

    /**
     * Get compact player list for sidebar display (minimal data).
     */
    getPlayerList(): {
        socketId: string;
        username: string;
        depth: number;
        alive: boolean;
        kos: number;
        attackers: number;
        isBot?: boolean;
        depthLevel: number;
    }[] {
        return Array.from(this.players.values())
            .map(p => ({
                socketId: p.socketId,
                username: p.username,
                depth: p.depth,
                alive: p.alive,
                kos: p.kos,
                attackers: this.getAttackerCount(p.socketId),
                isBot: p.socketId === MinesRoom.BOT_ID ? true : undefined,
                depthLevel: getDepthLevel(p.depth).level,
            }))
            .sort((a, b) => {
                if (a.alive !== b.alive) return a.alive ? -1 : 1;
                return b.depth - a.depth;
            });
    }
}

// Singleton instance — the mines lobby is always available
export const minesRoom = new MinesRoom();
