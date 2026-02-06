import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { MenuScene } from './MenuScene';
import { ReplayEngine, type ReplayFile } from '../core/ReplayEngine';
import { UIManager } from '../ui/UIManager';
import { CELL_SIZE, COLS, TOTAL_ROWS, HIDDEN_ROWS, PUYO_COLORS } from '../core/Constants';
import { Input } from '../core/Input';

const VISIBLE_ROWS = TOTAL_ROWS - HIDDEN_ROWS;

/**
 * ReplayScene - Watch recorded games with dual-board view
 * Features: Side-by-side player boards, playback controls, speed control
 */
export class ReplayScene implements IScene {
    container: Container;
    private replayEngine: ReplayEngine;

    // Rendering
    private board1Container: Container;
    private board2Container: Container;
    private board1Graphics: Graphics;
    private board2Graphics: Graphics;

    // UI Elements
    private player1Label: Text;
    private player2Label: Text;
    private timeLabel: Text;
    private speedLabel: Text;
    private pauseIndicator: Text;

    // Layout
    private boardWidth: number;
    private boardHeight: number;
    private board1X: number;
    private board2X: number;
    private boardY: number;

    constructor(replayData: ReplayFile) {
        this.container = new Container();
        this.replayEngine = new ReplayEngine(replayData);

        // Setup callbacks
        this.replayEngine.onFrameUpdate = () => {
            this.updateTimeLabel();
        };

        this.replayEngine.onGameOver = (winnerIndex) => {
            this.showGameOverOverlay(winnerIndex);
        };

        // Calculate board positions for side-by-side view
        this.boardWidth = COLS * CELL_SIZE;
        this.boardHeight = VISIBLE_ROWS * CELL_SIZE;
        const spacing = 120;
        const totalWidth = this.boardWidth * 2 + spacing;

        // Center the boards
        this.board1X = (window.innerWidth - totalWidth) / 2;
        this.board2X = this.board1X + this.boardWidth + spacing;
        this.boardY = 100;

        // Create board containers
        this.board1Container = new Container();
        this.board1Container.x = this.board1X;
        this.board1Container.y = this.boardY;
        this.container.addChild(this.board1Container);

        this.board2Container = new Container();
        this.board2Container.x = this.board2X;
        this.board2Container.y = this.boardY;
        this.container.addChild(this.board2Container);

        // Board graphics
        this.board1Graphics = new Graphics();
        this.board1Container.addChild(this.board1Graphics);

        this.board2Graphics = new Graphics();
        this.board2Container.addChild(this.board2Graphics);

        // Draw board backgrounds
        this.drawBoardBackground(this.board1Graphics);
        this.drawBoardBackground(this.board2Graphics);

        // Player labels
        const players = this.replayEngine.players;
        const labelStyle = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 24,
            fontWeight: 'bold',
            fill: '#ffffff',
            align: 'center'
        });

        this.player1Label = new Text({ text: players[0]?.username || 'Player 1', style: labelStyle });
        this.player1Label.anchor.set(0.5, 0);
        this.player1Label.x = this.board1X + this.boardWidth / 2;
        this.player1Label.y = this.boardY - 50;
        this.container.addChild(this.player1Label);

        this.player2Label = new Text({ text: players[1]?.username || 'Player 2', style: labelStyle });
        this.player2Label.anchor.set(0.5, 0);
        this.player2Label.x = this.board2X + this.boardWidth / 2;
        this.player2Label.y = this.boardY - 50;
        this.container.addChild(this.player2Label);

        // Time display
        const timeStyle = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 20,
            fill: '#cccccc'
        });

        this.timeLabel = new Text({ text: '0:00 / 0:00', style: timeStyle });
        this.timeLabel.anchor.set(0.5, 0);
        this.timeLabel.x = window.innerWidth / 2;
        this.timeLabel.y = this.boardY + this.boardHeight + 30;
        this.container.addChild(this.timeLabel);

        // Speed display
        this.speedLabel = new Text({ text: '1x', style: timeStyle });
        this.speedLabel.anchor.set(0.5, 0);
        this.speedLabel.x = window.innerWidth / 2 + 150;
        this.speedLabel.y = this.boardY + this.boardHeight + 30;
        this.container.addChild(this.speedLabel);

        // Pause indicator
        const pauseStyle = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 48,
            fontWeight: 'bold',
            fill: '#ff4d00'
        });

        this.pauseIndicator = new Text({ text: 'PAUSED', style: pauseStyle });
        this.pauseIndicator.anchor.set(0.5);
        this.pauseIndicator.x = window.innerWidth / 2;
        this.pauseIndicator.y = window.innerHeight / 2;
        this.pauseIndicator.visible = false;
        this.container.addChild(this.pauseIndicator);

        // Controls hint
        const hintStyle = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 14,
            fill: '#888888'
        });

        const hint = new Text({ text: 'SPACE: Pause | ←→: Speed | ESC: Exit', style: hintStyle });
        hint.anchor.set(0.5, 0);
        hint.x = window.innerWidth / 2;
        hint.y = this.boardY + this.boardHeight + 60;
        this.container.addChild(hint);

        // Setup keyboard handlers
        this.setupKeyboard();

        // Show replay controls UI
        UIManager.showReplayControls();
    }

    private keyHandler = (e: KeyboardEvent): void => {
        switch (e.code) {
            case 'Space':
                this.replayEngine.togglePause();
                this.pauseIndicator.visible = this.replayEngine.isPaused;
                break;
            case 'ArrowLeft':
                this.changeSpeed(-0.5);
                break;
            case 'ArrowRight':
                this.changeSpeed(0.5);
                break;
            case 'Escape':
                this.exitReplay();
                break;
        }
    };

    private setupKeyboard(): void {
        window.addEventListener('keydown', this.keyHandler);
    }

    private drawBoardBackground(g: Graphics): void {
        // Background
        g.rect(0, 0, this.boardWidth, this.boardHeight);
        g.fill({ color: 0x111111, alpha: 0.8 });
        g.stroke({ color: 0x333333, width: 2 });

        // Grid lines
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

    private renderBoard(g: Graphics, engine: any): void {
        const board = engine.board;

        // Clear and redraw background
        g.clear();
        this.drawBoardBackground(g);

        // Draw puyos
        for (let c = 0; c < COLS; c++) {
            for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
                const color = board.grid[c][r];
                if (color > 0) {
                    const x = c * CELL_SIZE + CELL_SIZE / 2;
                    const y = (r - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
                    const radius = CELL_SIZE / 2 - 4;

                    g.circle(x, y, radius);
                    g.fill({ color: PUYO_COLORS[color] });
                    g.stroke({ color: 0xffffff, width: 2, alpha: 0.3 });
                }
            }
        }

        // Draw active piece
        const piece = engine.activePiece;
        if (piece) {
            const mainX = piece.x * CELL_SIZE + CELL_SIZE / 2;
            const mainY = (piece.y - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;

            if (piece.y >= HIDDEN_ROWS) {
                g.circle(mainX, mainY, CELL_SIZE / 2 - 4);
                g.fill({ color: PUYO_COLORS[piece.mainColor] });
                g.stroke({ color: 0xffffff, width: 3, alpha: 0.5 });
            }

            // Sub puyo position based on rotation
            const subPos = engine.getSubPos(piece.x, piece.y, piece.rot);
            if (subPos.y >= HIDDEN_ROWS) {
                const subX = subPos.x * CELL_SIZE + CELL_SIZE / 2;
                const subY = (subPos.y - HIDDEN_ROWS) * CELL_SIZE + CELL_SIZE / 2;
                g.circle(subX, subY, CELL_SIZE / 2 - 4);
                g.fill({ color: PUYO_COLORS[piece.subColor] });
                g.stroke({ color: 0xffffff, width: 3, alpha: 0.5 });
            }
        }
    }

    private changeSpeed(delta: number): void {
        const currentSpeed = this.replayEngine.playbackSpeed;
        let newSpeed = currentSpeed + delta;

        // Snap to common values
        const snapPoints = [0.25, 0.5, 1, 2, 4];
        newSpeed = snapPoints.reduce((prev, curr) =>
            Math.abs(curr - newSpeed) < Math.abs(prev - newSpeed) ? curr : prev
        );

        this.replayEngine.setSpeed(newSpeed);
        this.speedLabel.text = `${newSpeed}x`;
    }

    private updateTimeLabel(): void {
        this.timeLabel.text = this.replayEngine.getTimeString();
    }

    private showGameOverOverlay(winnerIndex: 0 | 1 | null): void {
        const winnerName = winnerIndex !== null
            ? this.replayEngine.players[winnerIndex]?.username || `Player ${winnerIndex + 1}`
            : 'Draw';

        const overlayStyle = new TextStyle({
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 36,
            fontWeight: 'bold',
            fill: '#4eff4e'
        });

        const overlay = new Text({ text: `WINNER: ${winnerName}`, style: overlayStyle });
        overlay.anchor.set(0.5);
        overlay.x = window.innerWidth / 2;
        overlay.y = window.innerHeight / 2;
        this.container.addChild(overlay);
    }

    private exitReplay(): void {
        UIManager.hideReplayControls();
        UIManager.showMain();
        SceneManager.changeScene(new MenuScene());
    }

    update(dt: number): void {
        // Handle input - check for pause action
        if (Input.isActionPressed('pause')) {
            this.replayEngine.togglePause();
            this.pauseIndicator.visible = this.replayEngine.isPaused;
        }

        // Update replay engine
        this.replayEngine.update(dt);

        // Render both boards
        this.renderBoard(this.board1Graphics, this.replayEngine.player1Engine);
        this.renderBoard(this.board2Graphics, this.replayEngine.player2Engine);
    }

    getContainer(): Container {
        return this.container;
    }

    destroy(): void {
        window.removeEventListener('keydown', this.keyHandler);
        UIManager.hideReplayControls();
        this.container.destroy({ children: true });
    }
}
