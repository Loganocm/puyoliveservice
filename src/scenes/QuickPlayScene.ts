/**
 * QuickPlayScene - "Puyo Mines" FFA game scene
 * 
 * Reuses GameEngine for core puyo mechanics but routes all
 * network events through the persistent mines lobby instead of
 * a 1v1 GameRoom. Score is reframed as "depth" in the mines.
 * 
 * Key differences from GameScene:
 * - No roomId; uses NetworkManager.mines* methods
 * - Score → Depth conversion displayed as primary metric
 * - Garbage goes to targeted player (server decides routing)
 * - On death: can respawn immediately (no return to menu)
 * - No replay recording (FFA, not ranked)
 * - Simplified opponent view (target board only)
 */

import { Container, Graphics, Sprite, AnimatedSprite, Text, TextStyle } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { Board } from '../game/Board';
import { CELL_SIZE, COLS, TOTAL_ROWS, PuyoColor, HIDDEN_ROWS } from '../core/Constants';
import { Input } from '../core/Input';
import { ResourceManager } from '../core/ResourceManager';
import { SettingsManager } from '../core/SettingsManager';
import { SoundManager } from '../core/SoundManager';
import { GameEngine, GameState } from '../core/GameEngine';
import { NetworkManager } from '../core/NetworkManager';
import { GameEvents } from '../core/GameEvents';
import { backgroundManager } from '../core/BackgroundManager';
import { Assets } from 'pixi.js';
import { BGMManager } from '../core/BGMManager';

/** Depth = score / 100 */
const DEPTH_DIVISOR = 100;

/** Depth level thresholds (must match server) */
const DEPTH_LEVELS = [
    { depth: 0,    level: 1, name: 'Surface',        color: 0x4ade80 },
    { depth: 500,  level: 2, name: 'Shallow Mines',  color: 0x22d3ee },
    { depth: 1000, level: 3, name: 'Deep Caverns',   color: 0x818cf8 },
    { depth: 2000, level: 4, name: 'Crystal Veins',  color: 0xa78bfa },
    { depth: 3500, level: 5, name: 'Magma Layer',    color: 0xf97316 },
    { depth: 5000, level: 6, name: 'The Abyss',      color: 0xef4444 },
    { depth: 7500, level: 7, name: 'Void Core',      color: 0xdc2626 },
    { depth: 10000,level: 8, name: 'Bedrock',        color: 0x991b1b },
];

function getDepthLevel(depth: number): typeof DEPTH_LEVELS[number] {
    for (let i = DEPTH_LEVELS.length - 1; i >= 0; i--) {
        if (depth >= DEPTH_LEVELS[i].depth) return DEPTH_LEVELS[i];
    }
    return DEPTH_LEVELS[0];
}

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    color: number;
    life: number; maxLife: number;
}

interface TrackedText {
    pixiText: Text;
    elapsed: number;
    duration: number;
    vy: number;
}

export class QuickPlayScene implements IScene {
    container: Container;

    // Visual layers
    private staticBg: Sprite;
    private gameContentWrapper: Container;
    private graphics: Graphics;
    private puyoContainer: Container;
    private effectContainer: Container;
    private uiContainer: Container;
    private targetBoardContainer: Container;
    private targetBoardBorder: Graphics;
    private xMarkerSprite!: AnimatedSprite;

    // Engine
    private engine!: GameEngine;
    private seed: number;

    // Target board (the player we're targeting)
    private targetBoard: Board;

    // Effects
    private particles: Particle[] = [];
    private particleGraphics: Graphics;
    private trackedTexts: TrackedText[] = [];
    private shakeStrength: number = 0;

    // Animations
    private landingAnims: Map<number, { t: number, gcx: number, gcy: number }> = new Map();
    private spawnAnim: number = -1;
    private popAnimProgress: number = 0;
    private nextQueueAnimation: number = 0;

    // Persistent UI graphics
    private uiGraphics: Graphics;
    private damageGraphics: Graphics;
    private garbageTrayGraphics: Graphics;

    // Pooled UI text
    private statLabels: Text[] = [];
    private statValues: Text[] = [];
    private nextLabel: Text | null = null;
    private nextSprites: Sprite[] = [];
    private depthText: Text | null = null;
    private targetNameText: Text | null = null;

    // Game state
    private alive: boolean = true;
    private depth: number = 0;
    private kos: number = 0;
    private currentLevel: number = 1;

    // Input handling (DAS/ARR)
    private dasFrameLeft: number = 0;
    private dasFrameRight: number = 0;
    private lastMoveFrameLeft: number = -999;
    private lastMoveFrameRight: number = -999;
    private currentFrame: number = 0;
    /** Real time carried between rendered frames, in logical frames. */
    private engineAccumulator = 0;

    // Network listeners (for cleanup)
    private networkListeners: { event: string, cb: any }[] = [];

