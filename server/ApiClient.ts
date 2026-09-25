/**
 * API Client for the game server to communicate with the Puyo Live REST API
 */

import type { RecordedMatch } from './matchResult.js';

// 8080 is the API's own default (api/src/config/index.ts) and its port in
// docker-compose.yml. This fallback was left at 3001 when the API moved off
// that port, so an unconfigured local game server could not reach the API:
// token verification failed and ranked results were never recorded.
// See website/src/content/docs/review/findings.md (OPS-07).
const API_URL = process.env.API_URL || 'http://localhost:8080';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

interface RecordMatchParams {
  player1_id: number;
  player2_id: number;
  winner_id: number;
  room_id?: string;
  duration_seconds?: number;
  player1_max_chain?: number;
  player2_max_chain?: number;
  player1_garbage_sent?: number;
  player2_garbage_sent?: number;
  started_at?: Date;
  replay_data?: any;
}

type MatchResult = RecordedMatch;

interface UserProfile {
  id: number;
  username: string;
  elo_rating: number;
  games_played: number;
  games_won: number;
  total_garbage_sent?: number;
  avatar_url?: string | null;
  rank?: number | null;
  is_admin?: boolean;
}

/**
 * Record a match result with the API (server-to-server, uses internal API key)
 */
export async function recordMatch(
  params: RecordMatchParams
): Promise<MatchResult | null> {
  try {
    const response = await fetch(`${API_URL}/api/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_API_KEY
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to record match:', error);
      return null;
    }

    return await response.json() as MatchResult;
  } catch (error) {
    console.error('API Error recording match:', error);
    return null;
  }
}

/**
 * Verify a user's JWT token
 */
export async function verifyToken(token: string): Promise<UserProfile | null> {
  try {
    // The internal key exempts these calls from the API's per-address rate
    // limits: every player's sign-in reaches the API from this one server
    // (API-09).
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json() as { valid?: boolean; user?: UserProfile };

    if (data.valid && data.user) {
      return data.user;
    }

    return null;
  } catch (error) {
    console.error('API Error verifying token:', error);
    return null;
  }
}

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId: number): Promise<UserProfile | null> {
  try {
    const response = await fetch(`${API_URL}/api/users/${userId}`, {
      headers: { 'X-Internal-Key': INTERNAL_API_KEY }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json() as UserProfile;
  } catch (error) {
    console.error('API Error getting user:', error);
    return null;
  }
}

/**
 * Check API health
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json() as { status?: string };
    return data.status === 'healthy';
  } catch {
    return false;
  }
}
