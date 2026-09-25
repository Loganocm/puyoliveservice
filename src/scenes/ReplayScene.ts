import { Container, Text } from 'pixi.js';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { ReplayEngine, type ReplayFile } from '../core/ReplayEngine';
import type { BoardSnapshot } from '../core/ReplaySimulator';
import { GameState } from '@puyolive/engine';
import { CELL_SIZE } from '../core/RenderConstants';
import { GameEvents } from '../core/GameEvents';
import { SoundManager } from '../core/SoundManager';
import { BGMManager } from '../core/BGMManager';
import { BoardView } from '../render/BoardView';
import { Backdrop } from '../render/Backdrop';
import { NextQueueView } from '../render/NextQueueView';
import { FONTS, getTheme } from '../theme/tokens';

/*
 * The two players side by side, each with their board, queue, name and score,
 * laid out in a fixed stage that is scaled to fit between the React header
 * and the playback controls. Stage units match the match screen's, so both
 * look the same.
 */
const SKY = 4 * CELL_SIZE;
const LABEL_H = 44;
const QUEUE_GAP = 24;
const SIDE_W = BoardView.WIDTH + QUEUE_GAP + NextQueueView.WIDTH;
const SIDE_GAP = 80;
const STAGE_W = SIDE_W * 2 + SIDE_GAP;
const STAGE_H = LABEL_H + SKY + BoardView.HEIGHT + 64;
/** Screen space the React overlay uses above and below the boards. */
const HEADER_PX = 64;
const FOOTER_PX = 170;

interface Side {
    root: Container;
    board: BoardView;
    queue: NextQueueView;
    name: Text;
    score: Text;
    chain: Text;
    prevState: number;
    shownScore: number;
    shownChain: number;
}

/**
 * ReplayScene — Snapshot-based replay viewer with dual-board layout.
 *
 * Renders from pre-computed FrameSnapshot[] arrays (no live GameEngine), so
 * seeking is instant. Boards are drawn by BoardView from each snapshot, which
 * is also what the live game uses: a replay looks and animates exactly like
 * the match it records. (The previous renderer hard-coded pop and cascade
 * timings twice the engine's, so replays animated at half speed.) Memory is
 * freed on destroy().
 */
export class ReplayScene implements IScene {
    container: Container;
    private replayEngine: ReplayEngine;
    private backdrop: Backdrop;
    private stage = new Container();
    private sides: [Side, Side];
    private pauseIndicator: Text;