    constructor(seed: number) {
        this.seed = seed;
        BGMManager.play('game');

        console.log(`[QuickPlayScene] Initializing. Seed: ${seed}`);

        this.container = new Container();

        // Background
        this.staticBg = new Sprite();
        this.staticBg.anchor.set(0.5);
        this.staticBg.position.set(window.innerWidth / 2, window.innerHeight / 2);
        this.container.addChild(this.staticBg);

        const bgUrl = backgroundManager.getGameBackground();
        if (bgUrl) {
            Assets.load(bgUrl).then((texture) => {
                if (this.staticBg && !this.staticBg.destroyed) {
                    this.staticBg.texture = texture;
                    this.resizeBackground();
                }
            }).catch(() => {});
        }

        // Game content wrapper
        this.gameContentWrapper = new Container();
        this.container.addChild(this.gameContentWrapper);

        this.graphics = new Graphics();
        this.gameContentWrapper.addChild(this.graphics);

        this.targetBoard = new Board();

        this.puyoContainer = new Container();
        this.gameContentWrapper.addChild(this.puyoContainer);

        this.effectContainer = new Container();
        this.gameContentWrapper.addChild(this.effectContainer);

        this.particleGraphics = new Graphics();
        this.effectContainer.addChild(this.particleGraphics);

        this.uiContainer = new Container();
        this.gameContentWrapper.addChild(this.uiContainer);

        this.uiGraphics = new Graphics();
        this.damageGraphics = new Graphics();
        this.garbageTrayGraphics = new Graphics();
        this.uiContainer.addChild(this.uiGraphics);
        this.uiContainer.addChild(this.damageGraphics);
        this.uiContainer.addChild(this.garbageTrayGraphics);

        // Target board display (small, positioned in updateLayout)
        this.targetBoardContainer = new Container();
        this.gameContentWrapper.addChild(this.targetBoardContainer);
        this.targetBoardContainer.scale.set(0.35);

        this.targetBoardBorder = new Graphics();
        this.targetBoardBorder.rect(0, 0, COLS * CELL_SIZE, (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE);
        this.targetBoardBorder.stroke({ color: 0xff4444, width: 4, alpha: 0.8 });

        // X Marker
        const xMarkerTextures = ResourceManager.getXMarkerTextures();
        this.xMarkerSprite = new AnimatedSprite(xMarkerTextures);
        this.xMarkerSprite.animationSpeed = 0.25;
        this.xMarkerSprite.play();
        this.xMarkerSprite.width = CELL_SIZE * 0.7;
        this.xMarkerSprite.height = CELL_SIZE * 0.7;
        this.xMarkerSprite.anchor.set(0.5);
        this.xMarkerSprite.x = 2 * CELL_SIZE + CELL_SIZE / 2;
        this.xMarkerSprite.y = 0 + CELL_SIZE / 2;
        this.xMarkerSprite.alpha = 0.8;

        this.updateLayout();
        this.initUIPool();
        this.setupEngine();
        this.setupNetworkListeners();
    }

    private setupEngine() {
        this.engine = new GameEngine(this.seed);
        this.alive = true;
        this.depth = 0;
        this.particles = [];
        this.trackedTexts = [];
        this.landingAnims.clear();
        this.spawnAnim = -1;
        this.popAnimProgress = 0;

        this.engine.onPieceSpawn = () => {
            this.nextQueueAnimation = 1.0;
            this.spawnAnim = 0;
        };

        this.engine.onChainStep = (chain) => {
            if (this.engine.matchedPuyos.length > 0) {
                this.spawnChainText(chain);
            }
        };

        this.engine.onStateChange = (state) => {
            if (state === GameState.POP_ANIM) {
                SoundManager.play('pop');
                this.spawnParticles();
                this.popAnimProgress = 0;
            }

            if (state === GameState.GAMEOVER) {
                // Authoritative death — client tells server it died
                if (this.alive) {
                    this.alive = false;
                    NetworkManager.minesPlayerLost();
                    GameEvents.emit('mines_died', {
                        depth: this.depth,
                        kos: this.kos,
                        score: this.engine.stats.score,
                    });
                }
            }
        };

        this.engine.onGarbageGenerated = (amount) => {
            NetworkManager.minesSendGarbage(amount);
            if (amount > 0) {
                this.spawnFloatingText(300, 200, `ATTACK! +${amount}`, 0xff6600);
            }
        };

        this.engine.onGarbageOffset = (amount) => {
            if (amount > 0) {
                this.spawnFloatingText(300, 300, `OFFSET! -${amount}`, 0x00ff00);
            }
        };

        this.engine.onBoardChange = () => {
            // Throttled in update loop
        };

        this.engine.onActivePieceUpdate = () => {
            // No per-frame piece sync needed in mines (board state covers it)
        };

        this.engine.onScoreChange = (score) => {
            this.depth = Math.floor(score / DEPTH_DIVISOR);
            // Check for level-up
            const newLevel = getDepthLevel(this.depth);
            if (newLevel.level > this.currentLevel) {
                this.currentLevel = newLevel.level;
                this.spawnFloatingText(
                    COLS * CELL_SIZE / 2, CELL_SIZE * 4,
                    `LEVEL ${newLevel.level}: ${newLevel.name}`,
                    newLevel.color,
                );
                GameEvents.emit('mines_level_up', { level: newLevel.level, name: newLevel.name, color: newLevel.color });
            }
        };

        this.engine.onPieceLock = (cells) => {
            const board = this.engine.board;
            const visited = new Set<number>();
            const allCells: { c: number, r: number }[] = [];

            for (const cell of cells) {
                const color = board.grid[cell.c][cell.r];
                if (color === PuyoColor.None) continue;
                const queue: { c: number, r: number }[] = [cell];
                const key0 = cell.c * 100 + cell.r;
                if (visited.has(key0)) continue;
                visited.add(key0);
                while (queue.length > 0) {
                    const cur = queue.pop()!;
                    allCells.push(cur);
                    const adj = [
                        { c: cur.c, r: cur.r - 1 },
                        { c: cur.c + 1, r: cur.r },
                        { c: cur.c, r: cur.r + 1 },
                        { c: cur.c - 1, r: cur.r },
                    ];
                    for (const n of adj) {
                        const nk = n.c * 100 + n.r;
                        if (!visited.has(nk) && board.isValid(n.c, n.r) && board.grid[n.c][n.r] === color) {
                            visited.add(nk);
                            queue.push(n);
                        }
                    }
                }
            }
            if (allCells.length === 0) return;
            let gcx = 0, gcy = 0;
            for (const cell of allCells) {
                gcx += cell.c * CELL_SIZE + CELL_SIZE / 2;
                gcy += (cell.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
            }
            gcx /= allCells.length;
            gcy /= allCells.length;
            for (const cell of allCells) {
                this.landingAnims.set(cell.c * 100 + cell.r, { t: 0, gcx, gcy });
            }
        };

        this.engine.onGravityLanded = (cells) => {
            if (cells.length === 0) return;
            let gcx = 0, gcy = 0;
            for (const cell of cells) {
                gcx += cell.c * CELL_SIZE + CELL_SIZE / 2;
                gcy += (cell.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
            }
            gcx /= cells.length;
            gcy /= cells.length;
            for (const cell of cells) {
                this.landingAnims.set(cell.c * 100 + cell.r, { t: 0, gcx, gcy });
            }
        };

        this.engine.onHardDrop = () => {
            this.shakeStrength = Math.max(this.shakeStrength, 6);
        };

        this.engine.onAllClear = () => {
            const boardWidth = COLS * CELL_SIZE;
            const boardHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
            this.spawnFloatingText(boardWidth / 2, boardHeight / 2, 'ALL CLEAR!', 0xFFD700, 1.5);
            this.shakeStrength = Math.max(this.shakeStrength, 10);
        };
    }

    private setupNetworkListeners() {
        const onMinesGarbage = (data: { amount: number, fromUsername: string }) => {
            if (this.container.destroyed) return;
            if (data && typeof data.amount === 'number' && this.alive) {
                this.engine.addGarbage(data.amount);
                this.spawnFloatingText(400, 100, `${data.fromUsername} +${data.amount}`, 0xff0000);
            }
        };
        NetworkManager.on('mines_receive_garbage', onMinesGarbage);
        this.networkListeners.push({ event: 'mines_receive_garbage', cb: onMinesGarbage });

        const onTargetBoard = (data: { grid: number[][], socketId: string }) => {
            if (data?.grid) {
                this.targetBoard = new Board();
                for (let c = 0; c < COLS; c++) {
                    for (let r = 0; r < TOTAL_ROWS; r++) {
                        if (data.grid[c] && data.grid[c][r] !== undefined) {
                            this.targetBoard.grid[c][r] = data.grid[c][r] as PuyoColor;
                        }
                    }
                }
            }
        };
        NetworkManager.on('mines_target_board', onTargetBoard);
        this.networkListeners.push({ event: 'mines_target_board', cb: onTargetBoard });


        const onRespawned = (data: { seed: number }) => {
            if (this.container.destroyed) return;
            this.seed = data.seed;
            this.setupEngine();
            this.alive = true;
            this.currentLevel = 1;
            this.targetBoard = new Board();
        };
        NetworkManager.on('mines_respawned', onRespawned);
        this.networkListeners.push({ event: 'mines_respawned', cb: onRespawned });

        const onKO = (data: { targetUsername: string, totalKOs: number }) => {
            if (this.container.destroyed) return;
            this.kos = data.totalKOs;
            this.spawnFloatingText(300, 150, `KO! ${data.targetUsername}`, 0xFFD700, 1.2);
        };
        NetworkManager.on('mines_ko', onKO);
        this.networkListeners.push({ event: 'mines_ko', cb: onKO });

        // Server-authoritative death — forces GAMEOVER regardless of local engine state
        const onServerDeath = (data: { depth: number, score: number, kos: number }) => {
            if (this.container.destroyed) return;
            if (this.alive) {
                this.alive = false;
                // Force local engine to GAMEOVER if it hasn't caught up
                if (this.engine.state !== GameState.GAMEOVER) {
                    (this.engine as any).state = GameState.GAMEOVER;
                }
                this.depth = data.depth;
                this.kos = data.kos;
                GameEvents.emit('mines_died', {
                    depth: data.depth,
                    kos: data.kos,
                    score: data.score,
                });
            }
        };
        NetworkManager.on('mines_server_death', onServerDeath);
        this.networkListeners.push({ event: 'mines_server_death', cb: onServerDeath });

        // Server state sync — reconcile score/depth drift, enforce death
        const onStateSync = (data: { score: number, depth: number, alive: boolean, garbageQueue: number, nuisanceTray: number }) => {
            if (this.container.destroyed) return;
            // If server says dead but client thinks alive — force death
            if (!data.alive && this.alive) {
                console.warn('[QuickPlayScene] Server says dead but client alive — forcing death');
                this.alive = false;
                if (this.engine.state !== GameState.GAMEOVER) {
                    (this.engine as any).state = GameState.GAMEOVER;
                }
                GameEvents.emit('mines_died', {
                    depth: data.depth,
                    kos: this.kos,
                    score: data.score,
                });
            }
            // Always trust server depth/score
            this.depth = data.depth;
        };
        NetworkManager.on('mines_state_sync', onStateSync);
        this.networkListeners.push({ event: 'mines_state_sync', cb: onStateSync });
    }

    update(delta: number): void {
        if (this.container.destroyed) return;

        try {
            this.currentFrame++;
            // NetworkManager.minesTickFrame(); // Disabled: Server no longer depends on tick frames

            // Escape to leave
            if (Input.isPressed('Escape')) {
                this.leave();
                return;
            }

            if (this.engine.state === GameState.GAMEOVER) {
                // Dead — wait for respawn (handled by React overlay)
                // Render effects still
                this.updateEffects(delta);
                this.render();
                return;
            }

            // Update engine
            const prevState = this.engine.state;
            // The engine is fixed-step, so accumulate real time here. This is a
            // mechanical wrapper that preserves the previous wall-clock rate --
            // it does not address this mode's client/server divergence.
            this.engineAccumulator += delta;
            let steps = 0;
            while (this.engineAccumulator >= 1 && steps < 5) {
                this.engineAccumulator -= 1;
                this.engine.update();
                steps++;
            }
            if (this.engineAccumulator > 5) this.engineAccumulator = 0;

            if (prevState !== this.engine.state) {
                if (this.engine.state === GameState.GARBAGE_FALL) {
                    const amount = Math.min(this.engine.garbageQueue, 30);
                    this.shakeStrength = Math.log(amount + 1) * 6;
                    SoundManager.play('drop');
                }
            }

            // Handle input
            const state = this.engine.state;
            if (state === GameState.ACTIVE || state === GameState.FALLING ||
                state === GameState.CHECK_MATCH || state === GameState.SPAWN) {
                this.handleInput();

                // DAS buffering on spawn
                if (prevState !== GameState.ACTIVE && state === GameState.ACTIVE && this.engine.activePiece) {
                    const leftHeld = Input.isActionDown('moveLeft');
                    const rightHeld = Input.isActionDown('moveRight');

                    if (leftHeld && !rightHeld && this.currentFrame >= this.dasFrameLeft && this.dasFrameLeft > 0) {
                        if (SettingsManager.arr === 0) {
                            while (this.engine.movePiece(-1)) {}
                        } else {
                            this.engine.movePiece(-1);
                        }
                        this.lastMoveFrameLeft = this.currentFrame;
                    } else if (rightHeld && !leftHeld && this.currentFrame >= this.dasFrameRight && this.dasFrameRight > 0) {
                        if (SettingsManager.arr === 0) {
                            while (this.engine.movePiece(1)) {}
                        } else {
                            this.engine.movePiece(1);
                        }
                        this.lastMoveFrameRight = this.currentFrame;
                    }
                }
            }

            // Update depth from local engine (server reconciles periodically)
            this.depth = Math.floor(this.engine.stats.score / DEPTH_DIVISOR);

            this.updateEffects(delta);
            this.render();
        } catch (e) {
            console.error('[QuickPlayScene] Update error:', e);
        }
    }

    private recordInputForServer(inputType: string): void {
        // Forward inputs to server simulator for anti-cheat validation
        NetworkManager.emitToServer('mines_record_input', { input: inputType });
    }

    private handleInput() {
        if (!this.engine.activePiece) return;
        const cf = this.currentFrame;
        const das = SettingsManager.das;
        const arr = SettingsManager.arr;

        // Left
        if (Input.isActionPressed('moveLeft')) {
            this.engine.movePiece(-1);
            this.dasFrameLeft = cf + das;
            this.lastMoveFrameLeft = cf;
            this.recordInputForServer('L');
        } else if (Input.isActionDown('moveLeft')) {
            if (cf >= this.dasFrameLeft) {
                if (arr === 0) {
                    while (this.engine.movePiece(-1)) {
                        this.recordInputForServer('L');
                    }
                } else if (cf - this.lastMoveFrameLeft >= arr) {
                    this.engine.movePiece(-1);
                    this.lastMoveFrameLeft = cf;
                    this.recordInputForServer('L');
                }
            }
        } else {
            this.dasFrameLeft = 0;
        }

        // Right
        if (Input.isActionPressed('moveRight')) {
            this.engine.movePiece(1);
            this.dasFrameRight = cf + das;
            this.lastMoveFrameRight = cf;
            this.recordInputForServer('R');
        } else if (Input.isActionDown('moveRight')) {
            if (cf >= this.dasFrameRight) {
                if (arr === 0) {
                    while (this.engine.movePiece(1)) {
                        this.recordInputForServer('R');
                    }
                } else if (cf - this.lastMoveFrameRight >= arr) {
                    this.engine.movePiece(1);
                    this.lastMoveFrameRight = cf;
                    this.recordInputForServer('R');
                }
            }
        } else {
            this.dasFrameRight = 0;
        }

        // Rotations
        if (Input.isActionPressed('rotateCW')) {
            if (this.engine.rotate(1)) this.recordInputForServer('CW');
        }
        if (Input.isActionPressed('rotateCCW')) {
            if (this.engine.rotate(-1)) this.recordInputForServer('CC');
        }

        // Soft drop
        const softDropNow = Input.isActionDown('softDrop');
        if (softDropNow !== this.engine.softDrop) {
            this.engine.softDrop = softDropNow;
            this.recordInputForServer(softDropNow ? 'SD' : 'SU');
        }

        // Hard drop
        if (Input.isActionPressed('hardDrop')) {
            if (this.engine.hardDrop()) this.recordInputForServer('HD');
        }
    }

    private updateEffects(delta: number) {
        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.vy += 0.15 * delta; // gravity
            p.life -= delta;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Tracked texts
        for (let i = this.trackedTexts.length - 1; i >= 0; i--) {
            const tt = this.trackedTexts[i];
            tt.elapsed += delta / 60;
            tt.pixiText.y -= tt.vy * (delta / 60);
            tt.pixiText.alpha = Math.max(0, 1 - tt.elapsed / tt.duration);
            if (tt.elapsed >= tt.duration) {
                tt.pixiText.destroy();
                this.trackedTexts.splice(i, 1);
            }
        }

        // Landing animations
        for (const [key, anim] of this.landingAnims) {
            anim.t += 0.08 * delta;
            if (anim.t >= 1) {
                this.landingAnims.delete(key);
            }
        }

        // Shake decay
        if (this.shakeStrength > 0) {
            this.shakeStrength *= 0.85;
            if (this.shakeStrength < 0.5) this.shakeStrength = 0;
        }

        // Next queue animation
        if (this.nextQueueAnimation > 0) {
            this.nextQueueAnimation -= 0.05 * delta;
            if (this.nextQueueAnimation < 0) this.nextQueueAnimation = 0;
        }

        // Spawn animation
        if (this.spawnAnim >= 0 && this.spawnAnim < 1) {
            this.spawnAnim += 0.1 * delta;
            if (this.spawnAnim > 1) this.spawnAnim = 1;
        }

        // Pop animation
        if (this.engine.state === GameState.POP_ANIM) {
            this.popAnimProgress += delta / this.engine.POP_ANIM_DURATION;
            if (this.popAnimProgress > 1) this.popAnimProgress = 1;
        }
    }

    private render() {
        // Apply screen shake
        if (this.shakeStrength > 0 && SettingsManager.screenShake) {
            const shakeX = (Math.random() - 0.5) * this.shakeStrength * 2;
            const shakeY = (Math.random() - 0.5) * this.shakeStrength * 2;
            this.gameContentWrapper.pivot.set(-shakeX, -shakeY);
        } else {
            this.gameContentWrapper.pivot.set(0, 0);
        }

        // Clear previous frame
        this.graphics.clear();

        // Draw board background
        const boardH = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
        const boardW = COLS * CELL_SIZE;
        this.graphics.rect(0, 0, boardW, boardH);
        this.graphics.fill({ color: 0x000000, alpha: 0.75 });
        this.graphics.stroke({ color: 0x334466, width: 2, alpha: 0.4 });

        // No grid lines needed

        // Render puyos
        this.renderPuyos();

        // Render UI
        this.renderUI();

        // Render particles
        this.renderParticles();
    }

    private renderPuyos() {
        // Clear puyo container children (keep xMarkerSprite)
        const children = this.puyoContainer.removeChildren();
        for (const child of children) {
            if (child !== this.xMarkerSprite) child.destroy();
        }
        this.puyoContainer.addChild(this.xMarkerSprite);

        // Build lookup for gravity interpolation during FALLING state
        const fallingLookup = new Map<number, number>();
        let fallingProgress = 0;
        if (this.engine.state === GameState.FALLING && this.engine.fallingDestinations.length > 0) {
            const scaledDelay = this.engine.getChainScaledDuration(this.engine.FALL_STEP_DELAY);
            fallingProgress = Math.min(1, this.engine.stateTimer / scaledDelay);
            fallingProgress = fallingProgress * fallingProgress; // ease-in
            for (const f of this.engine.fallingDestinations) {
                fallingLookup.set(f.c * 100 + f.r, f.destR);
            }
        }

        // Build lookup for pop animation
        const poppingSet = new Set<number>();
        if (this.engine.state === GameState.POP_ANIM && this.engine.matchedPuyos.length > 0) {
            for (const group of this.engine.matchedPuyos) {
                for (const p of group) {
                    poppingSet.add(p.c * 100 + p.r);
                }
            }
        }

        // Board puyos with connections
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                const color = this.engine.board.grid[c][r];
                if (color === PuyoColor.None) continue;

                // Calculate connection bitmask
                let connections = 0;
                if (this.checkColor(c, r - 1, color)) connections |= 1; // Top
                if (this.checkColor(c + 1, r, color)) connections |= 2; // Right
                if (this.checkColor(c, r + 1, color)) connections |= 4; // Bottom
                if (this.checkColor(c - 1, r, color)) connections |= 8; // Left

                const key = c * 100 + r;

                // Pop animation
                if (poppingSet.has(key)) {
                    const popT = this.popAnimProgress;
                    const flash = Math.sin(popT * Math.PI * 6) * 0.3 + 0.7;
                    const shrink = popT < 0.6 ? 1.0 : 1.0 - ((popT - 0.6) / 0.4);
                    this.drawPuyo(c, r, color, connections, flash, shrink);
                    continue;
                }

                // Gravity interpolation
                const destR = fallingLookup.get(key);
                if (destR !== undefined) {
                    const visualR = r + (destR - r) * fallingProgress;
                    const fallDist = destR - r;
                    let fallingConns = 0;
                    const nTop = fallingLookup.get(c * 100 + (r - 1));
                    const nRight = fallingLookup.get((c + 1) * 100 + r);
                    const nBot = fallingLookup.get(c * 100 + (r + 1));
                    const nLeft = fallingLookup.get((c - 1) * 100 + r);
                    if (nTop !== undefined && (nTop - (r - 1)) === fallDist && this.checkColor(c, r - 1, color)) fallingConns |= 1;
                    if (nRight !== undefined && (nRight - r) === fallDist && this.checkColor(c + 1, r, color)) fallingConns |= 2;
                    if (nBot !== undefined && (nBot - (r + 1)) === fallDist && this.checkColor(c, r + 1, color)) fallingConns |= 4;
                    if (nLeft !== undefined && (nLeft - r) === fallDist && this.checkColor(c - 1, r, color)) fallingConns |= 8;
                    this.drawPuyo(c, visualR, color, fallingConns);
                    continue;
                }

                this.drawPuyo(c, r, color, connections);
            }
        }

        // Active piece with connections
        if (this.engine.activePiece && this.engine.state === GameState.ACTIVE) {
            const ap = this.engine.activePiece;
            const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
            const sx = offsets[ap.rot].x;
            const sy = offsets[ap.rot].y;

            let mainConn = 0;
            let subConn = 0;
            if (ap.mainColor === ap.subColor) {
                const mainMasks = [1, 2, 4, 8];
                const subMasks = [4, 8, 1, 2];
                mainConn = mainMasks[ap.rot];
                subConn = subMasks[ap.rot];
            }

            const spawnScale = this.spawnAnim >= 0 ? 0.5 + this.spawnAnim * 0.5 : 1.0;
            const spawnAlpha = this.spawnAnim >= 0 ? this.spawnAnim : 1.0;

            this.drawPuyo(ap.x, ap.y, ap.mainColor, mainConn, spawnAlpha, spawnScale);
            this.drawPuyo(ap.x + sx, ap.y + sy, ap.subColor, subConn, spawnAlpha, spawnScale);

            // Ghost piece
            this.drawGhostPiece();
        }

        // Falling garbage animation
        for (const fg of this.engine.fallingGarbage) {
            if (fg.delay <= 10) {
                this.drawPuyo(fg.c, fg.r, PuyoColor.Garbage, 0);
            }
        }
    }

    private checkColor(c: number, r: number, color: PuyoColor): boolean {
        if (!this.engine.board.isValid(c, r)) return false;
        return this.engine.board.grid[c][r] === color;
    }

    private drawPuyo(c: number, r: number, color: PuyoColor, connections: number, alpha: number = 1.0, scale: number = 1.0) {
        const drawY = (r - HIDDEN_ROWS) * CELL_SIZE;
        const drawX = c * CELL_SIZE;

        const texture = ResourceManager.getPuyoTexture(color, connections);
        const sprite = new Sprite(texture);

        const overlap = connections > 0 ? 4 : 0;
        const baseW = (CELL_SIZE + overlap) * scale;
        const baseH = (CELL_SIZE + overlap) * scale;

        sprite.anchor.set(0.5);
        sprite.x = drawX + CELL_SIZE / 2;
        sprite.y = drawY + CELL_SIZE / 2;
        sprite.alpha = alpha;

        // Landing jiggle
        const animKey = Math.round(c) * 100 + Math.round(r);
        const anim = this.landingAnims.get(animKey);
        if (anim !== undefined) {
            const amp = (1 - anim.t) * 0.18;
            const wave = Math.sin(anim.t * Math.PI * 3);
            const scaleX = 1 + amp * wave;
            const scaleY = 1 - amp * wave;
            sprite.width = baseW * scaleX;
            sprite.height = baseH * scaleY;
            sprite.x = anim.gcx + (sprite.x - anim.gcx) * scaleX;
            sprite.y = anim.gcy + (sprite.y - anim.gcy) * scaleY + (baseH * (1 - scaleY)) * 0.25;
        } else {
            sprite.width = baseW;
            sprite.height = baseH;
        }

        this.puyoContainer.addChild(sprite);
    }

    private drawGhostPiece() {
        if (!this.engine.activePiece) return;
        const ap = this.engine.activePiece;
        const board = this.engine.board;

        let gY = ap.y;

        const canPlace = (x: number, y: number, r: number) => {
            if (y >= TOTAL_ROWS || x < 0 || x >= COLS) return false;
            if (y >= 0 && board.grid[x][y] !== PuyoColor.None) return false;
            const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
            const sx = x + offsets[r].x;
            const sy = y + offsets[r].y;
            if (sy >= TOTAL_ROWS || sx < 0 || sx >= COLS) return false;
            if (sy >= 0 && board.grid[sx][sy] !== PuyoColor.None) return false;
            return true;
        };

        while (canPlace(ap.x, gY + 1, ap.rot)) {
            gY++;
        }

        // Don't draw ghost if it overlaps the active piece
        if (gY === ap.y) return;

        const { x, rot, mainColor, subColor } = ap;

        let mainConn = 0;
        let subConn = 0;
        if (mainColor === subColor) {
            const mainMasks = [1, 2, 4, 8];
            const subMasks = [4, 8, 1, 2];
            mainConn = mainMasks[rot];
            subConn = subMasks[rot];
        }

        const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
        const sx = offsets[rot].x;
        const sy = offsets[rot].y;

        this.drawPuyo(x, gY, mainColor, mainConn, 0.3);
        this.drawPuyo(x + sx, gY + sy, subColor, subConn, 0.3);
    }

    private renderUI() {
        this.uiGraphics.clear();
        this.damageGraphics.clear();
        this.garbageTrayGraphics.clear();

        const boardW = COLS * CELL_SIZE;
        const rightX = boardW + 80;

        // --- DRAW STATS (GameScene Style) ---
        let cY = 70;

        const labelStyle = {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 14,
            fontWeight: 'bold' as const,
            fill: 0xaaaaaa,
            letterSpacing: 2,
            dropShadow: { color: 0x000000, blur: 2, distance: 1, angle: Math.PI / 4, alpha: 0.6 }
        };
        const valueStyle = {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: 32,
            fontWeight: 'bold' as const,
            fill: 0xffffff,
            dropShadow: { color: 0x000000, blur: 3, distance: 1, angle: Math.PI / 4, alpha: 0.8 }
        };

        const stats = [
            { label: 'DEPTH', value: `${this.depth}m`, color: 0x00ddff },
            { label: 'KOs', value: `${this.kos}`, color: 0xffffff },
            { label: 'CHAIN', value: `${this.engine.stats.maxChain}`, color: 0xffffff },
            { label: 'SCORE', value: `${this.engine.stats.score}`, color: 0xffffff },
        ];

        for (let i = 0; i < stats.length; i++) {
            if (!this.statLabels[i]) {
                this.statLabels[i] = new Text({ text: stats[i].label, resolution: 2, style: labelStyle });
                this.statLabels[i].anchor.set(0.5);
                this.uiContainer.addChild(this.statLabels[i]);
            }
            if (!this.statValues[i]) {
                this.statValues[i] = new Text({ text: stats[i].value, resolution: 2, style: valueStyle });
                this.statValues[i].anchor.set(0.5);
                this.uiContainer.addChild(this.statValues[i]);
            }

            const lbl = this.statLabels[i];
            const val = this.statValues[i];

            lbl.text = stats[i].label;
            lbl.style.fill = 0xaaaaaa;
            lbl.x = rightX;
            lbl.y = cY;
            lbl.visible = true;

            const cardW = 140;
            const cardH = 50;
            this.uiGraphics.rect(rightX - cardW / 2, cY + 20, cardW, cardH);
            this.uiGraphics.fill({ color: 0x0a0a12, alpha: 0.7 });
            this.uiGraphics.stroke({ color: 0xffffff, width: 1, alpha: 0.15 });

            val.text = stats[i].value;
            val.style.fill = stats[i].color;
            val.x = rightX;
            val.y = cY + 45;
            val.visible = true;

            cY += 110;
        }

        // --- DRAW NEXT QUEUE (GameScene Style) ---
        const queueY = cY + 20;

        if (!this.nextLabel) {
            this.nextLabel = new Text({
                text: 'NEXT',
                resolution: 2,
                style: { fontFamily: 'Arial', fontSize: 16, fontWeight: '900' as const, fill: 0xFF5733, letterSpacing: 2 }
            });
            this.nextLabel.anchor.set(0.5);
            this.uiContainer.addChild(this.nextLabel);
        }
        
        this.nextLabel.x = rightX;
        this.nextLabel.y = queueY - 40;
        this.nextLabel.visible = true;

        // Primary Slot Frame
        const boxW = 100;
        const boxH = 80;
        const pX = rightX - (boxW / 2);
        const pY = queueY;
        this.uiGraphics.rect(pX, pY, boxW, boxH);
        this.uiGraphics.fill({ color: 0x000000, alpha: 0.3 });
        this.uiGraphics.stroke({ color: 0xFF5733, width: 2 });

        for (const s of this.nextSprites) {
            if (!s.destroyed) s.destroy();
        }
        this.nextSprites = [];

        const limit = Math.min(this.engine.nextPieces.length, 2);
        const ICON_BASE = 32;

        for (let i = 0; i < limit; i++) {
            const p = this.engine.nextPieces[i];
            let tx: number, ty: number, spacing: number, displaySize: number;

            if (i === 0) {
                tx = rightX; ty = queueY + 40;
                displaySize = ICON_BASE * 1.35; spacing = 45;
            } else {
                tx = rightX + 100; ty = queueY + 40;
                displaySize = ICON_BASE * 0.9; spacing = 30;
            }

            const subTex = ResourceManager.getPuyoTexture(p.sub, 0);
            const mainTex = ResourceManager.getPuyoTexture(p.main, 0);

            if (subTex) {
                const subSprite = new Sprite(subTex);
                subSprite.anchor.set(0.5);
                subSprite.x = tx - (spacing / 2);
                subSprite.y = ty;
                subSprite.width = displaySize;
                subSprite.height = displaySize;
                this.uiContainer.addChild(subSprite);
                this.nextSprites.push(subSprite);
            }

            if (mainTex) {
                const mainSprite = new Sprite(mainTex);
                mainSprite.anchor.set(0.5);
                mainSprite.x = tx + (spacing / 2);
                mainSprite.y = ty;
                mainSprite.width = displaySize;
                mainSprite.height = displaySize;
                this.uiContainer.addChild(mainSprite);
                this.nextSprites.push(mainSprite);
            }
        }

        // --- DRAW BOARD BORDER ---
        // uiContainer is already positioned at the board origin (contentX, topMargin)
        // so we draw at (0,0) relative to it — NOT at this.graphics.x/y which would double-offset
        const visibleHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
        this.uiGraphics.rect(0, 0, boardW, visibleHeight);
        this.uiGraphics.stroke({ color: 0xffffff, width: 4, alpha: 1.0, alignment: 1 });

        // --- GARBAGE TRAY (Left side of board) ---
        const totalGarbage = this.engine.garbageQueue + this.engine.nuisanceTray;
        if (totalGarbage > 0) {
            const maxHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
            const fillRatio = Math.min(1, totalGarbage / 30);
            const barHeight = fillRatio * maxHeight;

            const fillH = barHeight;
            const barW = 16;
            const bX = -25; // Left of board origin (uiContainer is already at board position)

            this.garbageTrayGraphics.rect(bX, 0, barW, maxHeight);
            this.garbageTrayGraphics.fill({ color: 0x220000, alpha: 0.6 });
            this.garbageTrayGraphics.stroke({ color: 0x550000, width: 2 });

            this.garbageTrayGraphics.rect(bX, maxHeight - fillH, barW, fillH);
            this.garbageTrayGraphics.fill({ color: totalGarbage > 12 ? 0xff0000 : 0xff4400, alpha: 0.9 });
            
            if (totalGarbage > 12) {
                this.garbageTrayGraphics.stroke({ color: 0xffff00, width: 2 });
            }
        }
    }

    private renderParticles() {
        this.particleGraphics.clear();
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            const size = 3 + alpha * 3;
            this.particleGraphics.circle(p.x, p.y, size);
            this.particleGraphics.fill({ color: p.color, alpha });
        }
    }



