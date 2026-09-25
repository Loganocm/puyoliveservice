import { Container, Graphics, Text } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { Board } from '@puyolive/engine';
import { BOARD_LEFT, BOARD_TOP, SIDE_GAP, OPPONENT_SCALE } from '../core/RenderConstants';
import { Input } from '../core/Input';
import { HandlingController } from '../input/Handling';
import type { HandlingHooks } from '../input/Handling';
import { SettingsManager } from '../core/SettingsManager';
import { MenuScene } from './MenuScene'; // needed for Back button
import { SoundManager } from '../core/SoundManager';
import { GameEngine, GameState } from '@puyolive/engine';
import { NetworkManager } from '../core/NetworkManager';
import { MatchClock } from '../core/MatchClock';
import { OpponentView } from '../core/OpponentView';
import { GameEvents } from '../core/GameEvents';
import { SettingsOverlay } from '../ui/SettingsOverlay';
import { BGMManager } from '../core/BGMManager';
import type { LabController } from '../lab/LabDriver';
import { BoardView, engineFrame, pendingGarbage } from '../render/BoardView';
import type { BoardFrame } from '../render/BoardView';
import { Backdrop } from '../render/Backdrop';
import { NextQueueView } from '../render/NextQueueView';
import { StatPanel } from '../render/StatPanel';
import type { StatRow } from '../render/StatPanel';
import { FONTS, getTheme } from '../theme/tokens';

export class GameScene implements IScene {
    container: Container;

    // Visual elements. The board, the opponent's board, the queue and the
    // stats are views over engine state (src/render/); the scene only
    // positions them and feeds them frames.
    private backdrop: Backdrop;
    private gameContentWrapper: Container; // Scaled and centred as one unit
    private board: BoardView;
    private boardFrame!: BoardFrame;
    private nextQueue: NextQueueView;
    private stats: StatPanel;
    private opponentBoardView: BoardView | null = null;
    private opponentFrame: BoardFrame | null = null;
    private opponentLabel: Text | null = null;
    private uiContainer: Container;
    private settingsOverlay!: SettingsOverlay;
    private scoreShown = -1;
    private scoreText = '0';

    // Game Logic Engine
    private engine!: GameEngine;
    private opponentBoard: Board;
    /** Local simulation of the opponent, driven by their relayed inputs. */
    private opponentView: OpponentView | null = null;

    /** Real time carried between rendered frames, in logical frames. */
    private singlePlayerAccumulator = 0;
    /** Cap on engine steps per rendered frame, so a stall cannot spiral. */
    private static readonly MAX_CATCHUP_STEPS = 5;

    /** Board-state heartbeat cadence. Must stay well under the server's 7s
     *  AFK timeout while sending far less than the 10/s the server allows. */
    private static readonly BOARD_SYNC_INTERVAL_MS = 500;
    private lastBoardSendMs = 0;
    private opponentGarbage: number = 0; // Track opponent's garbage tray


    private roomId?: string;
    private gameMessage: string = "";

    private networkListeners: { event: string, cb: any }[] = [];

    // Time mode
    private timeLimit: number = 0; // 0 = no limit, otherwise seconds
    private elapsedTime: number = 0; // in seconds (real time)
    private accumulator: number = 0; // accumulates delta time for timer

    /** DAS, ARR, rotation and drops, applied once per logical frame. */
    private readonly handling = new HandlingController();
    private readonly handlingHooks: HandlingHooks = {
        record: code => this.recordInputForReplay(code),
        sound: sound => SoundManager.play(sound),
    };

    // Seed
    private seed?: number;
    private opponentId?: string;

    private afkTimer: any = null;
    private afkCheckStart: number = 0;
    private readonly AFK_LIMIT = 20000; // 20 seconds
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private hasErrorText: boolean = false;

    // New Pause / Forfeit Logic
    private isPaused: boolean = false;
    private escapeHoldTimer: number = 0;
    private readonly FORFEIT_HOLD_TIME = 1.5; // Seconds to hold escape to forfeit
    private forfeitBar: Graphics;

