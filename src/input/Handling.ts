/**
 * Handling: turns the player's keys into piece movement, one logical frame at
 * a time.
 *
 * This is the whole of DAS, ARR, rotation, soft and hard drop, shared by every
 * mode that is played rather than watched. It used to be written out twice
 * (GameScene and QuickPlayScene), differently, and both copies counted DAS and
 * ARR in *rendered* frames: on a 144 Hz monitor a DAS of 10 was 69 ms instead
 * of 167 ms (CLI-01). This class counts logical frames only, because the
 * scene calls it once per engine step.
 *
 * It is pure -- no DOM, no timers, no singletons -- so it runs the same in the
 * browser, in unit tests and in headless tools. Key presses come in as a
 * FrameInput whose `pressed` set holds every press since the previous logical
 * frame, so a tap that starts and ends between two frames still counts
 * (CLI-11). See src/core/Input.ts for the latching, and
 * website/src/content/docs/design/game-feel.md for the targets.
 */

/** The actions a player uses to control the piece. */
export type PlayAction = 'moveLeft' | 'moveRight' | 'softDrop' | 'hardDrop' | 'rotateCW' | 'rotateCCW';

export const PLAY_ACTIONS: readonly PlayAction[] = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotateCW', 'rotateCCW'];

/** Input for one logical frame. */
export interface FrameInput {
    /** Actions pressed since the previous logical frame, however briefly. */
    readonly pressed: ReadonlySet<PlayAction>;
    /** Actions held down now. */
    readonly held: ReadonlySet<PlayAction>;
}

export interface HandlingSettings {
    /** Delayed auto shift: frames a direction is held before it repeats. */
    readonly das: number;
    /** Auto repeat rate: frames between repeats; 0 moves straight to the wall. */
    readonly arr: number;
}

/** The parts of the engine that handling drives. */
export interface HandlingEngine {
    readonly activePiece: unknown | null;
    softDrop: boolean;
    horizontalMoveHeld: boolean;
    movePiece(dx: number): boolean;
    rotate(dir: 1 | -1): boolean;
    hardDrop(): boolean;
}

/** Replay input codes, as recorded (see packages/engine/src/replay.ts). */
export type InputCode = 'L' | 'R' | 'CW' | 'CC' | 'SD' | 'SU' | 'HH' | 'HU' | 'HD';

export interface HandlingHooks {
    /** Every change applied to the engine, in order: the replay and the network need all of them. */
    record?(code: InputCode): void;
    sound?(sound: 'move' | 'rotate' | 'drop'): void;
}

export interface HandlingOptions {
    /**
     * Report held horizontal keys to the engine's glide buffer (the HH/HU
     * inputs). Off for Puyo Mines, whose server simulation does not take them.
     */
    glide?: boolean;
}

export class HandlingController {
    /** The direction being auto-shifted: -1 left, 1 right, 0 none. */
    private dir: -1 | 0 | 1 = 0;
    /** Logical frames the current direction has been held. */
    private charge = 0;
    /** Logical frames since the last auto-repeat step. */
    private sinceStep = 0;
    private hadPiece = false;
    private readonly glide: boolean;

    constructor(options: HandlingOptions = {}) {
        this.glide = options.glide ?? true;
    }

    /** Forget held directions, for a new game. */
    reset(): void {
        this.dir = 0;
        this.charge = 0;
        this.sinceStep = 0;
        this.hadPiece = false;
    }

    /** Apply one logical frame of input to `engine`. */
    frame(engine: HandlingEngine, input: FrameInput, settings: HandlingSettings, hooks: HandlingHooks = {}): void {
        const { pressed, held } = input;
        const piece = engine.activePiece !== null;
        const spawned = piece && !this.hadPiece;
        this.hadPiece = piece;

        const leftDown = held.has('moveLeft') || pressed.has('moveLeft');
        const rightDown = held.has('moveRight') || pressed.has('moveRight');

        // The most recent press wins. Letting go of it hands control back to
        // the other direction if that is still held, as a fresh press.
        let fresh = false;
        const pl = pressed.has('moveLeft'), pr = pressed.has('moveRight');
        if (pl !== pr) {
            this.dir = pl ? -1 : 1;
            this.charge = 0;
            fresh = true;
        } else if (pl && pr) {
            this.dir = 0;
            this.charge = 0;
        }
        if (this.dir === -1 && !leftDown) {
            this.dir = rightDown ? 1 : 0;
            this.charge = 0;
            fresh = this.dir !== 0;
        } else if (this.dir === 1 && !rightDown) {
            this.dir = leftDown ? -1 : 0;
            this.charge = 0;
            fresh = this.dir !== 0;
        }

        let moved = false;
        const code: InputCode = this.dir < 0 ? 'L' : 'R';
        const step = () => {
            if (!engine.movePiece(this.dir)) return false;
            hooks.record?.(code);
            moved = true;
            return true;
        };
        if (this.dir !== 0) {
            if (fresh) {
                this.sinceStep = 0;
                if (piece) step();
            } else {
                this.charge++;
                this.sinceStep++;
                if (piece && this.charge >= settings.das) {
                    if (settings.arr <= 0) {
                        while (step()) { /* to the wall */ }
                    } else if (spawned || this.charge === settings.das || this.sinceStep >= settings.arr) {
                        // The first repeat comes when DAS charges, then one
                        // every ARR frames. A new piece moves on its first
                        // frame if DAS is already charged, and the cadence
                        // restarts from there.
                        step();
                        this.sinceStep = 0;
                    }
                }
            }
        }
        if (moved) hooks.sound?.('move');

        if (piece) {
            if (pressed.has('rotateCCW') && engine.rotate(-1)) {
                hooks.record?.('CC');
                hooks.sound?.('rotate');
            }
            if (pressed.has('rotateCW') && engine.rotate(1)) {
                hooks.record?.('CW');
                hooks.sound?.('rotate');
            }
        }

        const softDrop = held.has('softDrop') || pressed.has('softDrop');
        if (softDrop !== engine.softDrop) {
            engine.softDrop = softDrop;
            hooks.record?.(softDrop ? 'SD' : 'SU');
        }

        // Held horizontal keys feed the engine's glide buffer, recorded as
        // edges so a replay can rebuild the held state (docs/adr/0002).
        if (this.glide) {
            const horizontal = leftDown || rightDown;
            if (horizontal !== engine.horizontalMoveHeld) {
                engine.horizontalMoveHeld = horizontal;
                hooks.record?.(horizontal ? 'HH' : 'HU');
            }
        }

        if (pressed.has('hardDrop') && engine.hardDrop()) {
            hooks.record?.('HD');
            hooks.sound?.('drop');
        }
    }
}
