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
 */

export type TargetingMode = 'random' | 'attackers' | 'badges' | 'vulnerable';

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
    }[];
    activePlayers: number;
    totalPlayers: number;
    seed: number;
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

    // Round tracking
    private roundNumber: number = 0;

    constructor() {
        // Rotate seed periodically for variety
        setInterval(() => {
            if (this.getAlivePlayers().length === 0) {
                this.seed = Date.now();
                this.roundNumber++;
            }
        }, 60000); // Check every minute
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
            targetingMode: 'random',
            currentTarget: null,
            joinedAt: Date.now(),
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
        player.diedAt = undefined;

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
    }[] {
        return Array.from(this.players.values())
            .map(p => ({
                socketId: p.socketId,
                username: p.username,
                depth: p.depth,
                alive: p.alive,
                kos: p.kos,
                attackers: this.getAttackerCount(p.socketId),
            }))
            .sort((a, b) => {
                if (a.alive !== b.alive) return a.alive ? -1 : 1;
                return b.depth - a.depth;
            });
    }
}

// Singleton instance — the mines lobby is always available
export const minesRoom = new MinesRoom();
