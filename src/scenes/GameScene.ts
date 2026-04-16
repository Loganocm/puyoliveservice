import { Container, Graphics, Sprite, AnimatedSprite, Text, TextStyle, Texture } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { Board } from '../game/Board';
import { CELL_SIZE, COLS, TOTAL_ROWS, PuyoColor, PUYO_COLORS, HIDDEN_ROWS } from '../core/Constants';
import { Input } from '../core/Input';
import { ResourceManager } from '../core/ResourceManager';
import { SettingsManager } from '../core/SettingsManager';
import { MenuScene } from './MenuScene'; // needed for Back button
import { SoundManager } from '../core/SoundManager';
import { GameEngine, GameState } from '../core/GameEngine';
import { NetworkManager } from '../core/NetworkManager';
import { GameEvents } from '../core/GameEvents';
import { SettingsOverlay } from '../ui/SettingsOverlay';
import { backgroundManager } from '../core/BackgroundManager';
import { Assets } from 'pixi.js';

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
    vy: number; // pixels per second
}

export class GameScene implements IScene {
    container: Container;

    // Visual Elements
    private staticBg: Sprite; // Fullscreen background layer
    private gameContentWrapper: Container; // Wrapper for all game content (scaled/centered together)
    private graphics: Graphics;
    private puyoContainer: Container;
    private effectContainer: Container;
    private uiContainer: Container;
    // private damageBar: Graphics; // Removed unused property
    private opponentContainer: Container;
    private opponentBorderGraphics: Graphics;
    private settingsOverlay!: SettingsOverlay;
    private xMarkerSprite!: AnimatedSprite;

    // Game Logic Engine
    private engine!: GameEngine;
    private opponentBoard: Board;
    private opponentActivePiece: any = null; // { x, y, rot, main, sub }
    private opponentGarbage: number = 0; // Track opponent's garbage tray
    private opponentScoreText: Text | null = null;


    // Effects
    private particles: Particle[] = [];
    private particleGraphics: Graphics; // Persistent graphics for zero-allocation rendering
    private trackedTexts: TrackedText[] = [];
    private shakeStrength: number = 0;

    // Landing jiggle animation: key = col * 100 + row, value = { t: progress 0..1, gcx/gcy: group center in pixels }
    private landingAnims: Map<number, { t: number, gcx: number, gcy: number }> = new Map();

    // Spawn animation: progress 0..1 (scale-up on new piece)
    private spawnAnim: number = -1;

    // Pop animation progress: 0..1 during POP_ANIM state (for shrink/flash)
    private popAnimProgress: number = 0;

    // Persistent UI Graphics (reused each frame to prevent memory churn)
    private uiGraphics: Graphics;
    private damageGraphics: Graphics;
    private garbageTrayGraphics: Graphics;

    // Pooled UI text objects (created once, updated each frame to avoid expensive Text creation)
    private statLabels: Text[] = [];
    private statValues: Text[] = [];
    private nextLabel: Text | null = null;
    private nextSprites: Sprite[] = [];

    private roomId?: string;
    private gameMessage: string = "";

    private networkListeners: { event: string, cb: any }[] = [];

    // Time mode
    private timeLimit: number = 0; // 0 = no limit, otherwise seconds
    private elapsedTime: number = 0; // in seconds (real time)
    private accumulator: number = 0; // accumulates delta time for timer

    // Frame-based movement tracking for DAS/ARR precision
    private dasFrameLeft: number = 0;
    private dasFrameRight: number = 0;
    private lastMoveFrameLeft: number = -999;
    private lastMoveFrameRight: number = -999;
    private currentFrame: number = 0;

    // Seed
    private seed?: number;
    private opponentId?: string;

    // Fixed timestep accumulator for server tick_frame (ensures 60 logical fps recording)
    private tickFrameAccumulator: number = 0;

    private afkTimer: any = null;
    private afkCheckStart: number = 0;
    private readonly AFK_LIMIT = 20000; // 20 seconds
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private hasErrorText: boolean = false;

    private nextQueueAnimation: number = 0; // 1.0 -> 0.0 sliding animation

    // New Pause / Forfeit Logic
    private isPaused: boolean = false;
    private escapeHoldTimer: number = 0;
    private readonly FORFEIT_HOLD_TIME = 1.5; // Seconds to hold escape to forfeit
    private forfeitBar: Graphics;
    private replayData: any = null;

    // Bound handlers for GameEvents (for cleanup on destroy)
    private handleGameResume = () => { this.isPaused = false; };

