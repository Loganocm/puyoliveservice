import { Container, Graphics, Sprite, Text, TextStyle, Texture, Assets } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { ReplayEngine, type ReplayFile } from '../core/ReplayEngine';
import type { BoardSnapshot } from '../core/ReplaySimulator';
import { COLS, TOTAL_ROWS, HIDDEN_ROWS, PuyoColor } from '../core/Constants';
import { CELL_SIZE, PUYO_COLORS } from '../core/RenderConstants';
import { GameState } from '../core/GameEngine';
import { ResourceManager } from '../core/ResourceManager';
import { GameEvents } from '../core/GameEvents';
import { backgroundManager } from '../core/BackgroundManager';
import { SoundManager } from '../core/SoundManager';
import { BGMManager } from '../core/BGMManager';

const VISIBLE_ROWS = TOTAL_ROWS - HIDDEN_ROWS;

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

/** Per-board animation state tracked by the scene */
interface BoardAnimState {
    landingAnims: Map<number, { t: number, gcx: number, gcy: number }>;
    spawnAnim: number;
    popAnimProgress: number;
    particles: Particle[];
    trackedTexts: TrackedText[];
    prevState: typeof GameState[keyof typeof GameState];
    hadActivePiece: boolean;
}

/**
 * ReplayScene — Snapshot-based replay viewer with dual-board layout.
 *
 * Renders from pre-computed FrameSnapshot[] arrays (no live GameEngine).
 * Seeking is instant. Memory is freed on destroy().
 */
export class ReplayScene implements IScene {
    container: Container;
    private replayEngine: ReplayEngine;

    // Background
    private staticBg: Sprite;

    // Per-board rendering containers
    private boardContainers: [Container, Container];
    private boardPuyoContainers: [Container, Container];
    // @ts-ignore - retained for container hierarchy (particle graphics are children)
    private boardEffectContainers: [Container, Container];
    private boardParticleGraphics: [Graphics, Graphics];
    private boardDamageGraphics: [Graphics, Graphics];
    private boardScoreTexts: [Text, Text];
    private boardChainTexts: [Text, Text];
    private boardNextGraphics: [Graphics, Graphics];

    // Per-board animation state
    private animStates: [BoardAnimState, BoardAnimState];

    // UI Elements
    private player1Label: Text;
    private player2Label: Text;
    private pauseIndicator: Text;
    private winnerOverlay: Text | null = null;

    // Layout
    private boardWidth: number;
    private boardHeight: number;
    private board1X: number;
    private board2X: number;
    private boardY: number;

