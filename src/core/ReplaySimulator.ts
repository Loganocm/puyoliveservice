import { GameEngine, GameState } from './GameEngine';
import type { ReplayFileV3, ReplayInput } from './ReplayEngine';
import { PuyoColor, COLS } from './Constants';

/**
 * Snapshot of a single player's board at a specific frame.
 * Contains all state needed for rendering — no GameEngine required during playback.
 */
export interface BoardSnapshot {
    grid: number[][];                                      // Column-major [col][row]
    activePiece: {
        x: number; y: number; rot: number;
        mainColor: PuyoColor; subColor: PuyoColor;
    } | null;
    nextPieces: { main: PuyoColor; sub: PuyoColor }[];
    garbageQueue: number;
    nuisanceTray: number;
    score: number;
    chainCount: number;
    maxChain: number;
    puyosCleared: number;
    state: typeof GameState[keyof typeof GameState];
    stateTimer: number;
    fallingGarbage: { c: number; r: number; destR: number; delay: number }[];
    fallingDestinations: { c: number; r: number; destR: number }[];
    matchedPuyos: { c: number; r: number }[][];
}

/**
 * Snapshot of the full game state at a specific frame (both players).
 */
export interface FrameSnapshot {
    boards: [BoardSnapshot, BoardSnapshot];
}

/**
 * Captures a BoardSnapshot from a live GameEngine instance.
 * Deep-copies all mutable data so the snapshot is independent of future engine state.
 */
function captureBoard(engine: GameEngine): BoardSnapshot {
    // Deep copy grid
    const grid: number[][] = [];
    for (let c = 0; c < COLS; c++) {
        grid.push([...engine.board.grid[c]]);
    }

    // Deep copy active piece
    const piece = engine.activePiece;
    const activePiece = piece ? {
        x: piece.x, y: piece.y, rot: piece.rot,
        mainColor: piece.mainColor, subColor: piece.subColor,
    } : null;

    // Deep copy next pieces (up to 3)
    const nextPieces = engine.nextPieces.slice(0, 3).map(p => ({ main: p.main, sub: p.sub }));

    // Deep copy animation arrays
    const fallingGarbage = engine.fallingGarbage.map(g => ({ ...g }));
    const fallingDestinations = engine.fallingDestinations.map(f => ({ ...f }));
    const matchedPuyos = engine.matchedPuyos.map(group =>
        group.map(p => ({ c: p.c, r: p.r }))
    );

    return {
        grid,
        activePiece,
        nextPieces,
        garbageQueue: engine.garbageQueue,
        nuisanceTray: engine.nuisanceTray,
        score: engine.stats.score,
        chainCount: engine.stats.chainCount,
        maxChain: engine.stats.maxChain,
        puyosCleared: engine.stats.puyosCleared,
        state: engine.state,
        stateTimer: engine.stateTimer,
        fallingGarbage,
        fallingDestinations,
        matchedPuyos,
    };
}

/**
 * ReplaySimulator — Pre-runs an entire replay to produce frame snapshots.
 *
 * V3: Accepts ReplayFileV3 format with:
 * - Per-player settings (each player's SDF/softDropProtection applied individually)
 * - State hash validation (periodic board hashes compared to recorded values)
 * - Desync detection and diagnostics logging
 *
 * This is the core of the pre-rendered replay system. By running the simulation
 * upfront, we eliminate ALL forms of desync during playback. The snapshots ARE
 * the ground truth. Playback simply reads from the array.
 *
 * Memory budget: ~350 bytes per frame × 2 players × ~18K frames (5 min) ≈ 6 MB
 */
export class ReplaySimulator {
    private replayData: ReplayFileV3;

    constructor(replayData: ReplayFileV3) {
        this.replayData = replayData;
    }

