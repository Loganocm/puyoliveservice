export class APIClient {
    private static baseUrl = import.meta.env.VITE_API_URL ||
        (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:8080/api'
            : 'https://api.puyo.live/api');

    private static async request(endpoint: string, options: RequestInit = {}) {
        const token = localStorage.getItem('puyolive_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...options.headers as any,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || data.message || 'Request failed');
        }

        return data;
    }

    static async login(username: string, password: string) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
    }

    static async register(username: string, password: string, email?: string) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, email }),
        });
    }

    static async getMe() {
        return this.request('/auth/me');
    }

    static async checkUsername(username: string): Promise<boolean> {
        const res = await this.request('/auth/check', {
            method: 'POST',
            body: JSON.stringify({ username })
        });
        return res.exists;
    }

    /**
     * Upload Avatar
     */
    static async uploadAvatar(userId: number, base64: string): Promise<void> {
        return this.request(`/users/${userId}/avatar`, {
            method: 'POST',
            body: JSON.stringify({ avatar: base64 })
        });
    }

    static async updateProfile(userId: number, data: { username?: string, email?: string, password?: string }) {
        return this.request(`/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    static async getMatchHistory(userId: number, limit: number = 20, offset: number = 0) {
        return this.request(`/matches/user/${userId}?limit=${limit}&offset=${offset}`);
    }

    static async getLeaderboard(limit: number = 50, offset: number = 0) {
        return this.request(`/leaderboard?limit=${limit}&offset=${offset}`);
    }

    static async getReplay(matchId: number) {
        return this.request(`/matches/${matchId}/replay`);
    }
}
