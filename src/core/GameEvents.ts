import { EventEmitter } from 'eventemitter3';

type GameEventMap = {
    'score_change': { score: number };
    'garbage_change': { queue: number; tray: number };
    'level_change': { level: number };
    'game_start': void;
    'game_over': {
        score: number;
        message: string;
        isTimeTrial?: boolean;
        maxChain?: number;
        puyosCleared?: number;
        timeLimit?: number;
        result?: 'win' | 'loss' | 'forfeit';
    };
    'game_pause': { timeLimit: number };
    'game_resume': void;
    'pause_toggle': { paused: boolean };
    'match_ready': { opponent: { username: string; elo: number; avatar_url?: string } };
    'next_queue': { pieces: any[] }; // TBD structure
    'exit_game': void;
    'menu_back': void;
    'user_update': any; // Should by User | null but circular dep risk if we import User from AuthManager. Using any for now or move types.
    'match_result': {
        matchId: number;
        result: 'win' | 'loss';
        xp_gained: number;
        new_level: number;
        new_xp: number;
        elo_change: number;
        new_elo: number;
    };
    // Replay Events
    'replay_update': {
        currentFrame: number;
        totalFrames: number;
        isPaused: boolean;
        speed: number;
        isLoaded: boolean;
    };
    'replay_control': {
        action: 'play' | 'pause' | 'seek' | 'speed' | 'exit';
        value?: number; // frame for seek, multiplier for speed
    };
    'replay_loaded': {};
    'replay_match_result': { winner: string };
    'replay_match_result_clear': {};
    'bgm_state_change': { isPlaying: boolean; songName: string; artist: string } | null;
    // Puyo Mines (Quick Play) events
    'mines_died': { depth: number; kos: number; score: number };
    'mines_left': void;
    'mines_level_up': { level: number; name: string; color: number };
};

class GameEventEmitter extends EventEmitter<GameEventMap> { }

export const GameEvents = new GameEventEmitter();
