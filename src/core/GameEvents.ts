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
    'user_update': any; // Should by User | null but circular dep risk if we import User from AuthManager. Using any for now or move types.
};

class GameEventEmitter extends EventEmitter<GameEventMap> { }

export const GameEvents = new GameEventEmitter();
