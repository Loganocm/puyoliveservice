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

import { Container, Text } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { Board, COLS, TOTAL_ROWS, PuyoColor } from '@puyolive/engine';
import { BOARD_LEFT, BOARD_TOP, SIDE_GAP, OPPONENT_SCALE } from '../core/RenderConstants';
import { Input } from '../core/Input';
import { SettingsManager } from '../core/SettingsManager';
import { SoundManager } from '../core/SoundManager';
import { GameEngine, GameState } from '@puyolive/engine';
import { NetworkManager } from '../core/NetworkManager';
import { GameEvents } from '../core/GameEvents';
import { BGMManager } from '../core/BGMManager';
import { HandlingController } from '../input/Handling';
import type { HandlingHooks } from '../input/Handling';
import { BoardView, engineFrame, gridFrame } from '../render/BoardView';
import type { BoardFrame } from '../render/BoardView';
import { Backdrop } from '../render/Backdrop';
import { NextQueueView } from '../render/NextQueueView';
import { StatPanel } from '../render/StatPanel';
import { FONTS, getTheme } from '../theme/tokens';

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

export class QuickPlayScene implements IScene {
    container: Container;

    // Views over game state (src/render/), laid out like a 1v1 match: stats,
    // board, queue, and the board being targeted under the queue.
    private backdrop: Backdrop;
    private gameContentWrapper: Container;
    private board: BoardView;
    private boardFrame!: BoardFrame;
    private nextQueue: NextQueueView;
    private stats: StatPanel;
    private targetView: BoardView;
    private targetFrame: BoardFrame;
    private targetLabel: Text;

    // Engine
    private engine!: GameEngine;
    private seed: number;

    // Target board (the player we're targeting)
    private targetBoard: Board;

    // Game state
    private alive: boolean = true;
    private depth: number = 0;
    private kos: number = 0;
    private currentLevel: number = 1;

    /** DAS, ARR, rotation and drops, once per logical frame. No glide: the Mines server does not simulate it. */
    private readonly handling = new HandlingController({ glide: false });
    private readonly handlingHooks: HandlingHooks = {
        record: code => this.recordInputForServer(code),
        sound: sound => SoundManager.play(sound),
    };
    /** Real time carried between rendered frames, in logical frames. */
    private engineAccumulator = 0;

    // Network listeners (for cleanup)
    private networkListeners: { event: string, cb: any }[] = [];

    constructor(seed: number) {
        this.seed = seed;
        BGMManager.play('game');

        console.log(`[QuickPlayScene] Initializing. Seed: ${seed}`);

        this.container = new Container();
        this.backdrop = new Backdrop(SceneManager.screenWidth, SceneManager.screenHeight);
        this.container.addChild(this.backdrop.container);

        this.gameContentWrapper = new Container();
        this.container.addChild(this.gameContentWrapper);

        this.targetBoard = new Board();
        this.stats = new StatPanel();
        this.board = new BoardView();
        this.nextQueue = new NextQueueView();
        this.targetView = new BoardView({ effects: 'lite', ghost: false, tray: false });
        this.targetView.container.scale.set(OPPONENT_SCALE);
        this.targetFrame = gridFrame(() => this.targetBoard.grid);
        this.targetLabel = new Text({
            text: 'TARGET',
            resolution: 2,
            style: { fontFamily: FONTS.ui, fontSize: 13, fontWeight: '700', letterSpacing: 3, fill: getTheme().text.muted },
        });
        this.targetLabel.anchor.set(0.5, 0);
        this.gameContentWrapper.addChild(
            this.stats.container, this.board.container, this.nextQueue.container,
            this.targetLabel, this.targetView.container,
        );

        this.updateLayout();
        this.setupEngine();
        this.setupNetworkListeners();
    }

    private setupEngine() {
        this.engine = new GameEngine(this.seed);
        this.boardFrame = engineFrame(this.engine);
        this.board.reset();
        this.handling.reset();
        Input.discardPlay();
        this.alive = true;
        this.depth = 0;

        this.engine.onChainStep = (chain) => {
            if (chain >= 3) this.backdrop.pulse(0.15 + chain * 0.08);
        };

        this.engine.onStateChange = (state) => {
            if (state === GameState.POP_ANIM) {
                SoundManager.play('pop');
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
                this.board.callout(`ATTACK +${amount}`, { color: getTheme().accent.primary, y: 150, size: 28 });
            }
        };

        this.engine.onGarbageOffset = (amount) => {
            if (amount > 0) {
                this.board.callout(`OFFSET −${amount}`, { color: getTheme().state.success, y: 210, size: 26 });
            }
        };

        this.engine.onScoreChange = (score) => {
            this.depth = Math.floor(score / DEPTH_DIVISOR);
            // Check for level-up
            const newLevel = getDepthLevel(this.depth);
            if (newLevel.level > this.currentLevel) {
                this.currentLevel = newLevel.level;
                this.board.callout(`LEVEL ${newLevel.level}: ${newLevel.name}`, {
                    color: `#${newLevel.color.toString(16).padStart(6, '0')}`, y: 240, size: 26, frames: 110,
                });
                GameEvents.emit('mines_level_up', { level: newLevel.level, name: newLevel.name, color: newLevel.color });
            }
        };

        this.engine.onHardDrop = () => {
            this.board.shake(5);
        };

        this.engine.onAllClear = () => {
            this.board.callout('ALL CLEAR', { color: getTheme().state.warning, size: 46, frames: 96 });
            this.board.shake(8);
            this.backdrop.pulse(0.9);
        };
    }