    constructor(roomId?: string, timeLimit: number = 0, seed?: number, opponentId?: string, replayData?: any) {
        this.roomId = roomId;
        this.timeLimit = timeLimit;
        this.seed = seed;
        this.opponentId = opponentId;
        this.replayData = replayData;

        console.log(`[GameScene] Initializing. Room: ${roomId}, Seed: ${seed}, Opponent: ${opponentId}`);
        if (roomId) {
            console.log(`[GameScene] Multiplayer mode. Replay recording ENABLED. tickFrame/recordInput will fire each frame.`);
        }

        // Visibility / AFK Handler
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        this.container = new Container();

        // Initialize Static Background (fullscreen, not scaled with game content)
        this.staticBg = new Sprite();
        this.staticBg.anchor.set(0.5);
        this.staticBg.position.set(window.innerWidth / 2, window.innerHeight / 2);
        this.container.addChild(this.staticBg);

        // Load Random Background (Pre-selected)
        const bgUrl = backgroundManager.getGameBackground();
        console.log('[GameScene] Loading background:', bgUrl);
        if (bgUrl) {
            Assets.load(bgUrl).then((texture) => {
                console.log('[GameScene] Background loaded:', texture);
                if (this.staticBg && !this.staticBg.destroyed) {
                    this.staticBg.texture = texture;
                    this.resizeBackground();
                }
            }).catch(e => {
                console.error('[GameScene] Failed to load background:', e);
            });
        }

        // Game content wrapper - this single container holds ALL game elements
        // and gets scaled/centered as a unit for responsive design
        this.gameContentWrapper = new Container();
        this.container.addChild(this.gameContentWrapper);

        this.graphics = new Graphics();
        this.gameContentWrapper.addChild(this.graphics);

        // Default empty board for opponent
        this.opponentBoard = new Board();

        this.puyoContainer = new Container();
        this.gameContentWrapper.addChild(this.puyoContainer);

        this.effectContainer = new Container();
        this.gameContentWrapper.addChild(this.effectContainer);

        // Optimized Particle Rendering
        this.particleGraphics = new Graphics();
        this.effectContainer.addChild(this.particleGraphics);

        this.uiContainer = new Container();
        this.gameContentWrapper.addChild(this.uiContainer);

        // Persistent UI Graphics - initialized once, reused each frame via .clear()
        this.uiGraphics = new Graphics();
        this.damageGraphics = new Graphics();
        this.garbageTrayGraphics = new Graphics();
        this.uiContainer.addChild(this.uiGraphics);
        this.uiContainer.addChild(this.damageGraphics);
        this.uiContainer.addChild(this.garbageTrayGraphics);

        // Initialize Forfeit Bar (persistent)
        this.forfeitBar = new Graphics();
        this.uiContainer.addChild(this.forfeitBar);

        // this.damageBar removed (unused)

        this.opponentContainer = new Container();
        this.gameContentWrapper.addChild(this.opponentContainer);
        // Position on the LEFT side (under time stats area)
        this.opponentContainer.position.set(40, 520);
        this.opponentContainer.scale.set(0.45); // Half size

        // Persistent graphics for opponent border (reused, not recreated each frame)
        this.opponentBorderGraphics = new Graphics();
        this.opponentBorderGraphics.rect(0, 0, COLS * CELL_SIZE, (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE);
        this.opponentBorderGraphics.stroke({ color: 0xffffff, width: 4, alpha: 0.8 });

        // Init X Marker
        const xMarkerTextures = ResourceManager.getXMarkerTextures();
        this.xMarkerSprite = new AnimatedSprite(xMarkerTextures);
        this.xMarkerSprite.animationSpeed = 0.25; // Smoother animation (~15 fps)
        this.xMarkerSprite.play();
        this.xMarkerSprite.width = CELL_SIZE * 0.7;
        this.xMarkerSprite.height = CELL_SIZE * 0.7;
        this.xMarkerSprite.anchor.set(0.5);
        this.xMarkerSprite.x = 2 * CELL_SIZE + CELL_SIZE / 2;
        this.xMarkerSprite.y = (HIDDEN_ROWS - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2; // = 0 + half
        this.xMarkerSprite.alpha = 0.8;

        // Apply initial positioning (will be updated on resize)
        this.updateLayout();

        // Create pooled UI text objects (avoids expensive Text creation each frame)
        this.initUIPool();

        // Initialize Engine
        this.setupEngine();

        // Bind Engine Events for FX
        // Moved to setupEngine
        if (this.roomId) {
            const onGarbage = (data: any) => {
                try {
                    // Filter by opponent ID if known (prevent zombie/spectator interference)
                    // garbage doesn't have senderId usually? Wait, receive_garbage just sends amount.
                    // Ideally we should track sender. But garbage is room-event.
                    // Assuming 1v1 for now, but server restricts send_garbage logic. 
                    // However, receive_garbage comes from broadcast.
                    // Let's assume server handles garbage validity.
                    if (data && typeof data.amount === 'number') {
                        console.log("Received Garbage:", data.amount);
                        this.engine.addGarbage(data.amount);
                        this.spawnFloatingText(400, 100, `Warning! +${data.amount}`, 0xff0000);
                    }
                } catch (e) { console.error("Error processing garbage:", e); }
            };
            NetworkManager.on('receive_garbage', onGarbage);
            this.networkListeners.push({ event: 'receive_garbage', cb: onGarbage });

            const onBoard = (data: any) => {
                try {
                    // Filter stray packets
                    if (this.opponentId && data.playerId && data.playerId !== this.opponentId) {
                        // console.log("Ignoring board from non-opponent:", data.playerId);
                        return;
                    }

                    if (data && data.grid) {
                        this.opponentBoard.updateFromData(data.grid);
                        // Clear active piece on board update (assuming lock)
                        this.opponentActivePiece = null;

                        // Update opponent garbage
                        if (typeof data.garbageTray === 'number') {
                            this.opponentGarbage = data.garbageTray;
                        }
                    }
                } catch (e) { console.error("Error processing opponent board:", e); }
            };
            NetworkManager.on('receive_board_state', onBoard);
            this.networkListeners.push({ event: 'receive_board_state', cb: onBoard });

            const onPlayer = (data: any) => {
                // { state: { x, y, rot, main, sub }, playerId: ... }
                if (this.opponentId && data.playerId && data.playerId !== this.opponentId) return;

                if (data && data.state) {
                    this.opponentActivePiece = data.state;
                }
            };
            NetworkManager.on('receive_player_state', onPlayer);
            this.networkListeners.push({ event: 'receive_player_state', cb: onPlayer });

            const onOpponentWon = (_data: any) => {
                // Handled by opponent_lost
            };
            NetworkManager.on('opponent_won', onOpponentWon);
            this.networkListeners.push({ event: 'opponent_won', cb: onOpponentWon });

            const onOpponentLost = (_data: any) => {
                console.log("[GameScene] Opponent Lost! Triggering Win.");
                this.gameMessage = "YOU WIN!";
                // Set message before changeState so onStateChange handler emits correct event
                // changeState triggers onStateChange which emits 'game_over' event for React overlay
                this.engine.changeState(GameState.GAMEOVER);
            };
            NetworkManager.on('opponent_lost', onOpponentLost);
            this.networkListeners.push({ event: 'opponent_lost', cb: onOpponentLost });

            const onOpponentLeft = (_data: any) => {
                console.log("[GameScene] Opponent Left (requeued). Triggering Win.");
                this.gameMessage = "OPPONENT LEFT";
                this.engine.state = GameState.GAMEOVER;
                GameEvents.emit('game_over', { score: this.engine.stats.score, message: this.gameMessage, result: 'win' });
            };
            NetworkManager.on('opponent_left', onOpponentLeft);
            this.networkListeners.push({ event: 'opponent_left', cb: onOpponentLeft });
        }

        // Global Disconnect Handler
        // Global Disconnect / Reconnect Handler
        const onDisconnect = () => {
            if (!this.roomId) {
                console.log("[GameScene] Disconnected (Single Player - Ignoring)");
                return; // Ignore disconnects in single player
            }

            console.warn("[GameScene] Socket disconnected! Waiting for reconnect...");

            // Show Reconnecting Warning
            // We can reuse gameMessage or a separate overlay? 
            // For now, let's spawn a persistent floating text or use gameMessage but NOT change state to GAMEOVER
            this.spawnFloatingText(500, 300, "RECONNECTING...", 0xFFFF00);

            // Start 5s Timeout
            // If we don't reconnect in 5s, THEN Game Over
            if (this.afkTimer) clearInterval(this.afkTimer); // Re-use this variable or create new?
            // Let's create a dedicated reconnectTimer property if needed, but for now specific timer:
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
                if (this.container?.destroyed) return; // Guard against destroyed scene
                if (this.roomId && !NetworkManager.isConnected && this.engine.state !== GameState.GAMEOVER) {
                    console.log("[GameScene] Reconnect timed out. Game Over.");
                    this.gameMessage = "CONNECTION LOST";
                    this.engine.changeState(GameState.GAMEOVER);
                }
            }, 5000);
        };

        const onConnect = () => {
            if (this.roomId && this.engine.state !== GameState.GAMEOVER) {
                console.log("[GameScene] Socket reconnected! Re-authenticating...");
                this.spawnFloatingText(500, 350, "RECONNECTING...", 0xFFFF00);

                // Re-authenticate first (server needs to know our userId to recognize us)
                const token = localStorage.getItem('puyolive_token');
                if (token) {
                    NetworkManager.authenticate(token);
                    // Small delay to let auth complete, then rejoin
                    setTimeout(() => {
                        if (this.container?.destroyed) return;
                        if (this.roomId && this.engine.state !== GameState.GAMEOVER) {
                            console.log("[GameScene] Attempting to rejoin room:", this.roomId);
                            NetworkManager.joinRoom(this.roomId);
                        }
                    }, 200);
                } else {
                    // No auth token - just try to rejoin (will likely fail)
                    NetworkManager.joinRoom(this.roomId);
                }
            }
        };

        // Handle successful reconnection to room
        const onReconnected = (data: { roomId: string }) => {
            if (this.roomId === data.roomId) {
                console.log("[GameScene] Successfully reconnected to room!");
                this.spawnFloatingText(500, 350, "RECONNECTED!", 0x00FF00);
            }
        };
        NetworkManager.on('reconnected', onReconnected);
        this.networkListeners.push({ event: 'reconnected', cb: onReconnected });

        NetworkManager.on('disconnect', onDisconnect);
        this.networkListeners.push({ event: 'disconnect', cb: onDisconnect });

        NetworkManager.on('connect', onConnect);
        this.networkListeners.push({ event: 'connect', cb: onConnect });

        // Handle room errors (e.g., room not found on reconnect)
        const onError = (data: { message: string }) => {
            if (data.message === 'Room not found' || data.message === 'Room full') {
                console.warn(`[GameScene] Room error: ${data.message}`);
                if (this.roomId && this.engine.state !== GameState.GAMEOVER) {
                    this.gameMessage = "ROOM EXPIRED";
                    this.engine.changeState(GameState.GAMEOVER);
                    this.spawnFloatingText(500, 300, "ROOM EXPIRED", 0xFF4444);
                }
            }
        };
        NetworkManager.on('error', onError);
        this.networkListeners.push({ event: 'error', cb: onError });

        // Match Found Handler (for Requeue)
        const onMatchFound = (data: { roomId: string }) => {
            console.log("[GameScene] Match Found! Transitioning to new game.");
            // If already in game, this might be a reconnect?
            // If in Game Over and searching, this is a Requeue success.
            SceneManager.changeScene(new GameScene(data.roomId));
        };
        NetworkManager.on('match_found', onMatchFound);
        this.networkListeners.push({ event: 'match_found', cb: onMatchFound });

        this.settingsOverlay = new SettingsOverlay();
        // this.container.addChild(this.settingsOverlay.container); // Temporarily remove to debug ghost rectangle

        // Listen for React overlay events
        GameEvents.on('game_resume', this.handleGameResume);

        // UIManager.showGameHUD(!!this.roomId); // Handled by React now

    }

    private initUIPool() {
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

        // 4 stat slots: SCORE, MAX CHAIN, CLEARED, TIME (time may be hidden)
        const statNames = ['SCORE', 'MAX CHAIN', 'CLEARED', 'TIME'];
        for (let i = 0; i < statNames.length; i++) {
            const lbl = new Text({ text: statNames[i], resolution: 2, style: labelStyle });
            lbl.anchor.set(0.5);
            lbl.visible = false;
            this.uiContainer.addChild(lbl);
            this.statLabels.push(lbl);

            const val = new Text({ text: '0', resolution: 2, style: valueStyle });
            val.anchor.set(0.5);
            val.visible = false;
            this.uiContainer.addChild(val);
            this.statValues.push(val);
        }

        // NEXT label
        this.nextLabel = new Text({
            text: 'NEXT',
            resolution: 2,
            style: { fontFamily: 'Arial', fontSize: 16, fontWeight: '900' as const, fill: 0xFF5733, letterSpacing: 2 }
        });
        this.nextLabel.anchor.set(0.5);
        this.nextLabel.visible = false;
        this.uiContainer.addChild(this.nextLabel);

        // 4 next piece sprites (2 pieces × main+sub)
        for (let i = 0; i < 4; i++) {
            const sp = new Sprite();
            sp.anchor.set(0.5);
            sp.visible = false;
            this.uiContainer.addChild(sp);
            this.nextSprites.push(sp);
        }
    }

