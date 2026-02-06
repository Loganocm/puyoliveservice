export class XpService {
    /**
     * Calculate XP required to complete the current level
     * Formula: Base 100 + (15 * Level)
     * Level 1: 115 XP
     * Level 100: 1600 XP
     * Level 1000: 15100 XP
     */
    static getXpForNextLevel(level: number): number {
        return 100 + (15 * level);
    }

    /**
     * Apply XP gain and calculate resulting level/xp state
     * Handles multi-level jumps (though rare)
     */
    static calculateProgress(currentLevel: number, currentXp: number, xpGained: number, maxLevel: number = 9999): { level: number, xp: number, levelsGained: number } {
        let level = currentLevel;
        let xp = currentXp + xpGained;
        let levelsGained = 0;

        // Loop to handle multiple level ups
        while (xp >= this.getXpForNextLevel(level) && level < maxLevel) {
            xp -= this.getXpForNextLevel(level);
            level++;
            levelsGained++;
        }

        return { level, xp, levelsGained };
    }

    /**
     * Calculate XP reward for a multiplayer match
     */
    static calculateMultiplayerXp(input: {
        isWinner: boolean;
        durationSeconds: number;
        score?: number;
        garbageSent?: number;
    }): number {
        const { isWinner, durationSeconds } = input;

        // Base rewards
        let xp = isWinner ? 500 : 150;

        // Time bonus: 10 XP per minute (caps at 10 mins/100xp to prevent farming)
        const minutes = Math.floor(durationSeconds / 60);
        const timeBonus = Math.min(minutes * 10, 100);
        xp += timeBonus;

        // TODO: Add garbage sent bonus? 
        // For now keep it simple to avoid farming sent garbage

        return Math.floor(xp);
    }

    /**
     * Calculate XP reward for singleplayer
     * Based on Score
     */
    static calculateSingleplayerXp(score: number): number {
        // 50,000 score = 500 XP (Roughly equivalent to a win)
        // 100,000 score = 1000 XP
        // Cap at 2500 XP per game to prevent massive overflow/cheating
        const xp = Math.floor(score / 100);
        return Math.min(xp, 2500);
    }
}
