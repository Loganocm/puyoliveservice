import type { BoardSnapshot, FrameSnapshot } from './ReplaySimulator';
import { ReplaySimulator } from './ReplaySimulator';

// Replay input types (must match server)
export type InputType = 'L' | 'R' | 'CW' | 'CC' | 'SD' | 'SU' | 'HD' | 'G';

export interface ReplayInput {
    f: number;      // Frame number
    p: 0 | 1;       // Player index
    i: InputType;   // Input type
    a?: number;     // Amount (for Garbage 'G')
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
 * ReplayEngine — Snapshot-based playback of pre-rendered replays.
 *
 * Instead of running GameEngine instances in real-time (which requires perfect
 * timing parity with the live game), this engine reads from a pre-computed
 * FrameSnapshot[] array. This eliminates ALL forms of desync by design.
 *
 * Playback just advances a frame counter. Seeking is instant (array index).
 * Memory is freed when dispose() is called on exit.
 */
export class ReplayEngine {
    private replayData: ReplayFile;
    private snapshots: FrameSnapshot[] | null = null;
    private currentFrame: number = 0;
    private accumulator: number = 0;

    // Playback state
    private _isPaused: boolean = true; // Start paused until simulation completes
    private _playbackSpeed: number = 1.0;
    private _isComplete: boolean = false;
    private _isLoaded: boolean = false;

    // Callbacks
    public onFrameUpdate?: (frame: number, total: number) => void;
    public onGameOver?: (winnerIndex: 0 | 1 | null) => void;
    public onLoadProgress?: (progress: number) => void;
    public onLoaded?: () => void;

    constructor(replayData: ReplayFile) {
        this.replayData = replayData;

        // Safety: ensure duration is valid
        if (!Number.isFinite(replayData.duration) || replayData.duration <= 0) {
            const lastInput = replayData.inputs[replayData.inputs.length - 1];
            this.replayData = { ...replayData, duration: (lastInput?.f ?? 0) + 60 };
        }
    }

    /**
     * Pre-simulate the entire replay. Call this before starting playback.
     * Runs synchronously (~50-200ms for a typical match).
     */
    load(): void {
        const simulator = new ReplaySimulator(this.replayData);
        this.snapshots = simulator.simulate((progress) => {
            this.onLoadProgress?.(progress);
        });
        this._isLoaded = true;
        this._isPaused = false; // Auto-play after load
        this.onLoaded?.();
        this.onFrameUpdate?.(0, this.totalFrames);
    }

    /**
     * Get the current frame's snapshot for rendering.
     */
    getSnapshot(): FrameSnapshot | null {
        if (!this.snapshots || this.snapshots.length === 0) return null;
        const idx = Math.min(this.currentFrame, this.snapshots.length - 1);
        return this.snapshots[idx];
    }

    /**
     * Get a specific player's board snapshot for the current frame.
     */
    getPlayerBoard(playerIndex: 0 | 1): BoardSnapshot | null {
        const snap = this.getSnapshot();
        return snap ? snap.boards[playerIndex] : null;
    }

    // --- Getters ---

    get isPaused(): boolean { return this._isPaused; }
    get playbackSpeed(): number { return this._playbackSpeed; }
    get isComplete(): boolean { return this._isComplete; }
    get isLoaded(): boolean { return this._isLoaded; }
    get frame(): number { return this.currentFrame; }

    get totalFrames(): number {
        return this.snapshots ? this.snapshots.length - 1 : this.replayData.duration;
    }

    get progress(): number {
        const total = this.totalFrames;
        return total > 0 ? this.currentFrame / total : 0;
    }

    get players(): ReplayPlayer[] { return this.replayData.players; }
    get winnerIndex(): 0 | 1 | null { return this.replayData.winner; }

    /**
     * Main update loop. Call each render frame with Pixi deltaTime.
     * Advances frame counter based on playback speed. No engine simulation.
     */
    update(dt: number): void {
        if (this._isPaused || this._isComplete || !this.snapshots) return;

        this.accumulator += dt * this._playbackSpeed;

        // Advance frame by frame
        while (this.accumulator >= 1.0 && !this._isComplete) {
            this.accumulator -= 1.0;
            this.currentFrame++;

            // Check completion
            if (this.currentFrame >= this.totalFrames) {
                this.currentFrame = this.totalFrames;
                this._isComplete = true;
                this.onGameOver?.(this.replayData.winner);
            }
        }

        this.onFrameUpdate?.(this.currentFrame, this.totalFrames);
    }

    /**
     * Seek to a specific frame. INSTANT — just changes the array index.
     * No engine rebuild, no fast-forward, no callback suppression needed.
     */
    seekToFrame(targetFrame: number): void {
        if (!this.snapshots) return;

        this.currentFrame = Math.max(0, Math.min(targetFrame, this.totalFrames));
        this.accumulator = 0;
        this._isComplete = this.currentFrame >= this.totalFrames;

        this.onFrameUpdate?.(this.currentFrame, this.totalFrames);
    }

    // --- Playback Controls ---

    pause(): void { this._isPaused = true; }

    resume(): void {
        if (!this._isLoaded) return;
        this._isPaused = false;
        // If we were at the end, restart
        if (this._isComplete) {
            this.currentFrame = 0;
            this._isComplete = false;
        }
    }

    togglePause(): void {
        if (this._isPaused) this.resume();
        else this.pause();
    }

    setSpeed(speed: number): void {
        this._playbackSpeed = Math.max(0.25, Math.min(4.0, speed));
    }

    /**
     * Format current playback time as "M:SS / M:SS"
     */
    getTimeString(): string {
        const fps = this.replayData.fps || 60;
        const cur = Math.floor(this.currentFrame / fps);
        const tot = Math.floor(this.totalFrames / fps);
        const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
        return `${fmt(cur)} / ${fmt(tot)}`;
    }

    /**
     * Release all snapshot memory. MUST be called on exit.
     * After this, the engine is unusable.
     */
    dispose(): void {
        this.snapshots = null;
        this._isLoaded = false;
        this._isComplete = true;
        this._isPaused = true;
        this.onFrameUpdate = undefined;
        this.onGameOver = undefined;
        this.onLoadProgress = undefined;
        this.onLoaded = undefined;
    }
}
