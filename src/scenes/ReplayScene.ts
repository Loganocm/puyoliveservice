import { Container, Graphics, Sprite, Text, TextStyle, Texture, Assets } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { ReplayEngine, type ReplayFile } from '../core/ReplayEngine';
import { CELL_SIZE, COLS, TOTAL_ROWS, HIDDEN_ROWS, PuyoColor, PUYO_COLORS } from '../core/Constants';
import { GameEngine, GameState } from '../core/GameEngine';
import { ResourceManager } from '../core/ResourceManager';
import { GameEvents } from '../core/GameEvents';
import { backgroundManager } from '../core/BackgroundManager';
import { SoundManager } from '../core/SoundManager';

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
    prevState: GameState;
}

/**
 * ReplayScene - Watch recorded games with dual-board view
 * Full sprite-based rendering with animations matching the live GameScene.
 */
export class ReplayScene implements IScene {
    container: Container;
    private replayEngine: ReplayEngine;

    // Background
    private staticBg: Sprite;

    // Per-board rendering containers
    private boardPuyoContainers: [Container, Container];
    private boardEffectContainers: [Container, Container];
    private boardParticleGraphics: [Graphics, Graphics];

    // Per-board animation state
    private animStates: [BoardAnimState, BoardAnimState];

    // UI Elements
    private player1Label: Text;
    private player2Label: Text;
    private timeLabel: Text;
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
        this.replayEngine = new ReplayEngine(replayData);

        // --- Background ---
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

        // --- Layout ---
        this.boardWidth = COLS * CELL_SIZE;
        this.boardHeight = VISIBLE_ROWS * CELL_SIZE;
        const spacing = 120;
        const totalWidth = this.boardWidth * 2 + spacing;
        this.board1X = (window.innerWidth - totalWidth) / 2;
        this.board2X = this.board1X + this.boardWidth + spacing;
        this.boardY = 60;

        // --- Build per-board containers ---
        const buildBoard = (x: number): { cont: Container, bg: Graphics, puyos: Container, fx: Container, particles: Graphics } => {
            const cont = new Container();
            cont.x = x;
            cont.y = this.boardY;
            this.container.addChild(cont);

            const bg = new Graphics();
            cont.addChild(bg);

            const puyos = new Container();
            cont.addChild(puyos);

            const fx = new Container();
            cont.addChild(fx);

            const particles = new Graphics();
            fx.addChild(particles);

            return { cont, bg, puyos, fx, particles };
        };

        const b1 = buildBoard(this.board1X);
        const b2 = buildBoard(this.board2X);

