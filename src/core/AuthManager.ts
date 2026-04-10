import { APIClient } from '../api/client';
import { NetworkManager } from './NetworkManager';

export interface User {
    id: number;
    username: string;
    elo_rating: number;
    avatar_url?: string;
    email?: string | null;
    rank?: number;
    games_played: number;
    games_won: number;
    games_lost: number;
    highest_chain: number;
    total_garbage_sent: number;
    level?: number;
    current_xp?: number;
    is_admin?: boolean;
}

export class AuthManager {
    public static currentUser: User | null = null;
    public static isGuest: boolean = false;
    public static token: string | null = localStorage.getItem('puyolive_token');

    /**
     * Initialize auth state on startup (validate token)
     */
    static async init(): Promise<boolean> {
        // Listen for socket connection to re-authenticate
        NetworkManager.on('connect', () => {
            if (this.token) {
                NetworkManager.authenticate(this.token);
            }
        });

        // Listen for match results to update user state immediately
        NetworkManager.on('match_result', (data: any) => {
            console.log("Auth: Received match_result", data);
            if (this.currentUser) {
                // Update local user state
                this.currentUser.level = data.new_level;
                this.currentUser.current_xp = data.new_xp;
                this.currentUser.elo_rating = data.new_elo;
                // Note: rank might need refresh, but we don't have it in match_result usually unless we added it? 
                // We added level/xp/elo. Rank is global so might need refreshProfile eventually, but this is good for instant feedback.

                // Notify app of User Update
                import('./GameEvents').then(({ GameEvents }) => {
                    GameEvents.emit('user_update', { ...this.currentUser }); // Spread to ensure new reference for React

                    // Forward match_result for GameOverlay
                    GameEvents.emit('match_result', data);
                });
            }
        });

        if (this.token) {
            try {
                this.currentUser = await APIClient.getMe();
                this.isGuest = false;
                console.log('Auth: Valid user session restored', this.currentUser);

                if (NetworkManager.isConnected) {
                    NetworkManager.authenticate(this.token);
                }

                // Notify app
                import('./GameEvents').then(({ GameEvents }) => {
                    GameEvents.emit('user_update', this.currentUser);
                });

                return true;
            } catch (e) {
                console.warn('Auth: Session invalid', e);
                this.logout();
                return false;
            }
        }
        return false; // No token or invalid
    }

    /**
     * Refresh user profile from server
     */
    static async refreshProfile(): Promise<void> {
        if (!this.token) return;
        try {
            const user = await APIClient.getMe();
            this.currentUser = user;
            // Update local storage if needed or just cache
            console.log("Auth: Profile refreshed:", user);

            import('./GameEvents').then(({ GameEvents }) => {
                GameEvents.emit('user_update', this.currentUser);
            });
        } catch (e) {
            console.warn("Auth: Failed to refresh profile", e);
        }
    }

    static async login(username: string, password: string) {
        const response = await APIClient.login(username, password);
        this.setSession(response.user, response.token);
        NetworkManager.authenticate(response.token);
    }

    static async register(username: string, password: string, email?: string) {
        const response = await APIClient.register(username, password, email);
        this.setSession(response.user, response.token);
        NetworkManager.authenticate(response.token);
    }

    /**
     * Enter as guest
     */
    static loginAsGuest() {
        this.logout(false); // Clear existing but don't reload
        this.isGuest = true;
        this.currentUser = {
            id: -1,
            username: "Guest",
            elo_rating: 0,
            games_played: 0,
            games_won: 0,
            games_lost: 0,
            highest_chain: 0,
            total_garbage_sent: 0
        };
        // We do NOT set a token for guests
        console.log('Auth: Logged in as Guest');

        // Force reconnect to clear any server-side auth state
        const url = NetworkManager.serverUrl;
        NetworkManager.connect(url);
    }

    static logout(reload: boolean = true) {
        this.token = null;
        this.currentUser = null;
        this.isGuest = false;
        localStorage.removeItem('puyolive_token');

        import('./GameEvents').then(({ GameEvents }) => {
            GameEvents.emit('user_update', null);
        });

        if (reload) {
            window.location.reload();
        }
    }

    private static setSession(user: User, token: string) {
        this.token = token;
        this.currentUser = user;
        this.isGuest = false;
        localStorage.setItem('puyolive_token', token);
        console.log('Auth: Logged in as', user.username);

        import('./GameEvents').then(({ GameEvents }) => {
            GameEvents.emit('user_update', this.currentUser);
        });
    }

    /**
     * Get header auth token if authenticated
     */
    static getToken() {
        return this.token;
    }

    /**
     * Check if user is authenticated (not a guest)
     */
    static isAuthenticated(): boolean {
        return this.token !== null && !this.isGuest;
    }
}
