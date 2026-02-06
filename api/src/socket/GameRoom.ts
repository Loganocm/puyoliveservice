export interface Player {
    id: string;
    name: string;
    ready: boolean;
    userId?: number;       // API user ID (if authenticated)
    authToken?: string;    // JWT token for API calls
}

export interface MatchStats {
    startedAt: Date;
    player1MaxChain: number;
    player2MaxChain: number;
    player1GarbageSent: number;
    player2GarbageSent: number;
}

export class GameRoom {
    id: string;
    players: Map<string, Player> = new Map();
    maxPlayers: number = 2; // Classic Puyo is 1v1
    matchStats: MatchStats | null = null;
    ranked: boolean = false; // Track if this is a ranked match

    constructor(id: string) {
        this.id = id;
    }

    addPlayer(player: Player): boolean {
        if (this.players.size >= this.maxPlayers) return false;
        this.players.set(player.id, player);
        return true;
    }

    removePlayer(playerId: string) {
        this.players.delete(playerId);
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

    // Check if this is a ranked match (both players authenticated)
    isRankedMatch(): boolean {
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
}
