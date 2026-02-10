import { AuthManager } from './AuthManager';

const BASE_URL = 'https://game.puyo.live'; // Fallback

export class APIClient {
    private static getBaseUrl(): string {
        if (typeof window === 'undefined') return BASE_URL;

        // Production / Staging
        if (window.location.hostname !== 'localhost') {
            return 'https://api.puyo.live';
        }

        // Local Development
        // API is standardly on port 3000 or 3002 (Socket is 3001)
        // Check env var or default to 3000
        return import.meta.env.VITE_API_URL || 'http://localhost:3000';
    }

    public static async getLeaderboard(limit: number = 20, offset: number = 0): Promise<{ leaderboard: any[] }> {
        const url = `${this.getBaseUrl()}/api/leaderboard?limit=${limit}&offset=${offset}`;
        console.log('[APIClient] Fetching leaderboard:', url);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch leaderboard');
        return await res.json();
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
