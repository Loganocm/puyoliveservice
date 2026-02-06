export class XpCalculator {
    /**
     * Calculate XP required to complete the current level
     * Formula: Base 100 + (15 * Level)
     * Must match server/services/xp.service.ts
     */
    static getXpForNextLevel(level: number): number {
        return 100 + (15 * level);
    }

    /**
     * Calculate XP reward for singleplayer
     * Based on Score
     */
    static calculateSingleplayerXp(score: number): number {
        const xp = Math.floor(score / 100);
        return Math.min(xp, 2500);
    }

    /**
     * Calculate XP reward for multiplayer (Estimation for UI)
     */
    static calculateMultiplayerXp(isWinner: boolean, durationSeconds: number): number {
        // Base rewards
        let xp = isWinner ? 500 : 150;

        // Time bonus: 10 XP per minute (caps at 10 mins/100xp)
        const minutes = Math.floor(durationSeconds / 60);
        const timeBonus = Math.min(minutes * 10, 100);
        xp += timeBonus;

        return Math.floor(xp);
    }
}