    setupEngine() {
        if (this.replayData) {
            console.log("Starting Replay Mode");
            this.engine = new GameEngine(this.replayData.seed);
            this.engine.loadReplay(this.replayData);
        } else {
            this.engine = new GameEngine(this.seed);

            // Only hook up recording if NOT replaying (GameEngine handles this via isReplaying flag check, but redundancy is safe)
            // Actually recordAction checks isReplaying.
        }

        this.gameMessage = "";
        this.elapsedTime = 0;
        this.accumulator = 0;
        this.particles = [];
        this.trackedTexts = [];
        this.landingAnims.clear();
        this.spawnAnim = -1;
        this.popAnimProgress = 0;

        this.engine.onPieceSpawn = () => {
            this.nextQueueAnimation = 1.0;
            this.spawnAnim = 0; // Start spawn scale-up animation
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
                this.popAnimProgress = 0; // Reset pop animation
            }

            if (state === GameState.GAMEOVER) {
                console.log(`[GameScene] Transition to GAMEOVER. Msg: '${this.gameMessage}', Room: ${this.roomId}`);
                if (this.gameMessage !== "YOU WIN!") {
                    // Respect "DISCONNECTED (AFK)" or other specific messages
                    if (!this.gameMessage) this.gameMessage = "YOU LOST";

                    if (this.roomId) {
                        NetworkManager.sendLost(this.roomId);
                    } else {
                        console.warn("[GameScene] Local Game Over (Multiplayer disabled or offline)");
                    }
                }
                // Emit event for React overlay
                GameEvents.emit('game_over', {
                    score: this.engine.stats.score,
                    message: this.gameMessage,
                    isTimeTrial: this.timeLimit > 0,
                    maxChain: this.engine.stats.maxChain,
                    puyosCleared: this.engine.stats.puyosCleared,
                    timeLimit: this.timeLimit,
                    isMultiplayer: !!this.roomId
                });
            }
        };

        this.engine.onGarbageGenerated = (amount) => {
            // Visual feedback for sending attack (multiplayer only)
            if (amount > 0 && this.roomId) {
                this.spawnFloatingText(300, 200, `ATTACK! +${amount}`, 0xff6600);
            }

            if (this.roomId) {
                NetworkManager.sendGarbage(this.roomId, amount);
            }
        };

        this.engine.onGarbageOffset = (amount) => {
            if (amount > 0 && this.roomId) {
                this.spawnFloatingText(300, 300, `OFFSET! -${amount}`, 0x00ff00);
            }
        };

        this.engine.onBoardChange = () => {
            if (this.roomId) {
                // Send board AND current garbage tray state to synchronize opponent's view
                const totalGarbage = this.engine.garbageQueue + this.engine.nuisanceTray;
                NetworkManager.sendBoardState(this.roomId, this.engine.board.getSerializedData(), totalGarbage);
            }
        };

        this.engine.onActivePieceUpdate = () => {
            if (this.roomId && this.engine.activePiece) {
                NetworkManager.sendPlayerState(this.roomId, {
                    x: this.engine.activePiece.x,
                    y: this.engine.activePiece.y,
                    rot: this.engine.activePiece.rot,
                    main: this.engine.activePiece.mainColor,
                    sub: this.engine.activePiece.subColor
                });
            }
        };

        this.engine.onScoreChange = (score) => {
            if (this.roomId) {
                NetworkManager.sendScore(this.roomId, score);
            }
        };

        this.engine.onPieceLock = (cells) => {
            // Flood-fill from locked cells to find entire connected same-color groups
            const board = this.engine.board;
            const visited = new Set<number>();
            const allCells: { c: number, r: number }[] = [];

            for (const cell of cells) {
                const color = board.grid[cell.c][cell.r];
                if (color === PuyoColor.None) continue;
                // BFS flood-fill for this color
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
            // Compute group center across all connected cells
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
            // Jiggle puyos that just settled after a chain pop
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
            // Bigger jiggle + screen shake for hard drops
            this.shakeStrength = Math.max(this.shakeStrength, 6);
        };

        this.engine.onAllClear = () => {
            // Board is completely empty after a chain — show celebration text
            const boardWidth = COLS * CELL_SIZE;
            const boardHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;
            this.spawnFloatingText(boardWidth / 2, boardHeight / 2, 'ALL CLEAR!', 0xFFD700, 1.5);
            this.shakeStrength = Math.max(this.shakeStrength, 10);
        };

        // Send initial state
        if (this.roomId) {
            this.engine.onBoardChange?.();
        }
    }

    // Responsive layout positioning - centers game content on screen
    updateLayout() {
        const screenW = SceneManager.screenWidth;
        const screenH = SceneManager.screenHeight;

        // Calculate centering based on base game dimensions
        const baseW = SceneManager.BASE_WIDTH;
        const baseH = SceneManager.BASE_HEIGHT;

        // Scale to fit while maintaining aspect ratio
        const scale = Math.min(screenW / baseW, screenH / baseH);

        // Center the wrapper on screen
        const offsetX = Math.round((screenW - baseW * scale) / 2);
        const offsetY = Math.round((screenH - baseH * scale) / 2);

        // Position and scale the wrapper - this transforms ALL game content together
        this.gameContentWrapper.position.set(offsetX, offsetY);
        this.gameContentWrapper.scale.set(scale);

        // Child containers use their original base coordinates (within the wrapper)
        // Board positioning - center horizontally within base dimensions
        const topMargin = 80;
        const contentX = (baseW - COLS * CELL_SIZE) / 2;

        this.graphics.position.set(contentX, topMargin);
        this.graphics.scale.set(1); // No individual scaling

        this.puyoContainer.position.set(contentX, topMargin);
        this.puyoContainer.scale.set(1);

        this.effectContainer.position.set(contentX, topMargin);
        this.effectContainer.scale.set(1);

        // UI container at origin of base dimensions
        this.uiContainer.position.set(0, 0);
        this.uiContainer.scale.set(1);
        this.uiContainer.scale.set(1);

        this.resizeBackground();
    }

    private resizeBackground() {
        if (!this.staticBg || !this.staticBg.texture) return;

        const screenW = SceneManager.screenWidth;
        const screenH = SceneManager.screenHeight;

        this.staticBg.position.set(screenW / 2, screenH / 2);

        // Cover logic
        const bgRatio = this.staticBg.texture.width / this.staticBg.texture.height;
        const screenRatio = screenW / screenH;

        if (screenRatio > bgRatio) {
            this.staticBg.width = screenW;
            this.staticBg.height = screenW / bgRatio;
        } else {
            this.staticBg.height = screenH;
            this.staticBg.width = screenH * bgRatio;
        }

        this.staticBg.alpha = 0.4; // Darken for gameplay visibility
    }

    // Called by SceneManager when window resizes
    onResize(_width: number, _height: number) {
        this.updateLayout();
        // Force redraw on next update
        this.draw();
    }