    // ── Effects ──

    private spawnParticles() {
        for (const group of this.engine.matchedPuyos) {
            for (const cell of group) {
                const color = this.engine.board.grid[cell.c]?.[cell.r];
                const hexColor = this.puyoColorToHex(color);
                for (let i = 0; i < 6; i++) {
                    this.particles.push({
                        x: cell.c * CELL_SIZE + CELL_SIZE / 2,
                        y: (cell.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2,
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4 - 2,
                        color: hexColor,
                        life: 30 + Math.random() * 20,
                        maxLife: 50,
                    });
                }
            }
        }
    }

    private spawnChainText(chain: number) {
        const boardW = COLS * CELL_SIZE;
        const boardH = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
        const colors = [0xffffff, 0x00ff88, 0x00bbff, 0xff6600, 0xff00ff, 0xffdd00];
        const color = colors[Math.min(chain - 1, colors.length - 1)];
        this.spawnFloatingText(boardW / 2, boardH / 2 - 50, `${chain} CHAIN!`, color, 0.8 + chain * 0.1);
    }

    private spawnFloatingText(x: number, y: number, text: string, color: number, scale: number = 1) {
        const t = new Text({
            text,
            style: new TextStyle({
                fontFamily: 'monospace',
                fontSize: Math.round(24 * scale),
                fontWeight: 'bold',
                fill: color,
                stroke: { color: 0x000000, width: 4 },
            }),
        });
        t.anchor.set(0.5);
        t.position.set(x, y);
        this.effectContainer.addChild(t);
        this.trackedTexts.push({
            pixiText: t,
            elapsed: 0,
            duration: 1.5,
            vy: 40,
        });
    }

    private puyoColorToHex(color: PuyoColor): number {
        switch (color) {
            case PuyoColor.Red: return 0xff3333;
            case PuyoColor.Green: return 0x33ff33;
            case PuyoColor.Blue: return 0x3333ff;
            case PuyoColor.Yellow: return 0xffff33;
            case PuyoColor.Purple: return 0xcc33ff;
            case PuyoColor.Garbage: return 0x888888;
            default: return 0xffffff;
        }
    }

    // ── Layout ──

    private initUIPool() {
        // Pools are created lazily in renderUI
    }

    updateLayout() {
        const screenW = SceneManager.screenWidth;
        const screenH = SceneManager.screenHeight;
        const baseW = SceneManager.BASE_WIDTH;
        const baseH = SceneManager.BASE_HEIGHT;
        const scale = Math.min(screenW / baseW, screenH / baseH);
        const offsetX = Math.round((screenW - baseW * scale) / 2);
        const offsetY = Math.round((screenH - baseH * scale) / 2);

        this.gameContentWrapper.position.set(offsetX, offsetY);
        this.gameContentWrapper.scale.set(scale);

        const topMargin = 80;
        const contentX = (baseW - COLS * CELL_SIZE) / 2;

        this.graphics.position.set(contentX, topMargin);
        this.puyoContainer.position.set(contentX, topMargin);
        this.effectContainer.position.set(contentX, topMargin);
        this.uiContainer.position.set(contentX, topMargin);

        // Position target board to the right of the stats panel, below next queue
        const boardRightEdge = contentX + COLS * CELL_SIZE;
        this.targetBoardContainer.position.set(boardRightEdge + 60, topMargin + 480);
    }

    private resizeBackground() {
        if (!this.staticBg?.texture) return;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const texW = this.staticBg.texture.width;
        const texH = this.staticBg.texture.height;
        if (texW === 0 || texH === 0) return;
        const scale = Math.max(screenW / texW, screenH / texH);
        this.staticBg.scale.set(scale);
        this.staticBg.position.set(screenW / 2, screenH / 2);
        this.staticBg.alpha = 0.4; // Dim background for gameplay visibility
    }

    onResize(_width: number, _height: number): void {
        this.resizeBackground();
        this.updateLayout();
    }

    // ── Lifecycle ──

    leave() {
        NetworkManager.leaveMines();
        GameEvents.emit('mines_left');
    }

    destroy(): void {
        // Clean up network listeners
        for (const { event, cb } of this.networkListeners) {
            NetworkManager.off(event, cb);
        }
        this.networkListeners = [];

        // Clean up text objects
        for (const tt of this.trackedTexts) {
            tt.pixiText.destroy();
        }
        this.trackedTexts = [];

        // Clean up sprites
        for (const s of this.nextSprites) {
            if (!s.destroyed) s.destroy();
        }

        if (this.depthText && !this.depthText.destroyed) this.depthText.destroy();
        if (this.targetNameText && !this.targetNameText.destroyed) this.targetNameText.destroy();
        for (const t of this.statLabels) { if (!t.destroyed) t.destroy(); }
        for (const t of this.statValues) { if (!t.destroyed) t.destroy(); }
        if (this.nextLabel && !this.nextLabel.destroyed) this.nextLabel.destroy();

        this.container.destroy({ children: true });
    }
}