    constructor(replayData: ReplayFile) {
        this.container = new Container();
        BGMManager.play('game');
        this.replayEngine = new ReplayEngine(replayData);

        this.backdrop = new Backdrop(SceneManager.screenWidth, SceneManager.screenHeight);
        this.container.addChild(this.backdrop.container, this.stage);

        const players = this.replayEngine.players;
        this.sides = [
            this.buildSide(0, players[0]?.username || 'Player 1'),
            this.buildSide(1, players[1]?.username || 'Player 2'),
        ];

        const theme = getTheme();
        this.pauseIndicator = new Text({
            text: 'PAUSED',
            resolution: 2,
            style: {
                fontFamily: FONTS.display, fontSize: 64, fontWeight: '700', fill: theme.text.primary, letterSpacing: 4,
                stroke: { color: theme.bg.base, width: 10, join: 'round' },
            },
        });
        this.pauseIndicator.anchor.set(0.5);
        this.pauseIndicator.position.set(STAGE_W / 2, LABEL_H + SKY + BoardView.HEIGHT / 2);
        this.pauseIndicator.visible = false;
        this.stage.addChild(this.pauseIndicator);

        this.updateLayout();

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

    private buildSide(index: 0 | 1, username: string): Side {
        const theme = getTheme();
        const root = new Container();
        root.x = index * (SIDE_W + SIDE_GAP);
        const board = new BoardView();
        board.container.position.set(0, LABEL_H + SKY);
        const queue = new NextQueueView();
        queue.container.position.set(BoardView.WIDTH + QUEUE_GAP, LABEL_H + SKY);
        const name = new Text({
            text: username,
            resolution: 2,
            style: { fontFamily: FONTS.display, fontSize: 30, fontWeight: '600', fill: theme.text.primary },
        });
        name.anchor.set(0.5, 0);
        name.position.set(BoardView.WIDTH / 2, 0);
        const score = new Text({
            text: '0',
            resolution: 2,
            style: { fontFamily: FONTS.display, fontSize: 30, fontWeight: '600', fill: theme.text.primary },
        });
        score.anchor.set(0.5, 0);
        score.position.set(BoardView.WIDTH / 2, LABEL_H + SKY + BoardView.HEIGHT + 14);
        const chain = new Text({
            text: '',
            resolution: 2,
            style: { fontFamily: FONTS.ui, fontSize: 14, fontWeight: '700', letterSpacing: 2, fill: theme.accent.primary },
        });
        chain.anchor.set(0.5, 0);
        chain.position.set(BoardView.WIDTH + QUEUE_GAP + NextQueueView.WIDTH / 2, LABEL_H + SKY + NextQueueView.HEIGHT + 14);
        root.addChild(board.container, queue.container, name, score, chain);
        this.stage.addChild(root);
        return { root, board, queue, name, score, chain, prevState: -1, shownScore: -1, shownChain: -1 };
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
                    // Start the views afresh at the new position: no landings,
                    // pops or sounds for the jump itself.
                    for (const side of this.sides) {
                        side.board.reset();
                        side.prevState = -1;
                    }
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

    private renderSide(side: Side, board: BoardSnapshot, dt: number): void {
        if (side.prevState !== board.state) {
            // Sounds for what the snapshot shows starting, only while playing.
            if (side.prevState !== -1 && dt > 0) {
                // Replays have no engine hooks, so the chain sound comes from the snapshot.
                if (board.state === GameState.POP_ANIM && board.matchedPuyos.length > 0) SoundManager.playCombo(board.chainCount);
                if (board.state === GameState.GARBAGE_FALL) SoundManager.play('drop');
            }
            side.prevState = board.state;
        }
        side.board.render(board, dt);
        side.queue.render(board.nextPieces, dt, side.board.spawnedThisFrame);
        if (board.score !== side.shownScore) {
            side.shownScore = board.score;
            side.score.text = board.score.toLocaleString('en-US');
        }
        if (board.maxChain !== side.shownChain) {
            side.shownChain = board.maxChain;
            side.chain.text = board.maxChain > 1 ? `MAX ${board.maxChain} CHAIN` : '';
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
        // Advance playback (just increments frame counter)
        this.replayEngine.update(dt);

        // Board animations follow playback: faster at 2x, frozen when paused.
        const animDt = this.replayEngine.isPaused ? 0 : dt * this.replayEngine.playbackSpeed;
        const snap = this.replayEngine.getSnapshot();
        if (snap) {
            this.renderSide(this.sides[0], snap.boards[0], animDt);
            this.renderSide(this.sides[1], snap.boards[1], animDt);
        }
        this.backdrop.update(dt);
    }

    // ─── Layout ───
    private updateLayout(): void {
        const screenW = SceneManager.screenWidth;
        const screenH = SceneManager.screenHeight;
        const availH = Math.max(200, screenH - HEADER_PX - FOOTER_PX);
        const scale = Math.min((screenW - 32) / STAGE_W, availH / STAGE_H);
        this.stage.scale.set(scale);
        this.stage.position.set(Math.round((screenW - STAGE_W * scale) / 2), Math.round(HEADER_PX + (availH - STAGE_H * scale) / 2));
        this.backdrop.resize(screenW, screenH);
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

        // Free all snapshot memory
        this.replayEngine.dispose();

        // Destroy Pixi containers
        this.container.destroy({ children: true });
    }
}