    /**
     * Run the entire replay simulation and return snapshots for every frame.
     * @param onProgress Optional callback for loading UI (0.0 to 1.0)
     * @returns Array of FrameSnapshot, one per logical frame
     */
    simulate(onProgress?: (progress: number) => void): FrameSnapshot[] {
        const { seed, inputs, duration } = this.replayData;

        // Create two engines with identical seeds (matches live game)
        const engine1 = new GameEngine(seed);
        const engine2 = new GameEngine(seed);
        engine1.isReplaying = true;
        engine2.isReplaying = true;
        // Prevent engine.update() from calling processReplayFrame() internally;
        // this simulator drives input application externally via executeInput().
        engine1.externalReplayControl = true;
        engine2.externalReplayControl = true;

        // V3: Apply per-player settings for deterministic replay
        // Each player can have different SDF/softDropProtection values.
        const playerSettings = this.replayData.playerSettings;
        if (playerSettings) {
            // Player 0 settings
            if (playerSettings[0]) {
                if (typeof playerSettings[0].sdf === 'number') {
                    engine1.replaySDF = playerSettings[0].sdf;
                }
                if (typeof playerSettings[0].softDropProtection === 'boolean') {
                    engine1.replaySoftDropProtection = playerSettings[0].softDropProtection;
                }
            }
            // Player 1 settings (may differ from player 0)
            if (playerSettings[1]) {
                if (typeof playerSettings[1].sdf === 'number') {
                    engine2.replaySDF = playerSettings[1].sdf;
                }
                if (typeof playerSettings[1].softDropProtection === 'boolean') {
                    engine2.replaySoftDropProtection = playerSettings[1].softDropProtection;
                }
            }
        }

        // Sort inputs by frame (safety)
        const sortedInputs = [...(inputs || [])].sort((a, b) => a.f - b.f);

        // V3.1: Build state hash lookups for validation (now per-player and independent)
        const stateHashes = this.replayData.stateHashes || [];
        const hash0Map = new Map<number, string>();
        const hash1Map = new Map<number, string>();
        for (const sh of stateHashes) {
            if (sh.p === 0) hash0Map.set(sh.f, sh.h);
            else hash1Map.set(sh.f, sh.h);
        }
        let desyncCount = 0;

        const snapshots: FrameSnapshot[] = [];
        let inputCursor = 0;
        let currentFrame = 0;
        let gameEndedFrame = -1;

        // Capture frame 0 (initial state)
        snapshots.push({
            boards: [captureBoard(engine1), captureBoard(engine2)],
        });

        // Allow the simulation to run until Game Over settles visually, or up to 600 frames past the recorded duration to catch the death animations.
        const maxFrames = Math.min(duration + 600, 360000); // hard cap at 100 minutes

        try {
            // Simulate frame by frame
            while (currentFrame < maxFrames) {
                currentFrame++;

                // 1. Process inputs BEFORE engine update.
                // In the live game: engine.update() runs → handleInput() runs → inputs are recorded.
                // The server records the input at the current room.frameCount (post-tick).
                // So an input at frame N was executed by the player AFTER engine frame N ran.
                // When the next engine.update() (frame N+1) runs, the input's effect is already
                // applied (movePiece/rotate/etc. mutated the engine state directly).
                // Therefore: apply inputs for frame N BEFORE running engine.update() for frame N+1.
                while (inputCursor < sortedInputs.length) {
                    const input = sortedInputs[inputCursor];
                    if (input.f < currentFrame) {
                        this.executeInput(input, engine1, engine2);
                        inputCursor++;
                    } else {
                        break;
                    }
                }

                // 2. Advance both engines by exactly 1 logical frame
                engine1.update(1.0);
                engine2.update(1.0);

                // 3. V3.1: State hash validation at checkpoints (per-player)
                const expectedHash0 = hash0Map.get(currentFrame);
                if (expectedHash0) {
                    const actualHash0 = engine1.computeBoardHash();
                    if (actualHash0 !== expectedHash0) {
                        desyncCount++;
                        console.warn(
                            `[ReplaySimulator] DESYNC DETECTED — Player 0 at frame ${currentFrame}`,
                            `\n  Expected: ${expectedHash0}`,
                            `\n  Actual:   ${actualHash0}`,
                            `\n  Score: ${engine1.stats.score}, GarbageQ: ${engine1.garbageQueue}, Tray: ${engine1.nuisanceTray}`,
                            `\n  State: ${engine1.state}, Seed: ${engine1.getSeed()}`
                        );
                    }
                }

                const expectedHash1 = hash1Map.get(currentFrame);
                if (expectedHash1) {
                    const actualHash1 = engine2.computeBoardHash();
                    if (actualHash1 !== expectedHash1) {
                        desyncCount++;
                        console.warn(
                            `[ReplaySimulator] DESYNC DETECTED — Player 1 at frame ${currentFrame}`,
                            `\n  Expected: ${expectedHash1}`,
                            `\n  Actual:   ${actualHash1}`,
                            `\n  Score: ${engine2.stats.score}, GarbageQ: ${engine2.garbageQueue}, Tray: ${engine2.nuisanceTray}`,
                            `\n  State: ${engine2.state}, Seed: ${engine2.getSeed()}`
                        );
                    }
                }

                // 4. Capture snapshot
                snapshots.push({
                    boards: [captureBoard(engine1), captureBoard(engine2)],
                });

                // 5. Report progress (every 100 frames to avoid callback overhead)
                if (onProgress && currentFrame % 100 === 0) {
                    onProgress(Math.min(currentFrame / duration, 1.0));
                }

                // 6. Check for Game Over Truncation
                if (gameEndedFrame === -1 && (engine1.state === GameState.GAMEOVER || engine2.state === GameState.GAMEOVER)) {
                    gameEndedFrame = currentFrame;
                }
                if (gameEndedFrame !== -1 && currentFrame > gameEndedFrame + 60) {
                    break;
                }
            }
        } catch (error) {
            console.error(`[ReplaySimulator] CRITICAL SIMULATION CRASH at frame ${currentFrame}/${maxFrames}`);
            console.error(`[ReplaySimulator] Error Context:`, error);
            console.error(`[ReplaySimulator] Pending Inputs Queue cursor at ${inputCursor}. Next 5 inputs:`, sortedInputs.slice(inputCursor, inputCursor + 5));
            console.error(`[ReplaySimulator] Engine 1 State: ${engine1.state}, Board Active Piece: ${engine1.activePiece ? 'Yes' : 'No'}`);
            console.error(`[ReplaySimulator] Engine 2 State: ${engine2.state}, Board Active Piece: ${engine2.activePiece ? 'Yes' : 'No'}`);
            throw new Error(`Replay parsing failed at frame ${currentFrame}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // V3: Report validation results
        if (stateHashes.length > 0) {
            if (desyncCount === 0) {
                console.log(`[ReplaySimulator] ✓ All ${stateHashes.length} state hashes validated — replay is 1:1 accurate`);
            } else {
                console.error(`[ReplaySimulator] ✗ ${desyncCount} desync(s) detected across ${stateHashes.length} checkpoints`);
            }
        } else {
            console.log(`[ReplaySimulator] No state hashes in replay data — validation skipped`);
        }

        onProgress?.(1.0);
        return snapshots;
    }

    /**
     * Execute a replay input on the appropriate player's engine.
     */
    private executeInput(input: ReplayInput, engine1: GameEngine, engine2: GameEngine): void {
        const engine = input.p === 0 ? engine1 : engine2;

        switch (input.i) {
            case 'L':  engine.movePiece(-1); break;
            case 'R':  engine.movePiece(1);  break;
            case 'CW': engine.rotate(1);     break;
            case 'CC': engine.rotate(-1);    break;
            case 'SD': engine.setSoftDrop(true);  break;
            case 'SU': engine.setSoftDrop(false); break;
            case 'HD': engine.hardDrop();    break;
            case 'G':  engine.addGarbage(input.a ?? 0); break;
        }
    }
}
