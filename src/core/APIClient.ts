import { NetworkManager } from './NetworkManager';
import { AuthManager } from './AuthManager';

const BASE_URL = 'https://game.puyo.live'; // Fallback

export class APIClient {
    private static getBaseUrl(): string {
        // Try to reuse the URL detected by NetworkManager, or fallback
        let url = NetworkManager.serverUrl || BASE_URL;
        // Ensure no trailing slash
        if (url.endsWith('/')) url = url.slice(0, -1);
        return url;
    }

    public static async getLeaderboard(limit: number = 20, offset: number = 0): Promise<{ leaderboard: any[] }> {
        const url = `${this.getBaseUrl()}/api/leaderboard?limit=${limit}&offset=${offset}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch leaderboard');
            return await res.json();
        } catch (e) {
            console.error('APIClient: getLeaderboard failed', e);
            // Return mock/empty for now to prevent crash
            return { leaderboard: [] };
        }
    }

    public static async getMe(): Promise<any> {
        const token = AuthManager.token;
        if (!token) throw new Error('Not authenticated');

        const url = `${this.getBaseUrl()}/api/users/me`;
        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error('Failed to fetch user stats');
            return await res.json();
        } catch (e) {
            console.error('APIClient: getMe failed', e);
            throw e;
        }
    }
}
