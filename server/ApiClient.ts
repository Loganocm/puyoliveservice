/**
 * API Client for the game server to communicate with the Puyo Live REST API
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

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

interface MatchResult {
  id: number;
  player1_elo_after: number;
  player2_elo_after: number;
  elo_change: number;
}

interface UserProfile {
  id: number;
  username: string;
  elo_rating: number;
  games_played: number;
  games_won: number;
  total_garbage_sent?: number;
  avatar_url?: string | null;
  rank?: number | null;
}

/**
 * Record a match result with the API
 */
export async function recordMatch(
  params: RecordMatchParams,
  authToken: string
): Promise<MatchResult | null> {
  try {
    const response = await fetch(`${API_URL}/api/matches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
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
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
    const response = await fetch(`${API_URL}/api/users/${userId}`);

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
