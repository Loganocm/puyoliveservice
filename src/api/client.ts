export class APIClient {
    private static baseUrl = import.meta.env.VITE_API_URL ||
        (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:8080/api'
            : 'https://api.puyo.live/api');

    private static async request(endpoint: string, options: RequestInit = {}, retries: number = 3) {
        const token = localStorage.getItem('puyolive_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...options.headers as any,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}${endpoint}`, {
                    ...options,
                    headers,
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    // Don't retry auth/client errors — only server/network issues
                    const err = new Error(data.error || data.message || 'Request failed') as any;
                    err.status = response.status;
                    throw err;
                }

                return data;
            } catch (err: any) {
                // If it's a client error (4xx), don't retry
                if (err.status && err.status >= 400 && err.status < 500) {
                    throw err;
                }

                // Network error or 5xx — retry with backoff
                if (attempt < retries - 1) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    console.warn(`[APIClient] Request to ${endpoint} failed (attempt ${attempt + 1}/${retries}), retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw err;
                }
            }
        }
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

    static async getUserProfile(identifier: string | number) {
        return this.request(`/users/${identifier}`);
    }

    static async searchUsers(query: string, limit: number = 10) {
        return this.request(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    }

    static async getAllPlayers(limit: number = 20, offset: number = 0) {
        return this.request(`/users/all?limit=${limit}&offset=${offset}`);
    }

    static async getRecentMatches(limit: number = 10) {
        return this.request(`/matches/recent/all?limit=${limit}`);
    }

    static async getLeaderboardStats() {
        return this.request(`/leaderboard/stats`);
    }

    static async getUserPercentiles(userId: number) {
        return this.request(`/leaderboard/percentiles/${userId}`);
    }

    // ── Admin API ──

    static async adminGetStats() {
        return this.request('/admin/stats');
    }

    static async adminGetUsers(page: number = 1, limit: number = 25, search: string = '') {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.set('search', search);
        return this.request(`/admin/users?${params}`);
    }

    static async adminGetUser(id: number) {
        return this.request(`/admin/users/${id}`);
    }

    static async adminUpdateUser(id: number, data: Record<string, any>) {
        return this.request(`/admin/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    static async adminDeleteUser(id: number) {
        return this.request(`/admin/users/${id}`, { method: 'DELETE' });
    }
}
