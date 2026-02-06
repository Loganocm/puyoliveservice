import { GameEngine } from './GameEngine';

// Replay input types (must match server)
export type InputType = 'L' | 'R' | 'CW' | 'CC' | 'SD' | 'SU' | 'HD';

export interface ReplayInput {
    f: number;      // Frame number
    p: 0 | 1;       // Player index
    i: InputType;   // Input type
}

export interface ReplayPlayer {
    id: string;
    username: string;
    userId?: number;
    elo?: number;
}

export interface ReplayFile {
    version: 2;
    seed: number;
    players: ReplayPlayer[];
    winner: 0 | 1 | null;
    duration: number;
    fps: number;
    inputs: ReplayInput[];
}

// Check if data is V2 format
export function isReplayFileV2(data: any): data is ReplayFile {
    return data && data.version === 2 && Array.isArray(data.inputs);
}

/**
 * ReplayEngine - Deterministic playback of recorded games
 * Simulates both players' games simultaneously using recorded inputs
 */
export class ReplayEngine {
    private engines: [GameEngine, GameEngine];
    private replayData: ReplayFile;
    private currentFrame: number = 0;
    private inputCursor: number = 0;

    // Playback state
    private _isPaused: boolean = false;
    private _playbackSpeed: number = 1.0;
    private _isComplete: boolean = false;

    // Callbacks
    public onFrameUpdate?: (frame: number, total: number) => void;
    public onGameOver?: (winnerIndex: 0 | 1 | null) => void;

    constructor(replayData: ReplayFile) {
        this.replayData = replayData;

        // Create two engines with identical seeds for deterministic playback
        const engine1 = new GameEngine(replayData.seed);
        const engine2 = new GameEngine(replayData.seed);
        engine1.isReplaying = true;
        engine2.isReplaying = true;
        this.engines = [engine1, engine2];
    }

    get player1Engine(): GameEngine {
        return this.engines[0];
    }

    get player2Engine(): GameEngine {
        return this.engines[1];
    }

    get isPaused(): boolean {
        return this._isPaused;
    }

    get playbackSpeed(): number {
        return this._playbackSpeed;
    }

    get isComplete(): boolean {
        return this._isComplete;
    }

    get progress(): number {
        return this.replayData.duration > 0
            ? this.currentFrame / this.replayData.duration
            : 0;
    }

    get players(): ReplayPlayer[] {
        return this.replayData.players;
    }

    get winnerIndex(): 0 | 1 | null {
        return this.replayData.winner;
    }

    /**
     * Main update loop - call each frame
     */
    update(dt: number = 1.0): void {
        if (this._isPaused || this._isComplete) return;

        // Process inputs at correct frame
        while (this.inputCursor < this.replayData.inputs.length) {
            const input = this.replayData.inputs[this.inputCursor];
            if (input.f <= this.currentFrame) {
                this.executeInput(input);
                this.inputCursor++;
            } else {
                break;
            }
        }

        // Advance both engines
        const scaledDt = dt * this._playbackSpeed;
        this.engines[0].update(scaledDt);
        this.engines[1].update(scaledDt);

        this.currentFrame++;

        // Check for completion
        if (this.currentFrame >= this.replayData.duration) {
            this._isComplete = true;
            this.onGameOver?.(this.replayData.winner);
        }

        // Callback
        this.onFrameUpdate?.(this.currentFrame, this.replayData.duration);
    }

    /**
     * Execute input on the appropriate player's engine
     */
    private executeInput(input: ReplayInput): void {
        const engine = this.engines[input.p];

        switch (input.i) {
            case 'L':
                engine.movePiece(-1);
                break;
            case 'R':
                engine.movePiece(1);
                break;
            case 'CW':
                engine.rotate(1);
                break;
            case 'CC':
                engine.rotate(-1);
                break;
            case 'SD':
                engine.setSoftDrop(true);
                break;
            case 'SU':
                engine.setSoftDrop(false);
                break;
            case 'HD':
                engine.hardDrop();
                break;
        }
    }

    // Playback controls
    pause(): void {
        this._isPaused = true;
    }

    resume(): void {
        this._isPaused = false;
    }

    togglePause(): void {
        this._isPaused = !this._isPaused;
    }

    setSpeed(speed: number): void {
        this._playbackSpeed = Math.max(0.25, Math.min(4.0, speed));
    }

    /**
     * Seek to a specific frame (resets and replays to that point)
     */
    seekToFrame(targetFrame: number): void {
        // Reset engines
        const engine1 = new GameEngine(this.replayData.seed);
        const engine2 = new GameEngine(this.replayData.seed);
        engine1.isReplaying = true;
        engine2.isReplaying = true;
        this.engines = [engine1, engine2];

        this.currentFrame = 0;
        this.inputCursor = 0;
        this._isComplete = false;

        // Fast-forward to target
        const wasPaused = this._isPaused;
        this._isPaused = false;

        while (this.currentFrame < targetFrame && !this._isComplete) {
            this.update(1.0);
        }

        this._isPaused = wasPaused;
    }

    /**
     * Seek by percentage (0.0 - 1.0)
     */
    seekToPercent(percent: number): void {
        const targetFrame = Math.floor(this.replayData.duration * Math.max(0, Math.min(1, percent)));
        this.seekToFrame(targetFrame);
    }

    /**
     * Get current time string (MM:SS)
     */
    getTimeString(): string {
        const fps = this.replayData.fps || 60;
        const currentSeconds = Math.floor(this.currentFrame / fps);
        const totalSeconds = Math.floor(this.replayData.duration / fps);

        const formatTime = (s: number) => {
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return `${m}:${sec.toString().padStart(2, '0')}`;
        };

        return `${formatTime(currentSeconds)} / ${formatTime(totalSeconds)}`;
    }
}