    // Bound handlers for GameEvents (for cleanup on destroy)
    private handleGameResume = () => {
        if (this.isPaused) this.lab?.note('pauseClose');
        this.isPaused = false;
        Input.discardPlay();
    };

    /**
     * Set only at /?lab=<scenario>: plays a catalogue scenario frame by frame
     * for the animation recorder. See src/lab/LabDriver.ts.
     */
    private readonly lab: LabController | null;
    /** Whether the lab advanced the engine this rendered frame. */
    private labStepped = false;
    /** Pieces spawned in this game (read by end-to-end tests). */
    private spawnCount = 0;

    constructor(roomId?: string, timeLimit: number = 0, seed?: number, opponentId?: string, lab?: LabController) {
        this.roomId = roomId;
        this.lab = lab ?? null;
        this.timeLimit = lab ? lab.timeLimit : timeLimit;
        this.seed = seed;
        this.opponentId = opponentId;

        console.log(`[GameScene] Initializing. Room: ${roomId}, Seed: ${seed}, Opponent: ${opponentId}`);
        if (roomId) {
            console.log(`[GameScene] Multiplayer mode. Replay recording ENABLED. tickFrame/recordInput will fire each frame.`);
        }

        // Visibility / AFK Handler
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        
        BGMManager.play('game');

        this.container = new Container();

        // Ambient field behind everything, not scaled with the game content.
        this.backdrop = new Backdrop(SceneManager.screenWidth, SceneManager.screenHeight);
        this.container.addChild(this.backdrop.container);

        // Game content wrapper - this single container holds ALL game elements
        // and gets scaled/centered as a unit for responsive design
        this.gameContentWrapper = new Container();
        this.container.addChild(this.gameContentWrapper);

        // Default empty board for opponent
        this.opponentBoard = new Board();

        this.stats = new StatPanel();
        this.board = new BoardView();
        this.nextQueue = new NextQueueView();
        this.gameContentWrapper.addChild(this.stats.container, this.board.container, this.nextQueue.container);

        if (roomId) {
            this.opponentBoardView = new BoardView({ effects: 'lite' });
            this.opponentBoardView.container.scale.set(OPPONENT_SCALE);
            this.opponentLabel = new Text({
                text: 'OPPONENT',
                resolution: 2,
                style: { fontFamily: FONTS.ui, fontSize: 13, fontWeight: '700', letterSpacing: 3, fill: getTheme().text.muted },
            });
            this.opponentLabel.anchor.set(0.5, 0);
            this.gameContentWrapper.addChild(this.opponentLabel, this.opponentBoardView.container);
        }

        this.uiContainer = new Container();
        this.gameContentWrapper.addChild(this.uiContainer);

        // Initialize Forfeit Bar (persistent)
        this.forfeitBar = new Graphics();
        this.uiContainer.addChild(this.forfeitBar);

        // Apply initial positioning (will be updated on resize)
        this.updateLayout();

        // Initialize Engine
        this.setupEngine();        // Initialize Engine
        this.setupEngine();

        // End-to-end tests (/?e2e=1) read game state through this handle to
        // plan moves and assert outcomes. Read-only by convention; absent
        // unless the URL asks for it. See tests/lab/record-multiplayer.mjs.
        if (new URLSearchParams(window.location.search).has('e2e')) {
            const scene = this;
            (window as unknown as { __puyoGame: unknown }).__puyoGame = {
                get engine() { return scene.engine; },
                /** Pieces spawned so far: lets a test act once per piece. */
                get spawns() { return scene.spawnCount; },
                get opponentBoard() { return scene.opponentBoard.grid; },
                get opponentGarbage() { return scene.opponentGarbage; },
                get roomId() { return scene.roomId; },
                get message() { return scene.gameMessage; },
            };
        }

        // Bind Engine Events for FX
        // Moved to setupEngine
        if (this.roomId) {
            const onGarbage = (data: any) => {
                try {
                    if (data && typeof data.amount === 'number') {
                        console.log("Received Garbage:", data.amount);
                        this.engine.addGarbage(data.amount);
                        this.board.callout(`+${data.amount} INCOMING`, { color: getTheme().state.danger, y: 70, size: 26 });
                        // V3.1 Replay: Record EXACT local frame when garbage was received
                        this.recordInputForReplay('G', data.amount);
                    }
                } catch (e) { console.error("Error processing garbage:", e); }
            };
            NetworkManager.on('receive_garbage', onGarbage);
            this.networkListeners.push({ event: 'receive_garbage', cb: onGarbage });

            // The opponent's board is SIMULATED locally from their input stream,
            // not reconstructed from relayed grids. Both engines share a seed and
            // the engine is deterministic, so replaying their inputs reproduces
            // their board exactly, at 60fps, for a fraction of the bandwidth.
            // See src/core/OpponentView.ts and docs/adr/0004-opponent-simulation.md.
            const onOpponentInput = (data: any) => {
                if (this.opponentId && data.playerId && data.playerId !== this.opponentId) return;
                if (!this.opponentView || typeof data?.f !== 'number') return;
                this.opponentView.receiveInput(data.f, data.i, data.a);
            };
            NetworkManager.on('opponent_input', onOpponentInput);
            this.networkListeners.push({ event: 'opponent_input', cb: onOpponentInput });

            // Board snapshots are now a low-rate safety net, not the mechanism.
            // The simulation should already agree; reconcile() only writes when
            // it does not, so the common case has no visual pop.
            const onBoard = (data: any) => {
                try {
                    if (this.opponentId && data.playerId && data.playerId !== this.opponentId) return;
                    if (data?.grid && this.opponentView) {
                        this.opponentView.reconcile(data.grid);
                    }
                    if (typeof data?.garbageTray === 'number') {
                        this.opponentGarbage = data.garbageTray;
                    }
                } catch (e) { console.error("Error reconciling opponent board:", e); }
            };
            NetworkManager.on('receive_board_state', onBoard);
            this.networkListeners.push({ event: 'receive_board_state', cb: onBoard });

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

            const onGameEnded = (data: any) => {
                // If game was explicitly aborted via server anticheat or timeout
                if (data.reason === 'aborted' || data.reason === 'timeout' || data.reason === 'admin_closed') {
                    console.log(`[GameScene] Match aborted by server. Reason: ${data.reason}`);
                    this.gameMessage = data.message || "GAME ABORTED";
                    this.engine.state = GameState.GAMEOVER;
                    // Emit game_over to freeze the overlay, with tie so no winner logic executes
                    GameEvents.emit('game_over', { score: this.engine.stats.score, message: this.gameMessage, result: 'tie' });
                }
            };
            NetworkManager.on('game_ended', onGameEnded);
            this.networkListeners.push({ event: 'game_ended', cb: onGameEnded });
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
            this.board.callout('RECONNECTING…', { color: getTheme().state.warning, size: 28, frames: 120 });

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
                this.board.callout('RECONNECTING…', { color: getTheme().state.warning, size: 28, frames: 90 });

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
                this.board.callout('RECONNECTED', { color: getTheme().state.success, size: 28 });
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
                    this.board.callout('ROOM EXPIRED', { color: getTheme().state.danger, size: 28, frames: 120 });
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


    }

    setupEngine() {
        {
            this.engine = new GameEngine(this.seed);

            if (this.roomId) {
                NetworkManager.recordSettings(this.roomId, SettingsManager.sdf, SettingsManager.softDropProtection);
                // Both players share a seed, so the opponent's board can be
                // reconstructed locally from the inputs the server relays.
                this.opponentView?.dispose();
                this.opponentView = new OpponentView(this.seed ?? 0);
                this.opponentFrame = engineFrame(this.opponentView.simulation);
                this.opponentBoardView?.reset();
            }
        }

        this.boardFrame = engineFrame(this.engine);
        this.board.reset();
        this.handling.reset();
        Input.discardPlay();
        this.gameMessage = "";
        this.elapsedTime = 0;
        this.accumulator = 0;

        // The engine reports audible moments; the scene decides what they sound
        // like. Replay playback and the opponent view simply do not wire this,
        // which is why neither needs a "suppress audio" flag.
        this.engine.onSound = (sound, value) => {
            switch (sound) {
                case 'chain':        SoundManager.playCombo(value ?? 1); break;
                case 'garbageLand':  SoundManager.play('tinygarbage');   break;
                case 'garbageSmall': SoundManager.play('tinygarbage');   break;
                case 'garbageLarge': SoundManager.play('hugegarbage');   break;
            }
        };

        // Landings, pops, chain callouts and the spawn animation are drawn by
        // BoardView from the engine's state, so the scene only adds what the
        // board cannot know: sound, network messages and the backdrop.
        this.engine.onPieceSpawn = () => {
            this.spawnCount++;
        };

        this.engine.onChainStep = (chain) => {
            if (chain >= 3) this.backdrop.pulse(0.15 + chain * 0.08);
        };

        this.engine.onStateChange = (state) => {
            if (state === GameState.POP_ANIM) {
                SoundManager.play('pop');
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
                this.board.callout(`ATTACK +${amount}`, { color: getTheme().accent.primary, y: 150, size: 28 });
            }

            if (this.roomId) {
                NetworkManager.sendGarbage(this.roomId, amount);
            }
        };

        this.engine.onGarbageOffset = (amount) => {
            if (amount > 0 && this.roomId) {
                this.board.callout(`OFFSET −${amount}`, { color: getTheme().state.success, y: 210, size: 26 });
            }
        };

        // Board snapshots are no longer how the opponent sees us -- they see a
        // local simulation of our input stream (see OpponentView). What remains
        // is a low-rate safety net: it feeds the server's AFK heartbeat and
        // lets the opponent detect drift if inputs are ever lost.
        //
        // Firing on every board change was pointless: the server caps this
        // event at 10/s and silently drops the rest, so most packets were
        // discarded. Throttling here makes the real rate intentional.
        this.engine.onBoardChange = () => {
            if (!this.roomId) return;
            const now = performance.now();
            if (now - this.lastBoardSendMs < GameScene.BOARD_SYNC_INTERVAL_MS) return;
            this.lastBoardSendMs = now;
            NetworkManager.sendBoardState(this.roomId, this.engine.board.getSerializedData(), pendingGarbage(this.engine));
        };

        this.engine.onHardDrop = () => {
            this.board.shake(5);
        };

        this.engine.onAllClear = () => {
            this.board.callout('ALL CLEAR', { color: getTheme().state.warning, size: 46, frames: 96 });
            this.board.shake(8);
            this.backdrop.pulse(0.9);
        };

        // Send initial state
        if (this.roomId) {
            this.engine.onBoardChange?.();
        }

        // The lab wraps the hooks set above rather than replacing them, so the
        // scene renders exactly as it does in real play.
        this.lab?.attach(this.engine);
    }

    // Responsive layout positioning - centers game content on screen
    updateLayout() {
        const screenW = SceneManager.screenWidth;
        const screenH = SceneManager.screenHeight;
        const baseW = SceneManager.BASE_WIDTH;
        const baseH = SceneManager.BASE_HEIGHT;

        // Scale to fit while maintaining aspect ratio, and centre.
        const scale = Math.min(screenW / baseW, screenH / baseH);
        this.gameContentWrapper.position.set(Math.round((screenW - baseW * scale) / 2), Math.round((screenH - baseH * scale) / 2));
        this.gameContentWrapper.scale.set(scale);

        // Stats | board | queue, with the opponent under the queue.
        const rightX = BOARD_LEFT + BoardView.WIDTH + SIDE_GAP;
        this.board.container.position.set(BOARD_LEFT, BOARD_TOP);
        this.stats.container.position.set(BOARD_LEFT - SIDE_GAP - StatPanel.WIDTH, BOARD_TOP);
        this.nextQueue.container.position.set(rightX, BOARD_TOP);
        if (this.opponentBoardView) {
            const w = BoardView.WIDTH * OPPONENT_SCALE;
            const x = rightX + (NextQueueView.WIDTH - w) / 2;
            const y = BOARD_TOP + NextQueueView.HEIGHT + 96;
            this.opponentBoardView.container.position.set(x, y);
            this.opponentLabel?.position.set(x + w / 2, y - 76);
        }

        this.backdrop.resize(screenW, screenH);
    }

    // Called by SceneManager when window resizes
    onResize(_width: number, _height: number) {
        this.updateLayout();
    }

    // Toggle Pause (Single Player)
    togglePause() {
        if (this.roomId) return; // Cannot pause MP

        this.isPaused = !this.isPaused;
        this.lab?.note(this.isPaused ? 'pauseOpen' : 'pauseClose');
        if (this.isPaused) {
            GameEvents.emit('game_pause', { timeLimit: this.timeLimit });
            SoundManager.play('menu_select');
        } else {
            GameEvents.emit('game_resume');
            SoundManager.play('menu_back');
            Input.discardPlay(); // keys pressed while paused do not act on resume
        }
    }

    // V3.1 Replay: Record input for server-side replay in multiplayer with exact frame
    private recordInputForReplay(inputType: string, amount?: number): void {
        if (this.roomId) {
            // Only record in multiplayer matches, not replays
            NetworkManager.recordInput(this.roomId, inputType, this.engine.currentFrame, amount);
        }
    }

    update(delta: number): void {
        if (this.container.destroyed) return;

        // In the lab, one rendered frame is exactly one logical frame, and
        // everything freezes while the recorder captures a keyframe.
        if (this.lab) {
            this.lab.beginFrame();
            delta = this.lab.running ? 1 : 0;
        }
        this.labStepped = false;

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
                // Handling settings are read from the engine's own config, so
                // keep it in step with the player's preferences -- they can be
                // changed mid-match from the pause overlay.
                this.engine.config.sdf = SettingsManager.sdf;
                this.engine.config.softDropProtection = SettingsManager.softDropProtection;

                const prevState = this.engine.state;

                // normalize delta:
                // Pixi delta is roughly 1.0 at 60fps.
                // engine.dt expects 1.0 = normal speed.

                if (this.roomId) {
                    // MULTIPLAYER: drive the engine from the SHARED match clock.
                    //
                    // A local accumulator kept each client on its own timeline:
                    // frame N happened at a different instant on each machine,
                    // offset by network jitter and any tab stall. Cross-player
                    // alignment was therefore approximate live, and replays --
                    // which advance both engines in lockstep by frame index --
                    // were reproducing a timeline that never existed.
                    //
                    // Deriving the frame from a clock both clients agree on
                    // makes frame N the same moment everywhere, which fixes
                    // live alignment and makes lockstep replay correct by
                    // construction. The replay format is unchanged.
                    // See docs/adr/0003-shared-match-clock.md.
                    if (MatchClock.hasMatch) {
                        const toAdvance = MatchClock.framesToAdvance(this.engine.currentFrame);
                        for (let i = 0; i < toAdvance; i++) {
                            this.stepFrame();
                        }

                        // Falling far behind means this client can no longer
                        // present an honest view. Surface it rather than
                        // silently drifting; the server heartbeat aborts at 7s.
                        if (!this.hasErrorText && MatchClock.isDesynced(this.engine.currentFrame)) {
                            this.gameMessage = 'RECONNECTING…';
                        }
                    } else {
                        // Clock not yet established (host-started room where the
                        // start instant has not landed). Hold at frame 0 rather
                        // than starting on a private timeline.
                    }
                } else if (this.lab) {
                    // LAB: the driver steps exactly one frame and applies the
                    // scenario's inputs for it. Keyboard-driven scenarios then
                    // go through the real input path, like a player.
                    this.labStepped = this.lab.stepFrame(this.engine);
                    if (this.labStepped && this.lab.drivesKeyboard) this.applyInput();
                } else {
                    // SINGLE PLAYER: accumulate real time and step the engine
                    // once per logical frame. The engine takes no delta, so
                    // wall-clock pacing lives here rather than inside it.
                    this.singlePlayerAccumulator += delta;
                    let steps = 0;
                    while (this.singlePlayerAccumulator >= 1 && steps < GameScene.MAX_CATCHUP_STEPS) {
                        this.singlePlayerAccumulator -= 1;
                        this.stepFrame();
                        steps++;
                    }
                    // Drop any backlog beyond the clamp: after a long stall,
                    // replaying it would fast-forward the game past the player.
                    if (this.singlePlayerAccumulator > GameScene.MAX_CATCHUP_STEPS) {
                        this.singlePlayerAccumulator = 0;
                    }
                }

                // Log state transitions
                if (prevState !== this.engine.state) {
                    console.log(`⏩ [STATE] Frame ${this.engine.currentFrame}: ${prevState} → ${this.engine.state}`);

                    // Shake on garbage fall, on a log scale of the amount (at most 30 a turn).
                    if (this.engine.state === GameState.GARBAGE_FALL) {
                        const amount = Math.min(this.engine.garbageQueue, 30);
                        this.board.shake(Math.log(amount + 1) * 5);
                        SoundManager.play('drop');
                    }
                }

                // INVARIANT: the engine advances only in stepFrame() (or the
                // lab's step), once per logical frame, and input is applied
                // right after each step. An earlier version called update() a
                // second time per rendered frame, so the game ran at twice
                // its intended rate and replays never matched
                // (docs/adr/0001-fixed-timestep.md).

                // Advance the opponent's simulation. Its board view reads the
                // simulation directly; the mirrored fields serve the e2e hook.
                if (this.opponentView) {
                    this.opponentView.update();
                    this.opponentBoard.grid = this.opponentView.board.grid;
                    this.opponentGarbage = pendingGarbage(this.opponentView);
                }

                // Update timer
                if (this.timeLimit > 0 && (this.engine.state as number) !== GameState.GAMEOVER) {
                    this.accumulator += delta / 60;
                    while (this.accumulator >= 1.0) {
                        this.accumulator -= 1.0;
                        this.elapsedTime++;
                        if (this.elapsedTime >= this.timeLimit) {
                            // Through changeState like every other ending, so
                            // the state hook fires once and emits the results
                            // (ENG-07). The message set first is kept.
                            this.gameMessage = "TIME'S UP!";
                            this.lab?.note('timeUp');
                            this.engine.changeState(GameState.GAMEOVER);
                            break;
                        }
                    }
                }
            }

            this.renderViews(delta);
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

    /**
     * One logical frame: advance the engine, then apply the player's input
     * for it. Input after the step, stamped with the frame just simulated, is
     * the order the replay, the opponent's view and the server all assume.
     */
    private stepFrame(): void {
        this.engine.update();
        this.applyInput();
    }

    private applyInput(): void {
        if (this.engine.state === GameState.GAMEOVER) return;
        // V3.1 Replay: periodic client state hashes for the server to check.
        if (this.roomId && this.engine.currentFrame > 0 && this.engine.currentFrame % 300 === 0) {
            NetworkManager.recordHash(this.roomId, this.engine.currentFrame, this.engine.computeBoardHash());
        }
        this.handling.frame(this.engine, Input.consumePlay(), SettingsManager, this.handlingHooks);
    }

    /** Draw every view for this frame, advancing their animations by `dt` frames. */
    private renderViews(dt: number): void {
        this.board.render(this.boardFrame, dt);
        this.nextQueue.render(this.engine.nextPieces, dt, this.board.spawnedThisFrame);
        this.stats.set(this.statRows());
        if (this.opponentBoardView && this.opponentFrame) this.opponentBoardView.render(this.opponentFrame, dt);
        this.backdrop.update(dt);
    }

    private statRows(): StatRow[] {
        const s = this.engine.stats;
        if (s.score !== this.scoreShown) {
            this.scoreShown = s.score;
            this.scoreText = s.score.toLocaleString('en-US');
        }
        const rows: StatRow[] = [
            { label: 'SCORE', value: this.scoreText },
            { label: 'MAX CHAIN', value: s.maxChain, tone: s.maxChain >= 2 ? 'accent' : 'normal' },
            { label: 'CLEARED', value: s.puyosCleared },
        ];
        if (this.timeLimit > 0) {
            const remaining = Math.max(0, this.timeLimit - this.elapsedTime);
            const m = Math.floor(remaining / 60);
            const sec = Math.floor(remaining % 60);
            rows.push({ label: 'TIME', value: `${m}:${sec.toString().padStart(2, '0')}`, tone: remaining < 30 ? 'danger' : 'warning' });
        }
        return rows;
    }

    destroy(): void {
        this.opponentView?.dispose();
        this.opponentView = null;

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