    private setupNetworkListeners() {
        const onMinesGarbage = (data: { amount: number, fromUsername: string }) => {
            if (this.container.destroyed) return;
            if (data && typeof data.amount === 'number' && this.alive) {
                this.engine.addGarbage(data.amount);
                this.board.callout(`${data.fromUsername} +${data.amount}`, { color: getTheme().state.danger, y: 70, size: 24 });
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
            this.targetView.reset();
        };
        NetworkManager.on('mines_respawned', onRespawned);
        this.networkListeners.push({ event: 'mines_respawned', cb: onRespawned });

        const onKO = (data: { targetUsername: string, totalKOs: number }) => {
            if (this.container.destroyed) return;
            this.kos = data.totalKOs;
            this.board.callout(`KO! ${data.targetUsername}`, { color: getTheme().state.warning, y: 150, size: 32, frames: 80 });
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
            // Escape to leave
            if (Input.isPressed('Escape')) {
                this.leave();
                return;
            }

            if (this.engine.state !== GameState.GAMEOVER) {
                // Dead players wait for a respawn (the React overlay offers
                // it); the views keep animating either way.
                const prevState = this.engine.state;
                // The engine is fixed-step, so accumulate real time here. This is a
                // mechanical wrapper that preserves the previous wall-clock rate --
                // it does not address this mode's client/server divergence.
                this.engineAccumulator += delta;
                let steps = 0;
                while (this.engineAccumulator >= 1 && steps < 5) {
                    this.engineAccumulator -= 1;
                    this.engine.update();
                    if ((this.engine.state as GameState) !== GameState.GAMEOVER) {
                        this.handling.frame(this.engine, Input.consumePlay(), SettingsManager, this.handlingHooks);
                    }
                    steps++;
                }
                if (this.engineAccumulator > 5) this.engineAccumulator = 0;

                if (prevState !== this.engine.state && this.engine.state === GameState.GARBAGE_FALL) {
                    const amount = Math.min(this.engine.garbageQueue, 30);
                    this.board.shake(Math.log(amount + 1) * 5);
                    SoundManager.play('drop');
                }

                // Update depth from local engine (server reconciles periodically)
                this.depth = Math.floor(this.engine.stats.score / DEPTH_DIVISOR);
            }

            this.renderViews(delta);
        } catch (e) {
            console.error('[QuickPlayScene] Update error:', e);
        }
    }

    private recordInputForServer(inputType: string): void {
        // Forward inputs to server simulator for anti-cheat validation
        NetworkManager.emitToServer('mines_record_input', { input: inputType });
    }

    private renderViews(dt: number): void {
        const level = getDepthLevel(this.depth);
        this.board.render(this.boardFrame, dt);
        this.nextQueue.render(this.engine.nextPieces, dt, this.board.spawnedThisFrame);
        this.stats.set([
            { label: 'DEPTH', value: `${this.depth.toLocaleString('en-US')}m`, tone: 'accent' },
            { label: level.name.toUpperCase(), value: `Level ${level.level}` },
            { label: 'KOs', value: this.kos },
            { label: 'MAX CHAIN', value: this.engine.stats.maxChain },
        ]);
        this.targetView.render(this.targetFrame, dt);
        this.backdrop.update(dt);
    }

    // ── Layout ──

    updateLayout() {
        const screenW = SceneManager.screenWidth;
        const screenH = SceneManager.screenHeight;
        const baseW = SceneManager.BASE_WIDTH;
        const baseH = SceneManager.BASE_HEIGHT;
        const scale = Math.min(screenW / baseW, screenH / baseH);
        this.gameContentWrapper.position.set(Math.round((screenW - baseW * scale) / 2), Math.round((screenH - baseH * scale) / 2));
        this.gameContentWrapper.scale.set(scale);

        const rightX = BOARD_LEFT + BoardView.WIDTH + SIDE_GAP;
        this.board.container.position.set(BOARD_LEFT, BOARD_TOP);
        this.stats.container.position.set(BOARD_LEFT - SIDE_GAP - StatPanel.WIDTH, BOARD_TOP);
        this.nextQueue.container.position.set(rightX, BOARD_TOP);
        const w = BoardView.WIDTH * OPPONENT_SCALE;
        const x = rightX + (NextQueueView.WIDTH - w) / 2;
        const y = BOARD_TOP + NextQueueView.HEIGHT + 96;
        this.targetView.container.position.set(x, y);
        this.targetLabel.position.set(x + w / 2, y - 76);
        this.backdrop.resize(screenW, screenH);
    }

    onResize(_width: number, _height: number): void {
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
        this.container.destroy({ children: true });
    }
}