        this.boardPuyoContainers = [b1.puyos, b2.puyos];
        this.boardEffectContainers = [b1.fx, b2.fx];
        this.boardParticleGraphics = [b1.particles, b2.particles];

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
        });
        this.animStates = [makeAnimState(), makeAnimState()];

        // --- Hook engine events for animations ---
        this.hookEngineEvents(0);
        this.hookEngineEvents(1);

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

        // Time
        const timeStyle = new TextStyle({ fontFamily: 'Orbitron, sans-serif', fontSize: 20, fill: '#cccccc' });
        this.timeLabel = new Text({ text: '0:00 / 0:00', style: timeStyle });
        this.timeLabel.anchor.set(0.5, 0);
        this.timeLabel.x = window.innerWidth / 2;
        this.timeLabel.y = this.boardY + this.boardHeight + 20;
        this.container.addChild(this.timeLabel);

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
            });
            this.timeLabel.text = this.replayEngine.getTimeString();
        };

        this.replayEngine.onGameOver = (winnerIndex) => {
            this.showGameOverOverlay(winnerIndex);
        };

        // Re-hook engine events after seek rebuilds engines
        this.replayEngine.onEngineReset = () => {
            this.hookEngineEvents(0);
            this.hookEngineEvents(1);
        };

        // Start paused — ReplayOverlay will resume once mounted
        this.replayEngine.pause();

        // Emit initial state so overlay gets totalFrames immediately
        GameEvents.emit('replay_update', {
            currentFrame: 0,
            totalFrames: replayData.duration,
            isPaused: true,
            speed: this.replayEngine.playbackSpeed,
        });

        // React UI controls
        GameEvents.on('replay_control', this.handleReplayControl);
    }

    // ─── Engine event hooks (per board) ───
    private hookEngineEvents(idx: 0 | 1): void {
        const engine = idx === 0 ? this.replayEngine.player1Engine : this.replayEngine.player2Engine;
        const anim = this.animStates[idx];

        engine.onPieceSpawn = () => {
            anim.spawnAnim = 0;
        };

        engine.onPieceLock = (cells) => {
            this.startLandingJiggle(anim, cells);
        };

        engine.onGravityLanded = (cells) => {
            this.startLandingJiggle(anim, cells);
        };

        engine.onChainStep = (chain) => {
            this.spawnChainText(idx, engine, chain);
            this.spawnParticles(idx, engine);
            SoundManager.playCombo(chain);
        };

        engine.onHardDrop = (cells) => {
            this.startLandingJiggle(anim, cells);
        };
    }

    // ─── Layout helpers ───
    private resizeBackground(): void {
        if (!this.staticBg.texture || this.staticBg.texture === Texture.WHITE) return;
        const tex = this.staticBg.texture;
        const scaleX = window.innerWidth / tex.width;
        const scaleY = window.innerHeight / tex.height;
        const s = Math.max(scaleX, scaleY);
        this.staticBg.width = tex.width * s;
        this.staticBg.height = tex.height * s;
        this.staticBg.alpha = 0.4;
        this.staticBg.position.set(window.innerWidth / 2, window.innerHeight / 2);
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
                    // seekToFrame rebuilds engines; onEngineReset re-hooks events
                    this.replayEngine.seekToFrame(cmd.value);
                    // Reset animation state
                    this.animStates[0] = { landingAnims: new Map(), spawnAnim: -1, popAnimProgress: 0, particles: [], trackedTexts: [], prevState: GameState.SPAWN };
                    this.animStates[1] = { landingAnims: new Map(), spawnAnim: -1, popAnimProgress: 0, particles: [], trackedTexts: [], prevState: GameState.SPAWN };
                    // Remove winner overlay on seek
                    if (this.winnerOverlay) { this.winnerOverlay.destroy(); this.winnerOverlay = null; }
                }
                break;
            case 'speed':
                if (cmd.value !== undefined) this.replayEngine.setSpeed(cmd.value);
                break;
        }
    };

    // ─── Static board background ───
    private drawBoardBackground(g: Graphics): void {
        g.rect(0, 0, this.boardWidth, this.boardHeight);
        g.fill({ color: 0x000000, alpha: 0.75 });
        g.stroke({ color: 0x333333, width: 2 });

        for (let c = 1; c < COLS; c++) {
            g.moveTo(c * CELL_SIZE, 0);
            g.lineTo(c * CELL_SIZE, this.boardHeight);
            g.stroke({ color: 0x222222, width: 1 });
        }
        for (let r = 1; r < VISIBLE_ROWS; r++) {
            g.moveTo(0, r * CELL_SIZE);
            g.lineTo(this.boardWidth, r * CELL_SIZE);
            g.stroke({ color: 0x222222, width: 1 });
        }
    }

    // ─── Puyo sprite helper (matches GameScene.drawPuyo) ───
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
        const animKey = Math.round(c) * 100 + Math.round(r);
        const jiggle = anim.landingAnims.get(animKey);
        if (jiggle !== undefined) {
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

    private checkColor(engine: GameEngine, c: number, r: number, color: PuyoColor): boolean {
        if (!engine.board.isValid(c, r)) return false;
        return engine.board.grid[c][r] === color;
    }

    // ─── Full board render (sprites + animations) ───
    private renderBoard(idx: 0 | 1, engine: GameEngine, delta: number): void {
        const anim = this.animStates[idx];
        const puyoContainer = this.boardPuyoContainers[idx];
        const board = engine.board;

        // Clear prior sprites
        const children = puyoContainer.removeChildren();
        for (const child of children) child.destroy();

        // --- Build falling lookup ---
        const fallingLookup = new Map<number, number>();
        let fallingProgress = 0;
        if (engine.state === GameState.FALLING && engine.fallingDestinations.length > 0) {
            const scaledDelay = engine.getChainScaledDuration(engine.FALL_STEP_DELAY);
            fallingProgress = Math.min(1, engine.stateTimer / scaledDelay);
            fallingProgress = fallingProgress * fallingProgress; // ease-in
            for (const f of engine.fallingDestinations) {
                fallingLookup.set(f.c * 100 + f.r, f.destR);
            }
        }

        // --- Build popping set ---
        const poppingSet = new Set<number>();
        if (engine.state === GameState.POP_ANIM && engine.matchedPuyos.length > 0) {
            for (const group of engine.matchedPuyos) {
                for (const p of group) {
                    poppingSet.add(p.c * 100 + p.r);
                }
            }
        }

        // Pop animation progress
        if (engine.state === GameState.POP_ANIM) {
            const scaledDuration = engine.getChainScaledDuration(engine.POP_ANIM_DURATION);
            anim.popAnimProgress = Math.min(1, engine.stateTimer / scaledDuration);
        }

        // --- Draw board puyos ---
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                const color = board.grid[c][r];
                if (color === PuyoColor.None) continue;

                let connections = 0;
                if (color !== PuyoColor.Garbage) {
                    if (this.checkColor(engine, c, r - 1, color)) connections |= 1;
                    if (this.checkColor(engine, c + 1, r, color)) connections |= 2;
                    if (this.checkColor(engine, c, r + 1, color)) connections |= 4;
                    if (this.checkColor(engine, c - 1, r, color)) connections |= 8;
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
        if (engine.fallingGarbage && engine.fallingGarbage.length > 0) {
            for (const garb of engine.fallingGarbage) {
                if (garb.delay <= 10) {
                    this.addPuyoSprite(puyoContainer, anim, garb.c, garb.r, PuyoColor.Garbage, 0);
                }
            }
        }

        // --- Active piece ---
        const piece = engine.activePiece;
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
                if (cy >= 0 && board.grid[cx][cy] !== PuyoColor.None) return false;
                const subX = cx + offsets[cr].x;
                const subY = cy + offsets[cr].y;
                if (subY >= TOTAL_ROWS || subX < 0 || subX >= COLS) return false;
                if (subY >= 0 && board.grid[subX][subY] !== PuyoColor.None) return false;
                return true;
            };
            while (canPlace(x, gY + 1, rot)) gY++;

            if (gY !== y) {
                this.addPuyoSprite(puyoContainer, anim, x, gY, mainColor, mainConn, 0.3);
                this.addPuyoSprite(puyoContainer, anim, x + sx, gY + sy, subColor, subConn, 0.3);
            }
        }

        // --- Next piece preview ---
        if (engine.nextPieces.length > 0) {
            const next = engine.nextPieces[0];
            const previewX = this.boardWidth + 20;
            const previewY = 20;
            this.addPuyoSprite(puyoContainer, anim, 0, HIDDEN_ROWS, next.main, 0);
            // Move the last two sprites into preview position
            const mainSpr = puyoContainer.children[puyoContainer.children.length - 1] as Sprite;
            mainSpr.x = previewX + CELL_SIZE / 2;
            mainSpr.y = previewY + CELL_SIZE + CELL_SIZE / 2;
            mainSpr.width = CELL_SIZE * 0.7;
            mainSpr.height = CELL_SIZE * 0.7;

            this.addPuyoSprite(puyoContainer, anim, 0, HIDDEN_ROWS, next.sub, 0);
            const subSpr = puyoContainer.children[puyoContainer.children.length - 1] as Sprite;
            subSpr.x = previewX + CELL_SIZE / 2;
            subSpr.y = previewY + CELL_SIZE / 2;
            subSpr.width = CELL_SIZE * 0.7;
            subSpr.height = CELL_SIZE * 0.7;
        }

        // --- Score text ---
        const scoreText = new Text({
            text: `${engine.stats.score}`,
            style: new TextStyle({
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 18,
                fontWeight: 'bold',
                fill: '#ffffff',
            }),
        });
        scoreText.anchor.set(0.5, 0);
        scoreText.x = this.boardWidth / 2;
        scoreText.y = this.boardHeight + 4;
        puyoContainer.addChild(scoreText);

        // --- Tick animations ---
        // Landing jiggle
        const speed = delta / 12;
        for (const [key, a] of anim.landingAnims) {
            const next = a.t + speed;
            if (next >= 1) anim.landingAnims.delete(key);
            else a.t = next;
        }

        // Spawn animation
        if (anim.spawnAnim >= 0 && anim.spawnAnim < 1) {
            anim.spawnAnim += delta / 8;
            if (anim.spawnAnim >= 1) anim.spawnAnim = -1;
        }

        // Detect state transitions
        if (anim.prevState !== engine.state) {
            anim.prevState = engine.state;
        }
    }

    // ─── Effects ───
    private startLandingJiggle(anim: BoardAnimState, cells: { c: number; r: number }[]): void {
        let gcx = 0, gcy = 0;
        for (const cell of cells) {
            gcx += cell.c * CELL_SIZE + CELL_SIZE / 2;
            gcy += (cell.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
        }
        gcx /= cells.length;
        gcy /= cells.length;
        for (const cell of cells) {
            const key = cell.c * 100 + cell.r;
            anim.landingAnims.set(key, { t: 0, gcx, gcy });
        }
    }

    private spawnParticles(idx: 0 | 1, engine: GameEngine): void {
        const anim = this.animStates[idx];
        for (const group of engine.matchedPuyos) {
            if (group.length === 0) continue;
            let tx = 0, ty = 0;
            for (const p of group) {
                tx += p.c * CELL_SIZE + CELL_SIZE / 2;
                ty += (p.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
            }
            const cx = tx / group.length;
            const cy = ty / group.length;

            const firstColor = engine.board.grid[group[0].c][group[0].r];
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

    private spawnChainText(idx: 0 | 1, engine: GameEngine, chain: number): void {
        if (chain < 2 || engine.matchedPuyos.length === 0) return;
        const anim = this.animStates[idx];
        const group = engine.matchedPuyos[0];
        let tx = 0, ty = 0;
        for (const p of group) {
            tx += p.c * CELL_SIZE + CELL_SIZE / 2;
            ty += (p.r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
        }
        const cx = tx / group.length;
        const cy = ty / group.length;

        const style = new TextStyle({
            fontFamily: 'Rajdhani',
            fontSize: 40,
            fontWeight: 'bold',
            fill: 0xFFFF00,
            stroke: { color: 'white', width: 4 },
            dropShadow: { color: '#000000', blur: 4, angle: Math.PI / 6, distance: 6 },
        });
        const txt = new Text({ text: `${chain} Chain`, style, resolution: 2 });
        txt.anchor.set(0.5);
        txt.x = cx;
        txt.y = cy;
        this.boardEffectContainers[idx].addChild(txt);
        anim.trackedTexts.push({ pixiText: txt, elapsed: 0, duration: 0.75 + chain * 0.15, vy: -80 });
    }

    private updateEffects(delta: number): void {
        const dtSec = delta / 60;
        for (let idx = 0; idx < 2; idx++) {
            const anim = this.animStates[idx as 0 | 1];
            const pg = this.boardParticleGraphics[idx as 0 | 1];

            // Particles
            for (let i = anim.particles.length - 1; i >= 0; i--) {
                const p = anim.particles[i];
                p.x += p.vx * delta;
                p.y += p.vy * delta;
                p.vy += 0.2 * delta;
                p.life -= 0.03 * delta;
                if (p.life <= 0) anim.particles.splice(i, 1);
            }

            pg.clear();
            for (const p of anim.particles) {
                pg.rect(p.x - 3, p.y - 3, 6, 6);
                pg.fill({ color: p.color, alpha: p.life / p.maxLife });
            }

            // Tracked floating texts
            for (let i = anim.trackedTexts.length - 1; i >= 0; i--) {
                const tt = anim.trackedTexts[i];
                tt.elapsed += dtSec;
                const progress = Math.min(1, tt.elapsed / tt.duration);
                tt.pixiText.y += tt.vy * dtSec;
                if (progress > 0.6) tt.pixiText.alpha = 1 - ((progress - 0.6) / 0.4);
                if (progress < 0.1) {
                    const s = 0.5 + (progress / 0.1) * 0.5;
                    tt.pixiText.scale.set(s);
                } else {
                    tt.pixiText.scale.set(1);
                }
                if (tt.elapsed >= tt.duration) {
                    tt.pixiText.destroy();
                    anim.trackedTexts.splice(i, 1);
                }
            }
        }
    }

    // ─── Game Over ───
    private showGameOverOverlay(winnerIndex: 0 | 1 | null): void {
        if (this.winnerOverlay) return; // already shown
        const winnerName = winnerIndex !== null
            ? this.replayEngine.players[winnerIndex]?.username || `Player ${winnerIndex + 1}`
            : 'Draw';

        const style = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 36,
            fontWeight: 'bold',
            fill: '#4eff4e',
            dropShadow: { color: '#000000', blur: 8, angle: 0, distance: 0 },
        });

        this.winnerOverlay = new Text({ text: `WINNER: ${winnerName}`, style });
        this.winnerOverlay.anchor.set(0.5);
        this.winnerOverlay.x = window.innerWidth / 2;
        this.winnerOverlay.y = this.boardY + this.boardHeight / 2;
        this.container.addChild(this.winnerOverlay);
    }

    // ─── Main loop ───
    update(dt: number): void {
        // Background fallback
        if (!this.staticBg.texture || this.staticBg.texture === Texture.WHITE) {
            this.staticBg.texture = Texture.WHITE;
            this.staticBg.tint = 0x0a0a12;
            this.staticBg.width = window.innerWidth;
            this.staticBg.height = window.innerHeight;
        }

        this.replayEngine.update(dt);

        this.renderBoard(0, this.replayEngine.player1Engine, dt);
        this.renderBoard(1, this.replayEngine.player2Engine, dt);

        this.updateEffects(dt);
    }

    getContainer(): Container {
        return this.container;
    }

    destroy(): void {
        GameEvents.off('replay_control', this.handleReplayControl);
        this.container.destroy({ children: true });
    }
}
