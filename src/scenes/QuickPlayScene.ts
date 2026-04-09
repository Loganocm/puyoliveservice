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

import { Container, Graphics, Sprite, AnimatedSprite, Text, TextStyle, Texture } from 'pixi.js';
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
    private targetUsername: string = '';
    private currentLevel: number = 1;

    // Input handling (DAS/ARR)
    private dasFrameLeft: number = 0;
    private dasFrameRight: number = 0;
    private lastMoveFrameLeft: number = -999;
    private lastMoveFrameRight: number = -999;
    private currentFrame: number = 0;

    // Score throttle (don't flood server)
    private lastScoreSent: number = 0;
    private scoreThrottleFrames: number = 30; // Every 0.5s

    // Board state throttle
    private boardSendTimer: number = 0;
    private boardSendInterval: number = 6; // Every ~100ms

    // Network listeners (for cleanup)
    private networkListeners: { event: string, cb: any }[] = [];

    constructor(seed: number) {
        this.seed = seed;

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

        // Target board display (smaller, on the left)
        this.targetBoardContainer = new Container();
        this.gameContentWrapper.addChild(this.targetBoardContainer);
        this.targetBoardContainer.position.set(40, 520);
        this.targetBoardContainer.scale.set(0.45);

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
                if (this.alive) {
                    this.alive = false;
                    NetworkManager.minesPlayerDied();
                    GameEvents.emit('mines_died', {
                        depth: this.depth,
                        kos: this.kos,
                        score: this.engine.stats.score,
                    });
                }
            }
        };

        this.engine.onGarbageGenerated = (amount) => {
            if (amount > 0) {
                this.spawnFloatingText(300, 200, `ATTACK! +${amount}`, 0xff6600);
                NetworkManager.minesSendGarbage(amount, this.engine.stats.chainCount);
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

        const onTargetUpdated = (data: { mode: string, targetSocketId: string, targetUsername: string }) => {
            this.targetUsername = data.targetUsername || '';
        };
        NetworkManager.on('mines_target_updated', onTargetUpdated);
        this.networkListeners.push({ event: 'mines_target_updated', cb: onTargetUpdated });

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
    }

    update(delta: number): void {
        if (this.container.destroyed) return;

        try {
            this.currentFrame++;

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
            this.engine.update(delta);

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

            // Throttled network updates
            this.boardSendTimer++;
            if (this.boardSendTimer >= this.boardSendInterval) {
                this.boardSendTimer = 0;
                NetworkManager.minesBoardState(this.engine.board.getSerializedData());
            }

            if (this.currentFrame - this.lastScoreSent >= this.scoreThrottleFrames) {
                this.lastScoreSent = this.currentFrame;
                NetworkManager.minesScoreUpdate(this.engine.stats.score);
            }

            // Update depth
            this.depth = Math.floor(this.engine.stats.score / DEPTH_DIVISOR);

            this.updateEffects(delta);
            this.render();
        } catch (e) {
            console.error('[QuickPlayScene] Update error:', e);
        }
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
        } else if (Input.isActionDown('moveLeft')) {
            if (cf >= this.dasFrameLeft) {
                if (arr === 0) {
                    while (this.engine.movePiece(-1)) {}
                } else if (cf - this.lastMoveFrameLeft >= arr) {
                    this.engine.movePiece(-1);
                    this.lastMoveFrameLeft = cf;
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
        } else if (Input.isActionDown('moveRight')) {
            if (cf >= this.dasFrameRight) {
                if (arr === 0) {
                    while (this.engine.movePiece(1)) {}
                } else if (cf - this.lastMoveFrameRight >= arr) {
                    this.engine.movePiece(1);
                    this.lastMoveFrameRight = cf;
                }
            }
        } else {
            this.dasFrameRight = 0;
        }

        // Rotations
        if (Input.isActionPressed('rotateCW')) {
            this.engine.rotate(1);
        }
        if (Input.isActionPressed('rotateCCW')) {
            this.engine.rotate(-1);
        }

        // Soft drop
        this.engine.softDrop = Input.isActionDown('softDrop');

        // Hard drop
        if (Input.isActionPressed('hardDrop')) {
            this.engine.hardDrop();
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
        this.graphics.fill({ color: 0x111122, alpha: 0.85 });
        this.graphics.stroke({ color: 0x334466, width: 2, alpha: 0.4 });

        // Grid lines
        for (let c = 1; c < COLS; c++) {
            this.graphics.moveTo(c * CELL_SIZE, 0);
            this.graphics.lineTo(c * CELL_SIZE, boardH);
        }
        for (let r = 1; r < TOTAL_ROWS - HIDDEN_ROWS; r++) {
            this.graphics.moveTo(0, r * CELL_SIZE);
            this.graphics.lineTo(boardW, r * CELL_SIZE);
        }
        this.graphics.stroke({ color: 0x222244, width: 1, alpha: 0.3 });

        // Render puyos
        this.renderPuyos();

        // Render UI
        this.renderUI();

        // Render particles
        this.renderParticles();

        // Render target board
        this.renderTargetBoard();
    }

    private renderPuyos() {
        // Clear puyo container children
        while (this.puyoContainer.children.length > 1) {
            this.puyoContainer.children[this.puyoContainer.children.length - 1].destroy();
        }
        // Keep xMarkerSprite
        if (!this.puyoContainer.children.includes(this.xMarkerSprite)) {
            this.puyoContainer.addChild(this.xMarkerSprite);
        }

        // Board puyos
        for (let c = 0; c < COLS; c++) {
            for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
                const color = this.engine.board.grid[c][r];
                if (color === PuyoColor.None) continue;

                const texture = this.getPuyoTexture(color);
                if (!texture) continue;

                const sprite = new Sprite(texture);
                const visR = r - HIDDEN_ROWS;
                sprite.x = c * CELL_SIZE;
                sprite.y = visR * CELL_SIZE;
                sprite.width = CELL_SIZE;
                sprite.height = CELL_SIZE;

                // Landing jiggle
                const key = c * 100 + r;
                const anim = this.landingAnims.get(key);
                if (anim) {
                    const t = anim.t;
                    const bounce = Math.sin(t * Math.PI * 3) * (1 - t) * 3;
                    sprite.y += bounce;
                    const squash = 1 + Math.sin(t * Math.PI * 2) * (1 - t) * 0.15;
                    sprite.scale.set(1 / squash, squash);
                    sprite.anchor.set(0.5);
                    sprite.x += CELL_SIZE / 2;
                    sprite.y += CELL_SIZE / 2;
                }

                // Pop animation
                if (this.engine.state === GameState.POP_ANIM) {
                    for (const group of this.engine.matchedPuyos) {
                        for (const cell of group) {
                            if (cell.c === c && cell.r === r) {
                                const scale = 1 - this.popAnimProgress;
                                sprite.scale.set(scale);
                                sprite.alpha = 1 - this.popAnimProgress;
                                sprite.anchor.set(0.5);
                                if (!anim) {
                                    sprite.x += CELL_SIZE / 2;
                                    sprite.y += CELL_SIZE / 2;
                                }
                            }
                        }
                    }
                }

                this.puyoContainer.addChild(sprite);
            }
        }

        // Active piece
        if (this.engine.activePiece && this.engine.state === GameState.ACTIVE) {
            const ap = this.engine.activePiece;
            const scale = this.spawnAnim >= 0 && this.spawnAnim < 1
                ? 0.5 + this.spawnAnim * 0.5
                : 1;

            this.renderPuyoAt(ap.x, ap.y - HIDDEN_ROWS, ap.mainColor, scale);

            // Sub puyo based on rotation
            const dx = [0, 1, 0, -1];
            const dy = [-1, 0, 1, 0];
            const subX = ap.x + dx[ap.rot];
            const subY = ap.y + dy[ap.rot] - HIDDEN_ROWS;
            this.renderPuyoAt(subX, subY, ap.subColor, scale);
        }

        // Falling garbage animation
        for (const fg of this.engine.fallingGarbage) {
            const texture = this.getPuyoTexture(PuyoColor.Garbage);
            if (!texture) continue;
            const sprite = new Sprite(texture);
            sprite.x = fg.c * CELL_SIZE;
            sprite.y = (fg.r - HIDDEN_ROWS) * CELL_SIZE;
            sprite.width = CELL_SIZE;
            sprite.height = CELL_SIZE;
            this.puyoContainer.addChild(sprite);
        }
    }

    private renderPuyoAt(cx: number, cy: number, color: PuyoColor, scale: number = 1) {
        const texture = this.getPuyoTexture(color);
        if (!texture) return;
        const sprite = new Sprite(texture);
        sprite.x = cx * CELL_SIZE + CELL_SIZE / 2;
        sprite.y = cy * CELL_SIZE + CELL_SIZE / 2;
        sprite.width = CELL_SIZE * scale;
        sprite.height = CELL_SIZE * scale;
        sprite.anchor.set(0.5);
        this.puyoContainer.addChild(sprite);
    }

    private getPuyoTexture(color: PuyoColor): Texture | null {
        if (color === PuyoColor.None) return null;
        return ResourceManager.getPuyoTexture(color);
    }

    private renderUI() {
        this.uiGraphics.clear();
        this.damageGraphics.clear();
        this.garbageTrayGraphics.clear();

        const boardW = COLS * CELL_SIZE;

        // Depth display (right side, top)
        const rightX = boardW + 80;
        if (!this.depthText) {
            this.depthText = new Text({
                text: '0m',
                style: new TextStyle({
                    fontFamily: 'monospace',
                    fontSize: 36,
                    fontWeight: 'bold',
                    fill: 0x00ddff,
                }),
            });
            this.depthText.anchor.set(0, 0);
            this.depthText.position.set(rightX, 10);
            this.uiContainer.addChild(this.depthText);

            // "DEPTH" label
            const label = new Text({
                text: 'DEPTH',
                style: new TextStyle({
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: 'bold',
                    fill: 0x88aacc,
                }),
            });
            label.position.set(rightX, 50);
            this.uiContainer.addChild(label);
        }
        this.depthText.text = `${this.depth}m`;

        // Target name (right side, below depth)
        if (!this.targetNameText) {
            this.targetNameText = new Text({
                text: '',
                style: new TextStyle({
                    fontFamily: 'monospace',
                    fontSize: 14,
                    fontWeight: 'bold',
                    fill: 0xff4444,
                }),
            });
            this.targetNameText.anchor.set(0, 0);
            this.targetNameText.position.set(rightX, 80);
            this.uiContainer.addChild(this.targetNameText);
        }
        this.targetNameText.text = this.targetUsername ? `⎯▶ ${this.targetUsername}` : '';

        // Stats (right side)
        const stats = [
            { label: 'KOs', value: `${this.kos}` },
            { label: 'CHAIN', value: `${this.engine.stats.maxChain}` },
            { label: 'SCORE', value: `${this.engine.stats.score}` },
        ];

        for (let i = 0; i < stats.length; i++) {
            const y = 120 + i * 50;
            if (!this.statLabels[i]) {
                this.statLabels[i] = new Text({
                    text: stats[i].label,
                    style: new TextStyle({
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: 'bold',
                        fill: 0x667788,
                    }),
                });
                this.statLabels[i].position.set(rightX, y);
                this.uiContainer.addChild(this.statLabels[i]);
            }
            if (!this.statValues[i]) {
                this.statValues[i] = new Text({
                    text: stats[i].value,
                    style: new TextStyle({
                        fontFamily: 'monospace',
                        fontSize: 22,
                        fontWeight: 'bold',
                        fill: 0xffffff,
                    }),
                });
                this.statValues[i].position.set(rightX, y + 14);
                this.uiContainer.addChild(this.statValues[i]);
            }
            this.statValues[i].text = stats[i].value;
        }

        // Next pieces (right side)
        const nextY = 300;
        if (!this.nextLabel) {
            this.nextLabel = new Text({
                text: 'NEXT',
                style: new TextStyle({
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: 'bold',
                    fill: 0x667788,
                }),
            });
            this.nextLabel.position.set(rightX, nextY);
            this.uiContainer.addChild(this.nextLabel);
        }

        // Render next pieces
        for (const s of this.nextSprites) {
            if (!s.destroyed) s.destroy();
        }
        this.nextSprites = [];

        const pieceSize = 28;
        for (let i = 0; i < Math.min(3, this.engine.nextPieces.length); i++) {
            const pair = this.engine.nextPieces[i];
            const py = nextY + 20 + i * (pieceSize * 2 + 10);

            const subTex = this.getPuyoTexture(pair.sub);
            const mainTex = this.getPuyoTexture(pair.main);

            if (subTex) {
                const s = new Sprite(subTex);
                s.x = rightX;
                s.y = py;
                s.width = pieceSize;
                s.height = pieceSize;
                this.uiContainer.addChild(s);
                this.nextSprites.push(s);
            }
            if (mainTex) {
                const s = new Sprite(mainTex);
                s.x = rightX;
                s.y = py + pieceSize;
                s.width = pieceSize;
                s.height = pieceSize;
                this.uiContainer.addChild(s);
                this.nextSprites.push(s);
            }
        }

        // Garbage tray (left side of board)
        const totalGarbage = this.engine.garbageQueue + this.engine.nuisanceTray;
        if (totalGarbage > 0) {
            const maxHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
            const fillRatio = Math.min(1, totalGarbage / 30);
            const barHeight = fillRatio * maxHeight;

            this.garbageTrayGraphics.rect(-20, maxHeight - barHeight, 12, barHeight);
            this.garbageTrayGraphics.fill({ color: totalGarbage > 12 ? 0xff0000 : 0xff6600, alpha: 0.8 });
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

    private renderTargetBoard() {
        // Clear previous
        while (this.targetBoardContainer.children.length > 0) {
            this.targetBoardContainer.children[0].destroy();
        }

        // Background
        const bg = new Graphics();
        bg.rect(0, 0, COLS * CELL_SIZE, (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE);
        bg.fill({ color: 0x111122, alpha: 0.6 });
        this.targetBoardContainer.addChild(bg);
        this.targetBoardContainer.addChild(this.targetBoardBorder);

        // Render target board puyos
        for (let c = 0; c < COLS; c++) {
            for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
                const color = this.targetBoard.grid[c][r];
                if (color === PuyoColor.None) continue;
                const texture = this.getPuyoTexture(color);
                if (!texture) continue;
                const sprite = new Sprite(texture);
                sprite.x = c * CELL_SIZE;
                sprite.y = (r - HIDDEN_ROWS) * CELL_SIZE;
                sprite.width = CELL_SIZE;
                sprite.height = CELL_SIZE;
                this.targetBoardContainer.addChild(sprite);
            }
        }

        // Target name label above
        if (this.targetUsername) {
            const nameText = new Text({
                text: `⎯▶ ${this.targetUsername}`,
                style: new TextStyle({
                    fontFamily: 'monospace',
                    fontSize: 24,
                    fontWeight: 'bold',
                    fill: 0xff4444,
                }),
            });
            nameText.position.set(0, -30);
            this.targetBoardContainer.addChild(nameText);
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
    }

    resize(): void {
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
