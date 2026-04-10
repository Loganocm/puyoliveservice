// User-related types
export interface User {
  id: number;
  username: string;
  password_hash: string;
  email: string | null;
  elo_rating: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  highest_chain: number;
  total_garbage_sent: number;
  level: number;
  current_xp: number;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

// Public user profile (no sensitive data)
export interface UserProfile {
  id: number;
  username: string;
  elo_rating: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  highest_chain: number;
  total_garbage_sent: number;
  created_at: Date;
  rank?: number;
  level?: number;
  current_xp?: number;
  win_rate?: number;
  avatar_url?: string;
}

// Registration input
export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
}

// Login input
export interface LoginInput {
  username: string;
  password: string;
}

// Auth response
export interface AuthResponse {
  user: UserProfile & { is_admin?: boolean };
  token: string;
}

// Leaderboard entry
export interface LeaderboardEntry {
  rank: number;
  id: number;
  username: string;
  elo_rating: number;
  games_played: number;
  games_won: number;
  win_rate: number;
}