    // Toggle Pause (Single Player)
    togglePause() {
        if (this.roomId) return; // Cannot pause MP

        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            GameEvents.emit('game_pause', { timeLimit: this.timeLimit });
            SoundManager.play('menu_select');
        } else {
            GameEvents.emit('game_resume');
            SoundManager.play('menu_back');
        }
    }

    // V2 Replay: Record input for server-side replay in multiplayer
    private recordInputForReplay(inputType: string): void {
        if (this.roomId && !this.replayData) {
            // Only record in multiplayer matches, not replays
            NetworkManager.recordInput(this.roomId, inputType);
        }
    }

    update(delta: number): void {
        if (this.container.destroyed) return;

        try {
            // Toggle Settings Overlay
            if (Input.isPressed('F2')) {
                this.settingsOverlay.toggle();
            }

            // Custom Pause/Escape Handling (works with keyboard Escape OR controller Start)
            const pauseDown = Input.isActionDown('pause');
            const pausePressed = Input.isActionPressed('pause');

            if (this.roomId) {
                // Multiplayer: Hold to Forfeit
                // Only allow forfeiting if not already game over
                if (pauseDown && this.engine && this.engine.state !== GameState.GAMEOVER) {
                    this.escapeHoldTimer += delta / 60;
                    if (this.escapeHoldTimer >= this.FORFEIT_HOLD_TIME) {
                        this.handleMultiplayerForfeit();
                        return;
                    }
                } else {
                    this.escapeHoldTimer = 0;
                }
            } else {
                // Single Player: Toggle on Press (not Hold)
                if (pausePressed) {
                    this.togglePause();
                }
            }

            if (this.isPaused) {
                // Don't update engine or effects
                return;
            }

            if (this.engine.state === GameState.GAMEOVER) {
                if (Input.isPressed('Enter')) {
                    if (!this.roomId) {
                        this.setupEngine();
                    } else {
                        SceneManager.changeScene(new MenuScene());
                    }
                }
            } else {
                // Update Logic FIRST  
                const prevState = this.engine.state;

                // normalize delta:
                // Pixi delta is roughly 1.0 at 60fps.
                // engine.dt expects 1.0 = normal speed.

                if (this.roomId && !this.replayData) {
                    // MULTIPLAYER: Use fixed timestep for engine updates
                    // The replay system replays at exactly 1.0 dt per frame.
                    // If we use variable dt here, the engine state drifts from what
                    // the replay will reproduce, causing desync after 1-2 seconds.
                    // Unify engine.update + tickFrame into the same accumulator.
                    this.tickFrameAccumulator += delta;
                    while (this.tickFrameAccumulator >= 1.0) {
                        this.tickFrameAccumulator -= 1.0;
                        this.engine.update(1.0);
                        NetworkManager.tickFrame(this.roomId);
                    }
                } else {
                    // SINGLE PLAYER / REPLAY: variable delta for smooth visuals
                    this.engine.update(delta);
                }

                // Log state transitions
                if (prevState !== this.engine.state) {
                    console.log(`⏩ [STATE] Frame ${this.currentFrame}: ${prevState} → ${this.engine.state}`);

                    // Trigger Shake on Garbage Fall
                    if (this.engine.state === GameState.GARBAGE_FALL) {
                        // Logarithmic scale based on dropped amount (Max drop per turn is 30)
                        const amount = Math.min(this.engine.garbageQueue, 30);
                        // Scale: 1 garbage -> ~4 strength, 30 garbage -> ~20 strength
                        this.shakeStrength = Math.log(amount + 1) * 6;
                        SoundManager.play('drop');
                    }
                }

                // Process Input during ACTIVE and transition states
                const state = this.engine.state;
                if (state === GameState.ACTIVE || state === GameState.FALLING ||
                    state === GameState.CHECK_MATCH || state === GameState.SPAWN) {

                    if (this.engine.isReplaying) {
                        this.engine.processReplayFrame();
                    } else {
                        // Only handle input if NOT paused (Menu closed)
                        if (!this.isPaused) {
                            this.handleInput();
                        }

                        // SPAWN-FRAME INSTANT MOVEMENT
                        if (prevState !== GameState.ACTIVE && state === GameState.ACTIVE && this.engine.activePiece) {
                            const leftHeld = Input.isActionDown('moveLeft');
                            const rightHeld = Input.isActionDown('moveRight');

                            if (leftHeld && !rightHeld && this.currentFrame >= this.dasFrameLeft && this.dasFrameLeft > 0) {
                                if (SettingsManager.arr === 0) {
                                    while (this.engine.movePiece(-1)) { };
                                } else {
                                    this.engine.movePiece(-1);
                                }
                                this.lastMoveFrameLeft = this.currentFrame;
                            } else if (rightHeld && !leftHeld && this.currentFrame >= this.dasFrameRight && this.dasFrameRight > 0) {
                                if (SettingsManager.arr === 0) {
                                    while (this.engine.movePiece(1)) { };
                                } else {
                                    this.engine.movePiece(1);
                                }
                                this.lastMoveFrameRight = this.currentFrame;
                            }
                        }
                    }
                }

                // Update timer
                if (this.timeLimit > 0 && (this.engine.state as number) !== GameState.GAMEOVER) {
                    this.accumulator += delta / 60;
                    while (this.accumulator >= 1.0) {
                        this.accumulator -= 1.0;
                        this.elapsedTime++;
                        if (this.elapsedTime >= this.timeLimit) {
                            this.gameMessage = "TIME'S UP!";
                            this.engine.state = GameState.GAMEOVER;
                            // Emit event for React overlay (time trial results)
                            GameEvents.emit('game_over', {
                                score: this.engine.stats.score,
                                message: this.gameMessage,
                                isTimeTrial: true,
                                maxChain: this.engine.stats.maxChain,
                                puyosCleared: this.engine.stats.puyosCleared,
                                timeLimit: this.timeLimit
                            });
                            break;
                        }
                    }
                }
            }

            this.updateEffects(delta);

            // Update queue animation
            if (this.nextQueueAnimation > 0) {
                this.nextQueueAnimation -= delta * 0.1; // Animation speed
                if (this.nextQueueAnimation < 0) this.nextQueueAnimation = 0;
            }

            // Screen Shake (scaled by user setting 0-100)
            let sx = 0, sy = 0;
            if (this.shakeStrength > 0) {
                this.shakeStrength -= delta * 0.5;
                if (this.shakeStrength < 0) this.shakeStrength = 0;
                const shakeMul = SettingsManager.screenShake / 100;
                const str = this.shakeStrength * shakeMul;
                sx = (Math.random() - 0.5) * str;
                sy = (Math.random() - 0.5) * str;
            }

            // Re-calculate positions (PPT style - minimal top margin)
            const bx = (1000 - COLS * CELL_SIZE) / 2;
            const by = 80; // Match constructor's topMargin

            // Apply shake to board containers
            this.graphics.position.set(bx + sx, by + sy);
            this.puyoContainer.position.set(bx + sx, by + sy);
            this.effectContainer.position.set(bx + sx, by + sy);

            // Tick landing jiggle animations
            if (this.landingAnims.size > 0) {
                const speed = delta / 12; // ~12 frames (200ms) total duration
                for (const [key, anim] of this.landingAnims) {
                    const next = anim.t + speed;
                    if (next >= 1) {
                        this.landingAnims.delete(key);
                    } else {
                        anim.t = next;
                    }
                }
            }

            // Tick spawn animation (scale-up over ~8 frames / ~133ms)
            if (this.spawnAnim >= 0 && this.spawnAnim < 1) {
                this.spawnAnim += delta / 8;
                if (this.spawnAnim >= 1) this.spawnAnim = -1; // done
            }

            // Tick pop animation progress
            if (this.engine.state === GameState.POP_ANIM) {
                const scaledDuration = this.engine.getChainScaledDuration(this.engine.POP_ANIM_DURATION);
                this.popAnimProgress = Math.min(1, this.engine.stateTimer / scaledDuration);
            }

            this.draw();
            this.drawUI();
            this.drawForfeitUI(); // Draw progress bar if holding
        } catch (e: any) {
            console.error("GameScene Update Error:", e);
            if (!this.hasErrorText) {
                this.hasErrorText = true;
                const errText = new Text({
                    text: `UPDATE ERROR:\n${e.message}`,
                    resolution: 2,
                    style: { fill: 'orange', fontSize: 16 }
                });
                errText.y = 100;
                this.container.addChild(errText);
            }
        }
    }

    private handleVisibilityChange = () => {
        if (document.hidden) {
            // Only enforce AFK rules in active Multiplayer games
            if (this.roomId && this.engine && this.engine.state !== GameState.GAMEOVER) {
                console.log("[GameScene] Window hidden. Starting AFK timer.");
                this.afkCheckStart = Date.now();
                // Use setInterval to check periodically (1s)
                if (this.afkTimer) clearInterval(this.afkTimer);
                this.afkTimer = setInterval(() => {
                    if (Date.now() - this.afkCheckStart > this.AFK_LIMIT) {
                        this.handleAFKForfeit();
                    }
                }, 1000);
            }
        } else {
            // Back in focus
            if (this.afkTimer) {
                console.log("[GameScene] Window restored. AFK timer cancelled.");
                clearInterval(this.afkTimer);
                this.afkTimer = null;
            }
        }
    };

    private handleAFKForfeit() {
        if (this.afkTimer) clearInterval(this.afkTimer);
        this.afkTimer = null;

        if (this.roomId && this.engine.state !== GameState.GAMEOVER) {
            console.log("[GameScene] AFK LIMIT REACHED. Forfeiting match.");
            this.gameMessage = "DISCONNECTED (AFK)";
            this.engine.changeState(GameState.GAMEOVER);

            // Explicitly leave the room to ensure server cleanup?
            // The onStateChange -> sendLost -> Opponent Wins flow is standard.
            // But usually we also want to disconnect socket or leave logic?
            // "it should make it disconnect from the room and lose"
            // sendLost triggers win for opponent.
            // When user clicks "Restart" or "Menu" on Game Over screen, they leave_queue / leave_room.
            // So just triggering GameState.GAMEOVER is sufficient to satisfy visual + logic.
        }
    }

    private handleMultiplayerForfeit() {
        console.log("Forfeiting match...");
        // Send explicit loss signal to server so opponent gets a Win
        if (this.roomId) {
            NetworkManager.sendPlayerLost(this.roomId);

            // User Requirement: "bring me back to menu"
            // We immediately leave the room and return to the main menu.
            NetworkManager.leaveRoom(this.roomId);
            NetworkManager.leaveQueue();
            this.roomId = undefined;

            GameEvents.emit('exit_game');
        }
    }

    private drawForfeitUI() {
        // Always maintain the graphics instance, just clear if inactive
        this.forfeitBar.clear();

        if (this.escapeHoldTimer <= 0) {
            return;
        }

        const pct = Math.min(this.escapeHoldTimer / this.FORFEIT_HOLD_TIME, 1.0);

        const barW = 300;
        const barH = 20;
        const x = (1000 - barW) / 2;
        const y = 600; // Bottom area

        // BG
        this.forfeitBar.rect(x, y, barW, barH);
        this.forfeitBar.fill({ color: 0x000000, alpha: 0.8 });

        // Fill
        this.forfeitBar.rect(x, y, barW * pct, barH);
        this.forfeitBar.fill({ color: 0xff0000, alpha: 1.0 }); // Red for danger/leaving

        // Optional: Text "HOLD TO ESCAPE"
    }

    handleInput() {
        this.currentFrame++;

        // Professional-grade DAS/ARR - frame-based tracking for zero gaps
        const leftPressed = Input.isActionPressed('moveLeft');
        const rightPressed = Input.isActionPressed('moveRight');
        const leftHeld = Input.isActionDown('moveLeft');
        const rightHeld = Input.isActionDown('moveRight');

        let dx = 0;

        // Priority 1: Fresh key presses - instant movement
        if (leftPressed && !rightPressed) {
            this.dasFrameLeft = this.currentFrame + SettingsManager.das;
            this.lastMoveFrameLeft = this.currentFrame;
            this.dasFrameRight = 0; // Cancel opposite

            // Try to move
            if (this.engine.activePiece) {
                dx = -1;
            } else {
                // Buffer the initial shift so it executes on spawn!
                this.engine.bufferedMove = -1;
            }
        } else if (rightPressed && !leftPressed) {
            this.dasFrameRight = this.currentFrame + SettingsManager.das;
            this.lastMoveFrameRight = this.currentFrame;
            this.dasFrameLeft = 0; // Cancel opposite

            // Try to move
            if (this.engine.activePiece) {
                dx = 1;
            } else {
                // Buffer the initial shift so it executes on spawn!
                this.engine.bufferedMove = 1;
            }
        }
        // Priority 2: Held keys - DAS then ARR
        else if (leftHeld && !rightHeld) {
            // FAILSAFE: If held but no DAS (e.g. initial load or lost state), init DAS immediately
            if (this.dasFrameLeft === 0) {
                dx = -1;
                this.dasFrameLeft = this.currentFrame + SettingsManager.das;
                this.lastMoveFrameLeft = this.currentFrame;
            }
            else if (this.currentFrame >= this.dasFrameLeft) {
                if (SettingsManager.arr === 0) {
                    dx = -2; // Special flag for "Left to Wall"
                } else {
                    const framesSinceMove = this.currentFrame - this.lastMoveFrameLeft;
                    if (framesSinceMove >= SettingsManager.arr) {
                        dx = -1;
                        this.lastMoveFrameLeft = this.currentFrame;
                    }
                }
            }
        } else if (rightHeld && !leftHeld) {
            // FAILSAFE: If held but no DAS (e.g. initial load or lost state), init DAS immediately
            if (this.dasFrameRight === 0) {
                dx = 1;
                this.dasFrameRight = this.currentFrame + SettingsManager.das;
                this.lastMoveFrameRight = this.currentFrame;
            }
            else if (this.currentFrame >= this.dasFrameRight) {
                if (SettingsManager.arr === 0) {
                    dx = 2; // Special flag for "Right to Wall"
                } else {
                    const framesSinceMove = this.currentFrame - this.lastMoveFrameRight;
                    if (framesSinceMove >= SettingsManager.arr) {
                        dx = 1;
                        this.lastMoveFrameRight = this.currentFrame;
                    }
                }
            }
        } else if (!leftHeld && !rightHeld) {
            // Both released - reset
            this.dasFrameLeft = 0;
            this.dasFrameRight = 0;
        }

        // Execute movement - allow during ACTIVE or when piece exists
        if (this.engine.activePiece) {
            let moved = false;
            if (dx === -2) {
                while (this.engine.movePiece(-1)) {
                    moved = true;
                    this.recordInputForReplay('L');
                }
            } else if (dx === 2) {
                while (this.engine.movePiece(1)) {
                    moved = true;
                    this.recordInputForReplay('R');
                }
            } else if (dx !== 0) {
                if (this.engine.movePiece(dx)) {
                    moved = true;
                    this.recordInputForReplay(dx < 0 ? 'L' : 'R');
                }
            }
            if (moved) SoundManager.play('move');
        }

        // Rotation Handling (IRS: Initial Rotation System)
        const rotCCW = Input.isActionPressed('rotateCCW');
        const rotCW = Input.isActionPressed('rotateCW') || Input.isPressed('ArrowUp');

        if (this.engine.activePiece) {
            if (rotCCW && this.engine.rotate(-1)) {
                SoundManager.play('rotate');
                this.recordInputForReplay('CC');
            }
            if (rotCW && this.engine.rotate(1)) {
                SoundManager.play('rotate');
                this.recordInputForReplay('CW');
            }
        } else {
            // ... (IRS buffering logic)
            // Should we play sound on buffer? Usually no, play on execute.
            // When spawnPiece consumes buffer, it calls rotate().
            // We need to modify spawnPiece to return/play sound or just let it be silent?
            // User requested sound "when a piece is rotated ingame". Buffered is essentially that.
            // But engine.rotate() inside spawnPiece handles logic.
            // We can add sound hook in Engine or just play here speculatively? 
            // Better: Play sound when spawn consumes buffer in Engine. 
            // But Engine shouldn't depend on SoundManager directly?
            // Actually, SoundManager is core/static. It's fine.

            if (rotCCW) this.engine.bufferAction = 'rotateCCW';
            if (rotCW) this.engine.bufferAction = 'rotateCW';

        }

        // Soft Drop - track state changes for replay
        const softDropNow = Input.isActionDown('softDrop');
        if (softDropNow !== this.engine.softDrop) {
            this.engine.softDrop = softDropNow;
            this.recordInputForReplay(softDropNow ? 'SD' : 'SU');
        }

        // Pass horizontal state to engine for "Sticky Top/Glide" logic
        this.engine.horizontalMoveHeld = Input.isActionDown('moveLeft') || Input.isActionDown('moveRight');

        // Hard Drop
        if (Input.isActionPressed('hardDrop')) {
            if (this.engine.hardDrop()) {
                SoundManager.play('drop');
                this.recordInputForReplay('HD');
            }
        }

        if (Input.isPressed('KeyG')) {
            // ...
        }


    }

    drawDamageMeter() {
        const totalPoints = this.engine.garbageQueue + this.engine.nuisanceTray;
        const totalRocks = Math.floor(totalPoints / 70);
        if (totalRocks <= 0) return;

        const visibleRows = TOTAL_ROWS - HIDDEN_ROWS;
        const h = visibleRows * CELL_SIZE;
        const barW = 16;

        // Position specifically next to the board
        const topMargin = 80;
        const bx = (1000 - COLS * CELL_SIZE) / 2;
        const barX = bx - 25;
        const barY = topMargin;

        const maxRocks = 24;
        const fillPct = Math.min(totalRocks / maxRocks, 1.0);
        const fillH = h * fillPct;

        const g = this.damageGraphics;
        g.rect(barX, barY, barW, h);
        g.fill({ color: 0x220000, alpha: 0.6 });
        g.stroke({ color: 0x550000, width: 2 });

        g.rect(barX, barY + h - fillH, barW, fillH);
        const color = totalRocks > 39 ? 0xff0000 : 0xff4400;
        g.fill({ color: color, alpha: 0.9 });

        if (totalRocks >= 39) {
            if (this.currentFrame % 10 < 5) {
                g.stroke({ color: 0xffff00, width: 2 });
            }
        }
    }

    drawStatsPanel() {
        // Left Dashboard (x ~100-200) — reuse pooled Text objects
        const leftX = 140;
        let cY = 120;

        const updateStat = (index: number, label: string, value: string | number, labelColor: number = 0xaaaaaa, valueColor: number = 0xffffff) => {
            const lbl = this.statLabels[index];
            const val = this.statValues[index];
            lbl.text = label;
            lbl.style.fill = labelColor;
            lbl.x = leftX;
            lbl.y = cY;
            lbl.visible = true;

            // Background Card for Value
            const cardW = 140;
            const cardH = 50;
            this.uiGraphics.rect(leftX - cardW / 2, cY + 20, cardW, cardH);
            this.uiGraphics.fill({ color: 0x0a0a12, alpha: 0.7 });
            this.uiGraphics.stroke({ color: 0xffffff, width: 1, alpha: 0.15 });

            val.text = value.toString();
            val.style.fill = valueColor;
            val.x = leftX;
            val.y = cY + 45;
            val.visible = true;

            cY += 110;
        };

        updateStat(0, 'SCORE', this.engine.stats.score);
        updateStat(1, 'MAX CHAIN', this.engine.stats.maxChain);
        updateStat(2, 'CLEARED', this.engine.stats.puyosCleared);

        // Time (if enabled)
        if (this.timeLimit > 0) {
            const remaining = Math.max(0, this.timeLimit - this.elapsedTime);
            const m = Math.floor(remaining / 60);
            const s = Math.floor(remaining % 60);
            const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
            const isLow = remaining < 30;
            updateStat(3, 'TIME', timeStr, 0xFFAA00, isLow ? 0xFF5555 : 0xFFAA00);
        } else {
            this.statLabels[3].visible = false;
            this.statValues[3].visible = false;
        }
    }

    drawNextQueue() {
        const queueX = 760;
        const queueY = 150;

        // Reuse persistent NEXT label
        if (this.nextLabel) {
            this.nextLabel.x = queueX;
            this.nextLabel.y = queueY - 40;
            this.nextLabel.visible = true;
        }

        // Primary Slot Frame
        const boxW = 100;
        const boxH = 80;
        const pX = queueX - (boxW / 2);
        const pY = queueY;
        this.uiGraphics.rect(pX, pY, boxW, boxH);
        this.uiGraphics.fill({ color: 0x000000, alpha: 0.3 });
        this.uiGraphics.stroke({ color: 0xFF5733, width: 2 });

        // Draw Pieces using pooled sprites
        const limit = Math.min(this.engine.nextPieces.length, 2);
        const ICON_BASE = 32;

        for (let i = 0; i < 2; i++) {
            const subSprite = this.nextSprites[i * 2];
            const mainSprite = this.nextSprites[i * 2 + 1];

            if (i >= limit) {
                subSprite.visible = false;
                mainSprite.visible = false;
                continue;
            }

            const p = this.engine.nextPieces[i];
            let tx: number, ty: number, spacing: number, displaySize: number;

            if (i === 0) {
                tx = queueX; ty = queueY + 40;
                displaySize = ICON_BASE * 1.35; spacing = 45;
            } else {
                tx = queueX + 100; ty = queueY + 40;
                displaySize = ICON_BASE * 0.9; spacing = 30;
            }

            subSprite.texture = ResourceManager.getPuyoTexture(p.sub, 0);
            subSprite.x = tx - (spacing / 2);
            subSprite.y = ty;
            subSprite.width = displaySize;
            subSprite.height = displaySize;
            subSprite.visible = true;

            mainSprite.texture = ResourceManager.getPuyoTexture(p.main, 0);
            mainSprite.x = tx + (spacing / 2);
            mainSprite.y = ty;
            mainSprite.width = displaySize;
            mainSprite.height = displaySize;
            mainSprite.visible = true;
        }
    }

    drawUI() {
        this.uiGraphics.clear();
        this.damageGraphics.clear();
        this.garbageTrayGraphics.clear();

        // No dynamic child cleanup needed — all UI elements are pooled/persistent

        this.drawStatsPanel();
        this.drawDamageMeter();
        this.drawNextQueue();

        // Draw Board Border (Top Layer) on top of puyos
        const boardWidth = COLS * CELL_SIZE;
        const visibleHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;

        // Get board position (graphics container is positioned at board origin)
        const borderX = this.graphics.x;
        const borderY = this.graphics.y;

        // Draw border rect with outer stroke alignment
        this.uiGraphics.rect(borderX, borderY, boardWidth, visibleHeight);
        this.uiGraphics.stroke({ color: 0xffffff, width: 4, alpha: 1.0, alignment: 1 });

        // Chain text is now handled by spawnChainText -> spawnFloatingText (animated)
    }

    // NOTE: Pause menu, game over screen, and win screen are now handled by React components
    // (PauseScreen.tsx, GameOverScreen.tsx via GameOverlay.tsx)
    // Old PixiJS-based menu code has been removed.


    drawOpponent() {
        // Destroy all children from previous frame (prevent memory leak)
        // Skip the persistent border graphics
        const opChildren = this.opponentContainer.removeChildren();
        for (let i = 0; i < opChildren.length; i++) {
            if (opChildren[i] !== this.opponentBorderGraphics && opChildren[i] !== this.opponentScoreText) {
                opChildren[i].destroy();
            }
        }

        // Re-add persistent border
        this.opponentContainer.addChild(this.opponentBorderGraphics);

        const checkOpponentColor = (c: number, r: number, color: PuyoColor): boolean => {
            if (!this.opponentBoard.isValid(c, r)) return false;
            return this.opponentBoard.grid[c][r] === color;
        };

        const addPuyo = (c: number, r: number, color: PuyoColor, connections: number = 0, alpha: number = 1.0) => {
            // Skip pieces in hidden rows or above (not visible on opponent board)
            if (r < HIDDEN_ROWS) return;

            const texture = ResourceManager.getPuyoTexture(color, connections);
            const sprite = new Sprite(texture);

            // Connected puyos overlap slightly to seal gaps; isolated puyos fit exactly
            const overlap = connections > 0 ? 4 : 0;
            sprite.width = CELL_SIZE + overlap;
            sprite.height = CELL_SIZE + overlap;
            sprite.anchor.set(0.5);

            sprite.x = c * CELL_SIZE + CELL_SIZE / 2;
            sprite.y = (r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
            sprite.alpha = alpha;
            this.opponentContainer.addChild(sprite);
        };

        // Draw Grid
        try {
            if (this.opponentBoard && this.opponentBoard.grid) {
                for (let c = 0; c < COLS; c++) {
                    for (let r = 0; r < TOTAL_ROWS; r++) {
                        const cell = this.opponentBoard.grid[c][r];
                        if (cell !== PuyoColor.None) {
                            let connections = 0;
                            // Only calculate connections for standard colored puyos (0-3 or similar)
                            // Garbage (4) usually doesn't connect in standard ways visually unless texture supports it.
                            // ResourceManager handles texture mapping. 
                            if (cell !== PuyoColor.Garbage) {
                                if (checkOpponentColor(c, r - 1, cell)) connections |= 1; // Top
                                if (checkOpponentColor(c + 1, r, cell)) connections |= 2; // Right
                                if (checkOpponentColor(c, r + 1, cell)) connections |= 4; // Bottom
                                if (checkOpponentColor(c - 1, r, cell)) connections |= 8; // Left
                            }

                            addPuyo(c, r, cell, connections);
                        }
                    }
                }
            }

            // Draw Active Piece and Ghost
            if (this.opponentActivePiece) {
                const { x, y, rot, main, sub } = this.opponentActivePiece;

                // Skip if piece data is incomplete
                if (main === undefined || sub === undefined || rot === undefined) {
                    return;
                }

                // Active Piece
                const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
                const sx = x + offsets[rot].x;
                const sy = y + offsets[rot].y;

                addPuyo(x, y, main);
                addPuyo(sx, sy, sub);

                // Ghost Piece (calculate drop)
                let gY = y;
                const canPlace = (chkX: number, chkY: number, r: number) => {
                    if (chkY >= TOTAL_ROWS) return false;
                    if (chkX < 0 || chkX >= COLS) return false;
                    if (this.opponentBoard.grid[chkX][chkY] !== PuyoColor.None) return false;

                    const sX = chkX + offsets[r].x;
                    const sY = chkY + offsets[r].y;
                    if (sY >= TOTAL_ROWS) return false;
                    if (sX < 0 || sX >= COLS) return false;
                    if (this.opponentBoard.grid[sX][sY] !== PuyoColor.None) return false;

                    return true;
                };

                while (true) {
                    if (canPlace(x, gY + 1, rot)) {
                        gY++;
                    } else {
                        break;
                    }
                }

                addPuyo(x, gY, main, 0, 0.3);
                addPuyo(sx, gY + offsets[rot].y, sub, 0, 0.3);
            }
        } catch (e) { console.error("Error drawing opponent:", e); }

        this.drawOpponentGarbage();
    }

    drawOpponentGarbage() {
        if (this.opponentGarbage <= 0) return;

        // Use same logic as drawGarbageTray but targeted at opponent container
        // Icons values: 1, 6, 30, 180, 360, 720
        const icons: { val: number, type: 'small' | 'big' | 'rock' | 'star' | 'moon' | 'crown' }[] = [
            { val: 720, type: 'crown' },
            { val: 360, type: 'moon' },
            { val: 180, type: 'star' },
            { val: 30, type: 'rock' },
            { val: 6, type: 'big' },
            { val: 1, type: 'small' }
        ];

        let remaining = this.opponentGarbage;
        // Position relative to opponent container (which is scaled 0.5)
        // Opponent container is at 50, 420.
        // We want to draw garbage ABOVE the board (at y=0 relative to container or slightly negative)
        // Board starts at y=0 (inside container).
        // Let's draw at y = 0
        const trayY = 0;
        let drawX = 0;

        for (const icon of icons) {
            while (remaining >= icon.val) {
                if (drawX > (COLS * CELL_SIZE)) break; // Overflow width of board

                const texture = ResourceManager.getGarbageIconTexture(icon.type);
                const sprite = new Sprite(texture);

                // Adjust position
                sprite.x = drawX;
                sprite.y = trayY - (CELL_SIZE); // Draw above the board

                // Force icons to 32px display size
                sprite.width = 32;
                sprite.height = 32;

                this.opponentContainer.addChild(sprite);

                remaining -= icon.val;
                drawX += 32 + 2;
            }
        }
    }

    draw() {
        if (!this.engine || this.container.destroyed) return;

        try {
            // Draw Static Background - fills entire viewport
            // Draw Static Background - fills entire viewport
            // staticBg is a Sprite now, managed by resizeBackground() and texture loading.

            // Fallback if texture is missing or invalid

            if (!this.staticBg.texture || this.staticBg.texture === Texture.WHITE) {
                // Fallback: Use a simple colored texture or nothing?
                // Since we changed it to Sprite, we can't draw on it.
                // We can assign a 1x1 white texture and tint it?
                this.staticBg.texture = Texture.WHITE;
                this.staticBg.tint = 0x0a0a12;
                this.staticBg.width = SceneManager.screenWidth;
                this.staticBg.height = SceneManager.screenHeight;
            } else {
                this.staticBg.tint = 0xFFFFFF; // Reset tint
            }

            // We need a dim overlay.
            // Let's check if we have a child for dimming.
            // Actually, we can just use staticBg.alpha?
            // In resizeBackground we set alpha to 0.4.
            // That might be enough? The user asked for "fading particle effect" earlier, 
            // but here we are just doing background image.

            // Previous code had a "dimOverlay" child.
            // If we want to replicate that:
            // We shouldn't do it inside draw() every frame if it creates new objects!
            // The previous code WAS creating new Graphics every frame: `const dimOverlay = new Graphics()`
            // That is bad for performance.

            // Let's just rely on this.staticBg.alpha = 0.4 set in resizeBackground for now.
            // And remove the offending lines.

            this.graphics.clear();

            // Destroy all puyo sprites from previous frame (prevent memory leak)
            // Skip the persistent xMarkerSprite when destroying
            const children = this.puyoContainer.removeChildren();
            for (let i = 0; i < children.length; i++) {
                if (children[i] !== this.xMarkerSprite) children[i].destroy();
            }

            // Draw Background (Visible Area)
            const visibleHeight = (TOTAL_ROWS - HIDDEN_ROWS) * CELL_SIZE;

            // Draw Full Screen Background - REMOVED from dynamic graphics


            // Draw Board Background


            // Draw main box starting from 0 (visible rows only)
            const boardWidth = COLS * CELL_SIZE;

            // Sprites fit exactly within cells, no extra padding needed
            // Draw board background
            this.graphics.rect(0, 0, boardWidth, visibleHeight);

            // Dark background for playfield visibility
            this.graphics.fill({ color: 0x000000, alpha: 0.75 });

            // Draw X Marker (PPT Style) - Column 2, Row HIDDEN_ROWS (first visible top row)
            // The X marks where you die if you lock a piece there
            // Note: xMarkerSprite is initialized in constructor to maintain animation state
            // Re-adding it to puyoContainer because we cleared it
            this.puyoContainer.addChild(this.xMarkerSprite);

            this.drawBoard();

            if (this.engine.activePiece) {
                this.drawActivePiece();
                this.drawGhostPiece();
            }

            if (this.roomId) {
                this.drawOpponent();
            }

            this.drawEffects();
        } catch (e: any) {
            console.error("GameScene Draw Error:", e);
            if (!this.hasErrorText) {
                this.hasErrorText = true;
                const errText = new Text({
                    text: `RENDER ERROR:\n${e.message}`,
                    resolution: 2,
                    style: { fill: 'red', fontSize: 16 }
                });
                this.container.addChild(errText);
            }
        }
    }

    checkColor(c: number, r: number, color: PuyoColor): boolean {
        if (!this.engine.board.isValid(c, r)) return false;
        return this.engine.board.grid[c][r] === color;
    }

    drawPuyo(c: number, r: number, color: PuyoColor, connections: number, alpha: number = 1.0, scale: number = 1.0) {
        // Allow drawing in hidden rows (r < HIDDEN_ROWS) logic handled by drawY
        const drawY = (r - HIDDEN_ROWS) * CELL_SIZE;
        const drawX = c * CELL_SIZE;

        const texture = ResourceManager.getPuyoTexture(color, connections);
        const sprite = new Sprite(texture);

        // Connected puyos overlap slightly to seal gaps; isolated puyos fit exactly
        const overlap = connections > 0 ? 4 : 0;
        const baseW = (CELL_SIZE + overlap) * scale;
        const baseH = (CELL_SIZE + overlap) * scale;

        sprite.anchor.set(0.5);
        sprite.x = drawX + CELL_SIZE / 2;
        sprite.y = drawY + CELL_SIZE / 2;
        sprite.alpha = alpha;

        // Landing jiggle: squash horizontally, stretch vertically then spring back
        const animKey = Math.round(c) * 100 + Math.round(r);
        const anim = this.landingAnims.get(animKey);
        if (anim !== undefined) {
            // Damped sine wave: amplitude decays as t goes 0→1
            const amp = (1 - anim.t) * 0.18;
            const wave = Math.sin(anim.t * Math.PI * 3); // ~1.5 full oscillations
            const scaleX = 1 + amp * wave;   // wider on first bounce
            const scaleY = 1 - amp * wave;   // shorter on first bounce
            sprite.width = baseW * scaleX;
            sprite.height = baseH * scaleY;
            // Scale position relative to group center so connected puyos move as one unit
            const sx = sprite.x;
            const sy = sprite.y;
            sprite.x = anim.gcx + (sx - anim.gcx) * scaleX;
            sprite.y = anim.gcy + (sy - anim.gcy) * scaleY + (baseH * (1 - scaleY)) * 0.25;
        } else {
            sprite.width = baseW;
            sprite.height = baseH;
        }

        this.puyoContainer.addChild(sprite);
    }

    spawnParticles() {
        // Spawn particles based on matchedPuyos
        for (const group of this.engine.matchedPuyos) {
            const groupSize = group.length;
            if (groupSize === 0) continue;

            let totalX = 0;
            let totalY = 0;

            for (const p of group) {
                let cx = p.c * CELL_SIZE + CELL_SIZE / 2;
                let cy = (p.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;

                const color = this.engine.board.grid[p.c][p.r];
                if (color !== PuyoColor.None) {
                    let connections = 0;
                    if (this.checkColor(p.c, p.r - 1, color)) connections |= 1; // Top
                    if (this.checkColor(p.c + 1, p.r, color)) connections |= 2; // Right
                    if (this.checkColor(p.c, p.r + 1, color)) connections |= 4; // Bottom
                    if (this.checkColor(p.c - 1, p.r, color)) connections |= 8; // Left

                    // Particle spawns at cell center (no offset needed with exact-fit sprites)
                }

                totalX += cx;
                totalY += cy;
            }

            const centerX = totalX / groupSize;
            const centerY = totalY / groupSize;

            const firstP = group[0];
            const pColor = this.engine.board.grid[firstP.c][firstP.r];
            const colorVal = (pColor >= 0 && pColor < PUYO_COLORS.length) ? PUYO_COLORS[pColor] : 0xFFFFFF;

            for (let i = 0; i < groupSize * 4; i++) {
                this.particles.push({
                    x: centerX,
                    y: centerY,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    color: colorVal,
                    life: 1.0,
                    maxLife: 1.0 + Math.random() * 0.5
                });
            }
        }
    }

    spawnChainText(chain: number) {
        // Find a good spot (center of first group)
        if (this.engine.matchedPuyos.length === 0) return;

        const group = this.engine.matchedPuyos[0];
        let tx = 0, ty = 0;
        for (const p of group) {
            tx += p.c * CELL_SIZE + CELL_SIZE / 2;
            ty += (p.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
        }
        const cx = tx / group.length;
        const cy = ty / group.length;

        // Minimal chain indicator — only show for chains >= 2
        if (chain >= 2) {
            this.spawnFloatingText(cx, cy, `${chain} Chain`, 0xFFFF00, 0.75 + chain * 0.15);
        }
    }

    spawnFloatingText(x: number, y: number, text: string, color: number, duration: number = 0.75) {
        const style = new TextStyle({
            fontFamily: 'Rajdhani',
            fontSize: 40,
            fontWeight: 'bold',
            fill: color,
            stroke: { color: 'white', width: 4 },
            dropShadow: {
                color: '#000000',
                blur: 4,
                angle: Math.PI / 6,
                distance: 6,
            }
        });

        const txt = new Text({ text, style, resolution: 2 });
        txt.anchor.set(0.5);
        txt.x = x;
        txt.y = y;
        this.effectContainer.addChild(txt);

        // Track in game loop (time-based, ~duration seconds)
        this.trackedTexts.push({
            pixiText: txt,
            elapsed: 0,
            duration, // seconds
            vy: -80, // pixels per second (upward drift)
        });
    }

    updateEffects(delta: number) {
        // dt in seconds (delta is in frames at 60fps, so delta/60 = seconds)
        const dtSec = delta / 60;

        // Particles (fixed: multiply velocity by delta)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.vy += 0.2 * delta;
            p.life -= 0.03 * delta;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Tracked floating texts (time-based)
        for (let i = this.trackedTexts.length - 1; i >= 0; i--) {
            const tt = this.trackedTexts[i];
            tt.elapsed += dtSec;
            const progress = Math.min(1, tt.elapsed / tt.duration);

            tt.pixiText.y += tt.vy * dtSec;
            // Fade out in the last 40% of lifetime
            if (progress > 0.6) {
                tt.pixiText.alpha = 1 - ((progress - 0.6) / 0.4);
            }
            // Scale-in pop at start
            if (progress < 0.1) {
                const s = 0.5 + (progress / 0.1) * 0.5;
                tt.pixiText.scale.set(s);
            } else {
                tt.pixiText.scale.set(1);
            }

            if (tt.elapsed >= tt.duration) {
                tt.pixiText.destroy();
                this.trackedTexts.splice(i, 1);
            }
        }
    }

    drawEffects() {
        // Zero-allocation rendering: Clear and redraw persistent graphics
        this.particleGraphics.clear();

        if (this.particles.length > 0) {
            for (const p of this.particles) {
                this.particleGraphics.rect(p.x - 3, p.y - 3, 6, 6);
                this.particleGraphics.fill({ color: p.color, alpha: p.life / p.maxLife });
            }
        }
    }

    drawBoard() {
        const board = this.engine.board;

        // Build lookup for gravity interpolation during FALLING state
        const fallingLookup = new Map<number, number>(); // key = c*100+r -> destR
        let fallingProgress = 0;
        if (this.engine.state === GameState.FALLING && this.engine.fallingDestinations.length > 0) {
            const scaledDelay = this.engine.getChainScaledDuration(this.engine.FALL_STEP_DELAY);
            fallingProgress = Math.min(1, this.engine.stateTimer / scaledDelay);
            // Ease-in (accelerating fall, like gravity)
            fallingProgress = fallingProgress * fallingProgress;
            for (const f of this.engine.fallingDestinations) {
                fallingLookup.set(f.c * 100 + f.r, f.destR);
            }
        }

        // Build lookup for pop animation during POP_ANIM state
        const poppingSet = new Set<number>();
        if (this.engine.state === GameState.POP_ANIM && this.engine.matchedPuyos.length > 0) {
            for (const group of this.engine.matchedPuyos) {
                for (const p of group) {
                    poppingSet.add(p.c * 100 + p.r);
                }
            }
        }

        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                const color = board.grid[c][r];
                if (color !== PuyoColor.None) {
                    let connections = 0;
                    if (this.checkColor(c, r - 1, color)) connections |= 1;
                    if (this.checkColor(c + 1, r, color)) connections |= 2;
                    if (this.checkColor(c, r + 1, color)) connections |= 4;
                    if (this.checkColor(c - 1, r, color)) connections |= 8;

                    const key = c * 100 + r;

                    // Pop animation: flash and shrink matched puyos
                    if (poppingSet.has(key)) {
                        const popT = this.popAnimProgress;
                        // Flash: alternate alpha rapidly, then shrink
                        const flash = Math.sin(popT * Math.PI * 6) * 0.3 + 0.7;
                        const shrink = popT < 0.6 ? 1.0 : 1.0 - ((popT - 0.6) / 0.4);
                        this.drawPuyo(c, r, color, connections, flash, shrink);
                        continue;
                    }

                    // Gravity interpolation: smoothly move falling puyos
                    const destR = fallingLookup.get(key);
                    if (destR !== undefined) {
                        const visualR = r + (destR - r) * fallingProgress;
                        // Recompute connections for falling puyos: only connect to neighbors
                        // that are falling the exact same distance (so they stay visually together).
                        // Neighbors falling a different amount (or not falling) will visually
                        // separate, causing cut-off sprite artifacts if we kept the connection.
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
        }

        // Falling Garbage Animation
        if (this.engine.fallingGarbage && this.engine.fallingGarbage.length > 0) {
            for (const garb of this.engine.fallingGarbage) {
                if (garb.delay <= 10) {
                    this.drawPuyo(garb.c, garb.r, PuyoColor.Garbage, 0);
                }
            }
        }
    }

    drawActivePiece() {
        if (!this.engine.activePiece) return;
        const { x, y, rot, mainColor, subColor } = this.engine.activePiece;

        // Connections for active piece?? Usually just separate puyos active 
        // until lock. They connect visually but valid logic is later.
        // For Puyo, they rotate around each other.
        // Let's connect them if they touch? 
        // Actually, internal connection only if same color.

        let mainConn = 0;
        let subConn = 0;
        if (mainColor === subColor) {
            // They are connected to each other
            // Rot 0: Sub is Up (Main has Top conn, Sub has Bot conn) -> Main=1, Sub=4 ?
            // Top=1, Right=2, Bot=4, Left=8

            // Sub relative to Main:
            // 0: (0,-1) -> Up. Main connects Up(1), Sub connects Down(4).
            // 1: (1,0) -> Right. Main connects Right(2), Sub connects Left(8).
            // 2: (0,1) -> Down. Main connects Bottom(4), Sub connects Up(1).
            // 3: (-1,0) -> Left. Main connects Left(8), Sub connects Right(2).

            const mainMasks = [1, 2, 4, 8]; // Top, Right, Bot, Left
            const subMasks = [4, 8, 1, 2];  // Bot, Left, Top, Right

            mainConn = mainMasks[rot];
            subConn = subMasks[rot];
        }

        // Calculate Sub Position
        const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
        const sx = offsets[rot].x;
        const sy = offsets[rot].y;

        // Spawn scale-up animation
        const spawnScale = this.spawnAnim >= 0 ? 0.5 + this.spawnAnim * 0.5 : 1.0;
        const spawnAlpha = this.spawnAnim >= 0 ? this.spawnAnim : 1.0;

        this.drawPuyo(x, y, mainColor, mainConn, spawnAlpha, spawnScale);
        this.drawPuyo(x + sx, y + sy, subColor, subConn, spawnAlpha, spawnScale);
    }

    drawGhostPiece() {
        if (!this.engine.activePiece) return;
        const ap = this.engine.activePiece;
        const board = this.engine.board; // Use board from engine

        // Simple Ghost Logic (Drop until collision)
        let gY = ap.y;

        // Helper to check placement validity for ghost
        const canPlace = (x: number, y: number, r: number) => {
            // Basic bounds
            if (y >= TOTAL_ROWS) return false;
            if (x < 0 || x >= COLS) return false; // Should be constrained by active piece anyway

            // Check collisions active part
            if (y >= 0 && board.grid[x][y] !== PuyoColor.None) return false;

            // Check sub part
            const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
            const sx = x + offsets[r].x;
            const sy = y + offsets[r].y;

            if (sy >= TOTAL_ROWS) return false;
            if (sx < 0 || sx >= COLS) return false;
            if (sy >= 0 && board.grid[sx][sy] !== PuyoColor.None) return false;

            return true;
        };

        // Drop
        while (true) {
            // Check next position (gY + 1)
            // If valid, increment. Else stop.
            // Check main and sub
            if (canPlace(ap.x, gY + 1, ap.rot)) {
                gY++;
            } else {
                break;
            }
        }

        // Draw Ghost
        const { x, rot, mainColor, subColor } = ap;

        let mainConn = 0;
        let subConn = 0;
        if (mainColor === subColor) {
            const mainMasks = [1, 2, 4, 8];
            const subMasks = [4, 8, 1, 2];
            mainConn = mainMasks[rot];
            subConn = subMasks[rot];
        } else {
            // Ghost always shows connection if same color?
        }

        const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
        const sx = offsets[rot].x;
        const sy = offsets[rot].y;

        this.drawPuyo(x, gY, mainColor, mainConn, 0.3);
        this.drawPuyo(x + sx, gY + sy, subColor, subConn, 0.3);
    }


    destroy(): void {
        console.log("[GameScene] Destroying...");
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        if (this.afkTimer) clearInterval(this.afkTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.container.destroy({ children: true });

        // Network listeners unbind
        for (const l of this.networkListeners) {
            NetworkManager.off(l.event, l.cb);
        }
        this.networkListeners = [];

        // GameEvents listener cleanup
        GameEvents.off('game_resume', this.handleGameResume);

        // Note: engine cleans itself up mostly
    }
}