    constructor(replayData: ReplayFile) {
        this.container = new Container();
        BGMManager.play('game');
        this.replayEngine = new ReplayEngine(replayData);

        // --- Background ---
        this.staticBg = new Sprite();
        this.staticBg.anchor.set(0.5);
        this.staticBg.position.set(window.innerWidth / 2, window.innerHeight / 2);
        this.container.addChild(this.staticBg);

        // Prepare a fresh background for replay
        backgroundManager.prepareGameBackground();
        const bgUrl = backgroundManager.getGameBackground();
        if (bgUrl) {
            Assets.load(bgUrl).then((texture) => {
                if (this.staticBg && !this.staticBg.destroyed) {
                    this.staticBg.texture = texture;
                    this.staticBg.tint = 0xffffff; // Reset tint in case fallback set it
                    this.resizeBackground();
                }
            }).catch(() => {});
        }

        // --- Layout ---
        this.boardWidth = COLS * CELL_SIZE;
        this.boardHeight = VISIBLE_ROWS * CELL_SIZE;
        
        // A player's area is the board + next queue column
        const queueColumnWidth = 80; // Width for next piece queue
        const playerAreaWidth = this.boardWidth + queueColumnWidth + 20; 
        const spacing = 40; // Gap between the two player areas
        const totalWidth = playerAreaWidth * 2 + spacing;
        
        // Center horizontally
        this.board1X = (window.innerWidth - totalWidth) / 2;
        this.board2X = this.board1X + playerAreaWidth + spacing;
        // Center vertically between header (60px) and footer controls (~160px)
        const headerSpace = 60;
        const footerSpace = 160;
        const availableH = window.innerHeight - headerSpace - footerSpace;
        this.boardY = headerSpace + Math.max(0, (availableH - this.boardHeight) / 2);

        // --- Build per-board containers ---
        const buildBoard = (x: number) => {
            const cont = new Container();
            cont.x = x;
            cont.y = this.boardY;
            this.container.addChild(cont);

            const bg = new Graphics();
            cont.addChild(bg);

            const damage = new Graphics();
            cont.addChild(damage);

            const puyos = new Container();
            cont.addChild(puyos);

            const fx = new Container();
            cont.addChild(fx);

            const particles = new Graphics();
            fx.addChild(particles);

            const scoreText = new Text({
                text: '0',
                style: new TextStyle({ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 'bold', fill: '#ffffff' }),
            });
            scoreText.anchor.set(0.5, 0);
            scoreText.x = this.boardWidth / 2;
            scoreText.y = this.boardHeight + 4;
            cont.addChild(scoreText);

            const chainText = new Text({
                text: '',
                style: new TextStyle({ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fill: '#ffaa00' }),
            });
            chainText.anchor.set(0.5, 0);
            chainText.x = this.boardWidth / 2;
            chainText.y = this.boardHeight + 26;
            chainText.visible = false;
            cont.addChild(chainText);

            // NEXT label
            const nextLabel = new Text({
                text: 'NEXT',
                style: new TextStyle({ fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 'bold', fill: '#aaaaaa' }),
            });
            nextLabel.anchor.set(0.5, 0);
            nextLabel.x = this.boardWidth + 50;
            nextLabel.y = -5;
            cont.addChild(nextLabel);

            // Next queue graphics (persistent, redrawn each frame)
            const nextGfx = new Graphics();
            cont.addChild(nextGfx);

            return { cont, bg, puyos, fx, particles, damage, scoreText, chainText, nextLabel, nextGfx };
        };

        const b1 = buildBoard(this.board1X);
        const b2 = buildBoard(this.board2X);

        this.boardContainers = [b1.cont, b2.cont];
        this.boardPuyoContainers = [b1.puyos, b2.puyos];
        this.boardEffectContainers = [b1.fx, b2.fx];
        this.boardParticleGraphics = [b1.particles, b2.particles];
        this.boardDamageGraphics = [b1.damage, b2.damage];
        this.boardScoreTexts = [b1.scoreText, b2.scoreText];
        this.boardChainTexts = [b1.chainText, b2.chainText];
        this.boardNextGraphics = [b1.nextGfx, b2.nextGfx];

        // Draw static backgrounds
        this.drawBoardBackground(b1.bg);
        this.drawBoardBackground(b2.bg);

        // --- Animation state ---
        const makeAnimState = (): BoardAnimState => ({
            landingAnims: new Map(),
            spawnAnim: -1,
            popAnimProgress: 0,
            particles: [],
            trackedTexts: [],
            prevState: GameState.SPAWN,
            hadActivePiece: false,
        });
        this.animStates = [makeAnimState(), makeAnimState()];

        // --- Labels ---
        const players = this.replayEngine.players;
        const labelStyle = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 24,
            fontWeight: 'bold',
            fill: '#ffffff',
            align: 'center',
        });

        this.player1Label = new Text({ text: players[0]?.username || 'Player 1', style: labelStyle });
        this.player1Label.anchor.set(0.5, 0);
        this.player1Label.x = this.board1X + this.boardWidth / 2;
        this.player1Label.y = this.boardY - 45;
        this.container.addChild(this.player1Label);

        this.player2Label = new Text({ text: players[1]?.username || 'Player 2', style: labelStyle });
        this.player2Label.anchor.set(0.5, 0);
        this.player2Label.x = this.board2X + this.boardWidth / 2;
        this.player2Label.y = this.boardY - 45;
        this.container.addChild(this.player2Label);

        // Time Label Removed (UI handles this natively)

        // Pause indicator
        const pauseStyle = new TextStyle({ fontFamily: 'Orbitron, sans-serif', fontSize: 48, fontWeight: 'bold', fill: '#ff4d00' });
        this.pauseIndicator = new Text({ text: 'PAUSED', style: pauseStyle });
        this.pauseIndicator.anchor.set(0.5);
        this.pauseIndicator.x = window.innerWidth / 2;
        this.pauseIndicator.y = window.innerHeight / 2;
        this.pauseIndicator.visible = false;
        this.container.addChild(this.pauseIndicator);

        // --- Callbacks ---
        this.replayEngine.onFrameUpdate = (current, total) => {
            GameEvents.emit('replay_update', {
                currentFrame: current,
                totalFrames: total,
                isPaused: this.replayEngine.isPaused,
                speed: this.replayEngine.playbackSpeed,
                isLoaded: this.replayEngine.isLoaded,
            });
        };

        this.replayEngine.onGameOver = (winnerIndex) => {
            this.showGameOverOverlay(winnerIndex);
        };

        this.replayEngine.onLoaded = () => {
            // Emit initial state for the React overlay
            GameEvents.emit('replay_loaded', {});
            this.emitReplayState();
        };

        // --- Pre-simulate the replay ---
        // This runs synchronously (~50-200ms) and produces all frame snapshots.
        // It's wrapped in a try/catch because corrupted replays can crash the simulator.
        try {
            this.replayEngine.load();
        } catch (error) {
            console.error("[ReplayScene] FATAL REPLAY LOAD ERROR:", error);
            // Re-throw so the UI component can potentially catch it, or just let it halt safely.
            throw error;
        }

        // React UI controls
        GameEvents.on('replay_control', this.handleReplayControl);
    }

    // ─── Layout helpers ───
    private resizeBackground(): void {
        if (!this.staticBg.texture || this.staticBg.texture === Texture.WHITE) return;
        const tex = this.staticBg.texture;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        this.staticBg.position.set(screenW / 2, screenH / 2);
        const bgRatio = tex.width / tex.height;
        const screenRatio = screenW / screenH;
        if (screenRatio > bgRatio) {
            this.staticBg.width = screenW;
            this.staticBg.height = screenW / bgRatio;
        } else {
            this.staticBg.height = screenH;
            this.staticBg.width = screenH * bgRatio;
        }
        this.staticBg.alpha = 0.4;
    }

    // ─── Replay Controls ───

    private emitReplayState(): void {
        GameEvents.emit('replay_update', {
            currentFrame: this.replayEngine.frame,
            totalFrames: this.replayEngine.totalFrames,
            isPaused: this.replayEngine.isPaused,
            speed: this.replayEngine.playbackSpeed,
            isLoaded: this.replayEngine.isLoaded,
        });
    }

    private handleReplayControl = (cmd: { action: string; value?: number }) => {
        switch (cmd.action) {
            case 'play':
                this.replayEngine.resume();
                this.pauseIndicator.visible = false;
                break;
            case 'pause':
                this.replayEngine.pause();
                this.pauseIndicator.visible = true;
                break;
            case 'seek':
                if (cmd.value !== undefined) {
                    // Instant seek — just changes array index, no engine rebuild
                    this.replayEngine.seekToFrame(cmd.value);

                    // Reset animation state for clean visuals at new position
                    for (const anim of this.animStates) {
                        for (const tt of anim.trackedTexts) {
                            if (!tt.pixiText.destroyed) tt.pixiText.destroy();
                        }
                        anim.landingAnims.clear();
                        anim.spawnAnim = -1;
                        anim.popAnimProgress = 0;
                        anim.particles = [];
                        anim.trackedTexts = [];
                    }
                    this.boardParticleGraphics[0].clear();
                    this.boardParticleGraphics[1].clear();

                    // Remove winner overlay on seek
                    GameEvents.emit('replay_match_result_clear', {});
                }
                break;
            case 'speed':
                if (cmd.value !== undefined) this.replayEngine.setSpeed(cmd.value);
                break;
            case 'exit':
                // Cleanup handled by App-level onExit → destroy()
                break;
        }
        this.emitReplayState();
    };

    // ─── Static board background ───
    private drawBoardBackground(g: Graphics): void {
        g.rect(0, 0, this.boardWidth, this.boardHeight);
        g.fill({ color: 0x000000, alpha: 0.75 });
        g.stroke({ color: 0xffffff, width: 4, alpha: 1.0 });
    }

    // ─── Puyo sprite helper ───
    private addPuyoSprite(
        puyoContainer: Container,
        anim: BoardAnimState,
        c: number,
        r: number,
        color: PuyoColor,
        connections: number,
        alpha: number = 1.0,
        scale: number = 1.0,
    ): void {
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
        const key = Math.round(c) * 100 + Math.round(r);
        const jiggle = anim.landingAnims.get(key);
        if (jiggle) {
            const amp = (1 - jiggle.t) * 0.18;
            const wave = Math.sin(jiggle.t * Math.PI * 3);
            const scaleX = 1 + amp * wave;
            const scaleY = 1 - amp * wave;
            sprite.width = baseW * scaleX;
            sprite.height = baseH * scaleY;
            const sx = sprite.x;
            const sy = sprite.y;
            sprite.x = jiggle.gcx + (sx - jiggle.gcx) * scaleX;
            sprite.y = jiggle.gcy + (sy - jiggle.gcy) * scaleY + (baseH * (1 - scaleY)) * 0.25;
        } else {
            sprite.width = baseW;
            sprite.height = baseH;
        }

        puyoContainer.addChild(sprite);
    }

    private checkGrid(grid: number[][], c: number, r: number, color: PuyoColor): boolean {
        if (c < 0 || c >= COLS || r < 0 || r >= TOTAL_ROWS) return false;
        return grid[c][r] === color;
    }

    /** Damage meter: garbage queue bar on the left side of each board */
    private drawDamageMeter(idx: 0 | 1, board: BoardSnapshot): void {
        const g = this.boardDamageGraphics[idx];
        g.clear();

        const totalPoints = board.garbageQueue + board.nuisanceTray;
        const totalRocks = Math.floor(totalPoints / 70);
        if (totalRocks <= 0) return;

        const barW = 12;
        const barX = -barW - 6;
        const barY = 0;
        const barH = this.boardHeight;

        const maxRocks = 24;
        const fillPct = Math.min(totalRocks / maxRocks, 1.0);
        const fillH = barH * fillPct;

        g.rect(barX, barY, barW, barH);
        g.fill({ color: 0x220000, alpha: 0.6 });
        g.stroke({ color: 0x550000, width: 1 });

        const color = totalRocks > 39 ? 0xff0000 : 0xff4400;
        g.rect(barX, barY + barH - fillH, barW, fillH);
        g.fill({ color, alpha: 0.9 });
    }

    // ─── Full board render from snapshot ───
    private renderBoard(idx: 0 | 1, board: BoardSnapshot, delta: number): void {
        const anim = this.animStates[idx];
        const puyoContainer = this.boardPuyoContainers[idx];
        const grid = board.grid;

        // Clear prior sprites
        const children = puyoContainer.removeChildren();
        for (const child of children) child.destroy();

        // --- Detect state transitions for animations ---
        if (anim.prevState !== board.state) {
            // Pop animation trigger
            if (board.state === GameState.POP_ANIM && board.matchedPuyos.length > 0) {
                SoundManager.play('pop');
                this.spawnParticlesFromSnapshot(idx, board);
                anim.popAnimProgress = 0;
            }

            // Garbage fall shake
            if (board.state === GameState.GARBAGE_FALL) {
                SoundManager.play('drop');
            }

            anim.prevState = board.state;
        }

        // Detect piece spawn (had no piece → now has piece)
        if (board.activePiece && !anim.hadActivePiece) {
            anim.spawnAnim = 0;
        }
        anim.hadActivePiece = !!board.activePiece;

        // --- Build falling lookup ---
        const fallingLookup = new Map<number, number>();
        let fallingProgress = 0;
        if (board.state === GameState.FALLING && board.fallingDestinations.length > 0) {
            // Approximate chain-scaled delay using chainCount
            const baseDuration = 10; // FALL_STEP_DELAY
            const chainCount = board.chainCount;
            const scaledDelay = chainCount <= 1
                ? baseDuration * 2
                : Math.floor(baseDuration * (1 + 0.3 * Math.pow(1.3, chainCount - 1)));
            fallingProgress = Math.min(1, board.stateTimer / scaledDelay);
            fallingProgress = fallingProgress * fallingProgress; // ease-in
            for (const f of board.fallingDestinations) {
                fallingLookup.set(f.c * 100 + f.r, f.destR);
            }
        }

        // --- Build popping set ---
        const poppingSet = new Set<number>();
        if (board.state === GameState.POP_ANIM && board.matchedPuyos.length > 0) {
            for (const group of board.matchedPuyos) {
                for (const p of group) {
                    poppingSet.add(p.c * 100 + p.r);
                }
            }
        }

        // Pop animation progress
        if (board.state === GameState.POP_ANIM) {
            const baseDuration = 18; // POP_ANIM_DURATION
            const chainCount = board.chainCount;
            const scaledDuration = chainCount <= 1
                ? baseDuration * 2
                : Math.floor(baseDuration * (1 + 0.3 * Math.pow(1.3, chainCount - 1)));
            anim.popAnimProgress = Math.min(1, board.stateTimer / scaledDuration);
        }

        // --- Draw board puyos ---
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                const color = grid[c][r] as PuyoColor;
                if (color === PuyoColor.None) continue;

                let connections = 0;
                if (color !== PuyoColor.Garbage) {
                    if (this.checkGrid(grid, c, r - 1, color)) connections |= 1;
                    if (this.checkGrid(grid, c + 1, r, color)) connections |= 2;
                    if (this.checkGrid(grid, c, r + 1, color)) connections |= 4;
                    if (this.checkGrid(grid, c - 1, r, color)) connections |= 8;
                }

                const key = c * 100 + r;

                // Pop animation
                if (poppingSet.has(key)) {
                    const popT = anim.popAnimProgress;
                    const flash = Math.sin(popT * Math.PI * 6) * 0.3 + 0.7;
                    const shrink = popT < 0.6 ? 1.0 : 1.0 - ((popT - 0.6) / 0.4);
                    this.addPuyoSprite(puyoContainer, anim, c, r, color, connections, flash, shrink);
                    continue;
                }

                // Gravity interpolation
                const destR = fallingLookup.get(key);
                if (destR !== undefined) {
                    const visualR = r + (destR - r) * fallingProgress;
                    this.addPuyoSprite(puyoContainer, anim, c, visualR, color, connections);
                    continue;
                }

                this.addPuyoSprite(puyoContainer, anim, c, r, color, connections);
            }
        }

        // --- Falling garbage animation ---
        if (board.fallingGarbage && board.fallingGarbage.length > 0) {
            for (const garb of board.fallingGarbage) {
                if (garb.delay <= 10) {
                    this.addPuyoSprite(puyoContainer, anim, garb.c, garb.r, PuyoColor.Garbage, 0);
                }
            }
        }

        // --- Active piece ---
        const piece = board.activePiece;
        if (piece) {
            const { x, y, rot, mainColor, subColor } = piece;

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

            const spawnScale = anim.spawnAnim >= 0 ? 0.5 + anim.spawnAnim * 0.5 : 1.0;
            const spawnAlpha = anim.spawnAnim >= 0 ? anim.spawnAnim : 1.0;

            this.addPuyoSprite(puyoContainer, anim, x, y, mainColor, mainConn, spawnAlpha, spawnScale);
            this.addPuyoSprite(puyoContainer, anim, x + sx, y + sy, subColor, subConn, spawnAlpha, spawnScale);

            // --- Ghost piece ---
            let gY = y;
            const canPlace = (cx: number, cy: number, cr: number): boolean => {
                if (cy >= TOTAL_ROWS || cx < 0 || cx >= COLS) return false;
                if (cy >= 0 && grid[cx][cy] !== PuyoColor.None) return false;
                const subX = cx + offsets[cr].x;
                const subY = cy + offsets[cr].y;
                if (subY >= TOTAL_ROWS || subX < 0 || subX >= COLS) return false;
                if (subY >= 0 && grid[subX][subY] !== PuyoColor.None) return false;
                return true;
            };
            while (canPlace(x, gY + 1, rot)) gY++;

            if (gY !== y) {
                this.addPuyoSprite(puyoContainer, anim, x, gY, mainColor, mainConn, 0.3);
                this.addPuyoSprite(puyoContainer, anim, x + sx, gY + sy, subColor, subConn, 0.3);
            }
        }

        // --- Next piece preview (vertical layout like actual game) ---
        const nextGfx = this.boardNextGraphics[idx];
        nextGfx.clear();
        const queueCenterX = this.boardWidth + 50;
        let nextY = 12; // Starting Y for first piece

        for (let i = 0; i < Math.min(board.nextPieces.length, 2); i++) {
            const next = board.nextPieces[i];
            let displaySize: number;

            if (i === 0) {
                // Primary next piece — larger, with box frame
                displaySize = 32;
                const boxW = 50;
                const boxH = displaySize * 2 + 12;
                nextGfx.rect(queueCenterX - boxW / 2, nextY - 4, boxW, boxH);
                nextGfx.fill({ color: 0x000000, alpha: 0.3 });
                nextGfx.stroke({ color: 0xFF5733, width: 2 });
            } else {
                // Secondary next piece — smaller
                displaySize = 24;
                nextY += 8; // Extra gap between pieces
            }

            // Sub puyo (top)
            this.addPuyoSprite(puyoContainer, anim, 0, HIDDEN_ROWS, next.sub, 0);
            const subSpr = puyoContainer.children[puyoContainer.children.length - 1] as Sprite;
            subSpr.x = queueCenterX;
            subSpr.y = nextY + displaySize / 2;
            subSpr.width = displaySize;
            subSpr.height = displaySize;

            // Main puyo (bottom)
            this.addPuyoSprite(puyoContainer, anim, 0, HIDDEN_ROWS, next.main, 0);
            const mainSpr = puyoContainer.children[puyoContainer.children.length - 1] as Sprite;
            mainSpr.x = queueCenterX;
            mainSpr.y = nextY + displaySize / 2 + displaySize + 4;
            mainSpr.width = displaySize;
            mainSpr.height = displaySize;

            nextY += displaySize * 2 + 12;
        }

        // --- Score & chain text ---
        this.boardScoreTexts[idx].text = `${board.score}`;

        if (board.maxChain > 1) {
            this.boardChainTexts[idx].text = `${board.maxChain} chain`;
            this.boardChainTexts[idx].visible = true;
        } else {
            this.boardChainTexts[idx].visible = false;
        }

        // --- Damage meter ---
        this.drawDamageMeter(idx, board);

        // --- Tick animations ---
        const speed = delta / 12;
        for (const [key, a] of anim.landingAnims) {
            const next = a.t + speed;
            if (next >= 1) anim.landingAnims.delete(key);
            else a.t = next;
        }

        if (anim.spawnAnim >= 0 && anim.spawnAnim < 1) {
            anim.spawnAnim += delta / 8;
            if (anim.spawnAnim >= 1) anim.spawnAnim = -1;
        }
    }

    // ─── Effects ───
    private spawnParticlesFromSnapshot(idx: 0 | 1, board: BoardSnapshot): void {
        const anim = this.animStates[idx];
        for (const group of board.matchedPuyos) {
            if (group.length === 0) continue;
            let tx = 0, ty = 0;
            for (const p of group) {
                tx += p.c * CELL_SIZE + CELL_SIZE / 2;
                ty += (p.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
            }
            const cx = tx / group.length;
            const cy = ty / group.length;

            const firstColor = board.grid[group[0].c][group[0].r];
            const colorVal = firstColor >= 0 && firstColor < PUYO_COLORS.length ? PUYO_COLORS[firstColor] : 0xFFFFFF;

            for (let i = 0; i < group.length * 4; i++) {
                anim.particles.push({
                    x: cx, y: cy,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    color: colorVal,
                    life: 1.0,
                    maxLife: 1.0 + Math.random() * 0.5,
                });
            }
        }
    }

    private updateEffects(delta: number): void {
        const dtSec = delta / 60;

        for (let idx = 0; idx < 2; idx++) {
            const anim = this.animStates[idx as 0 | 1];
            const gfx = this.boardParticleGraphics[idx as 0 | 1];
            gfx.clear();

            // Particles
            for (let i = anim.particles.length - 1; i >= 0; i--) {
                const p = anim.particles[i];
                p.x += p.vx * dtSec * 60;
                p.y += p.vy * dtSec * 60;
                p.vy += 400 * dtSec;
                p.life -= dtSec * 2;
                if (p.life <= 0) {
                    anim.particles.splice(i, 1);
                    continue;
                }
                const alpha = Math.max(0, p.life / p.maxLife);
                const size = 3 + alpha * 3;
                gfx.circle(p.x, p.y, size);
                gfx.fill({ color: p.color, alpha });
            }

            // Tracked texts
            for (let i = anim.trackedTexts.length - 1; i >= 0; i--) {
                const tt = anim.trackedTexts[i];
                tt.elapsed += dtSec;
                tt.pixiText.y += tt.vy * dtSec;
                tt.pixiText.alpha = Math.max(0, 1 - tt.elapsed / tt.duration);
                if (tt.elapsed >= tt.duration) {
                    if (!tt.pixiText.destroyed) tt.pixiText.destroy();
                    anim.trackedTexts.splice(i, 1);
                }
            }
        }
    }

    // ─── Game Over ───
    private showGameOverOverlay(winnerIndex: 0 | 1 | null): void {
        const winnerName = winnerIndex !== null
            ? this.replayEngine.players[winnerIndex]?.username || `Player ${winnerIndex + 1}`
            : 'Draw';

        GameEvents.emit('replay_match_result', { winner: winnerName });
    }

    // ─── Main loop ───
    update(dt: number): void {
        // Background fallback
        if (!this.staticBg.texture || this.staticBg.texture === Texture.EMPTY) {
            this.staticBg.texture = Texture.WHITE;
            this.staticBg.tint = 0x0a0a12;
            this.staticBg.width = window.innerWidth;
            this.staticBg.height = window.innerHeight;
            this.staticBg.alpha = 1;
        }

        // Advance playback (just increments frame counter)
        this.replayEngine.update(dt);

        // Get current snapshots and render
        const snap = this.replayEngine.getSnapshot();
        if (snap) {
            this.renderBoard(0, snap.boards[0], dt);
            this.renderBoard(1, snap.boards[1], dt);
        }

        this.updateEffects(dt);
    }

    // ─── Layout ───
    private updateLayout(): void {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const queueColumnWidth = 80;
        const playerAreaWidth = this.boardWidth + queueColumnWidth + 20; 
        const spacing = 40;
        const totalWidth = playerAreaWidth * 2 + spacing;
        
        this.board1X = (screenW - totalWidth) / 2;
        this.board2X = this.board1X + playerAreaWidth + spacing;
        // Center vertically between header and footer
        const headerSpace = 60;
        const footerSpace = 160;
        const availableH = screenH - headerSpace - footerSpace;
        this.boardY = headerSpace + Math.max(0, (availableH - this.boardHeight) / 2);

        this.boardContainers[0].x = this.board1X;
        this.boardContainers[0].y = this.boardY;
        this.boardContainers[1].x = this.board2X;
        this.boardContainers[1].y = this.boardY;

        this.player1Label.x = this.board1X + this.boardWidth / 2;
        this.player1Label.y = this.boardY - 45;
        this.player2Label.x = this.board2X + this.boardWidth / 2;
        this.player2Label.y = this.boardY - 45;

        this.pauseIndicator.x = screenW / 2;
        this.pauseIndicator.y = screenH / 2;

        if (this.winnerOverlay) {
            this.winnerOverlay.x = screenW / 2;
            this.winnerOverlay.y = this.boardY + this.boardHeight / 2;
        }

        this.resizeBackground();
    }

    onResize(_width: number, _height: number): void {
        this.updateLayout();
    }

    getContainer(): Container {
        return this.container;
    }

    /**
     * CRITICAL: Dispose all replay data on exit.
     * This frees the snapshot memory (~3-12 MB) and unhooks all events.
     * Called by SceneManager when switching scenes.
     */
    destroy(): void {
        // Unhook events
        GameEvents.off('replay_control', this.handleReplayControl);

        // Clean up tracked text sprites
        for (const anim of this.animStates) {
            for (const tt of anim.trackedTexts) {
                if (!tt.pixiText.destroyed) tt.pixiText.destroy();
            }
        }

        // Free all snapshot memory
        this.replayEngine.dispose();

        // Destroy Pixi containers
        this.container.destroy({ children: true });
    }
}
