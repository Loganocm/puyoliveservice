import { Board } from '../game/Board';
import { COLS, TOTAL_ROWS, PuyoColor } from './Constants';
import { SettingsManager } from './SettingsManager';

import { SoundManager } from './SoundManager';

export const GameState = {
    SPAWN: 0,
    ACTIVE: 1, // Interpreting input
    FALLING: 2, // Gravity for disconnected puyos
    CHECK_MATCH: 3,
    POP_ANIM: 4, // Waiting for animation to finish
    GARBAGE_FALL: 5, // Processing incoming garbage
    GAMEOVER: 6
} as const;

export type GameState = typeof GameState[keyof typeof GameState];

export interface GameStats {
    score: number;
    chainCount: number;
    maxChain: number;
    puyosCleared: number;
    garbageSent: number;
    garbageReceived: number;
}

export class GameEngine {
    public board: Board;
    public state: GameState = GameState.SPAWN;

    private seed: number; // Random Seed

    // Game State Data
    public activePiece: {
        x: number;
        y: number;
        rot: number;
        mainColor: PuyoColor; // Axis puyo
        subColor: PuyoColor;  // Orbiting puyo
    } | null = null;

    public nextPieces: { main: PuyoColor, sub: PuyoColor }[] = [];
    public stats: GameStats = {
        score: 0,
        chainCount: 0,
        maxChain: 0,
        puyosCleared: 0,
        garbageSent: 0,
        garbageReceived: 0
    };

    // Matching Data (exposed for renderer)
    public matchedPuyos: { c: number, r: number }[][] = [];
    public chainGroup: { c: number, r: number }[][] = [];

    // Garbage System
    // Score remainder carried over to next calculation
    private scoreRemainder: number = 0;
    // Incoming garbage from opponent (commited but not yet fallen)
    public garbageQueue: number = 0;
    // Nuisance points in the "tray" (waiting to be neutralized or sent)
    public nuisanceTray: number = 0;

    // Garbage Logic Flag
    private garbageFellThisTurn: boolean = false;

    // Timers
    private frameCount = 0;
    private dropTimer = 0;
    private currentDropDelay = 60; // Puyo Tsu Level 1 (Very Slow ~1s/row)
    private lockDelay = 30; // 0.5s placement delay (kept fast)
    private lockTimer = 0;

    // Timer for ARE (Entry Delay)
    public areTimer: number = 0;

    // Input States
    private _softDrop: boolean = false;
    public get softDrop(): boolean { return this._softDrop; }
    public set softDrop(val: boolean) {
        if (this._softDrop !== val) {
            this._softDrop = val;
            this.recordAction('softDrop', val);
        }
    }
    private softDropLocked: boolean = false; // For protection
    public horizontalMoveHeld: boolean = false; // For sticky top buffering

    // Input Buffer (IRS/IHS)
    // Stores an action string to be executed on the frame a piece spawns
    public bufferAction: string | null = null;

    // Initial Move Buffer (DAS Buffering)
    // Stores a movement direction (-1 or 1) that was pressed during ARE but couldn't execute
    public bufferedMove: number = 0;

    // State Timers (managed by engine, but renderer can override/sync)
    public stateTimer = 0;
    public readonly POP_ANIM_DURATION = 18; // 300ms (18 frames)
    public readonly FALL_STEP_DELAY = 10; // Slowed down from 2 -> 10 for better rhythm

    // Events
    public onStateChange?: (state: GameState) => void;
    public onGarbageGenerated?: (amount: number) => void; // "Ojama" / Garbage
    public onGarbageOffset?: (amount: number) => void;
    public onChainStep?: (chain: number) => void;
    public onPieceLock?: (cells: { c: number, r: number }[]) => void;
    public onGravityLanded?: (cells: { c: number, r: number }[]) => void;
    public onHardDrop?: (cells: { c: number, r: number }[]) => void;
    public onAllClear?: () => void;
    public onBoardChange?: () => void;
    public onActivePieceUpdate?: () => void; // For multiplayer sync
    public onPieceSpawn?: () => void;

    // Animation queue for dropping garbage
    public fallingGarbage: { c: number, r: number, destR: number, delay: number }[] = [];
    public fallingDestinations: { c: number, r: number, destR: number }[] = []; // For normal gravity
    public garbageAnimationTimer = 0;

    // Replay System V2
    public replayInputs: { f: number, i: string, a?: number }[] = [];
    public isReplaying: boolean = false;
    private replayCursor: number = 0;

    // Replay-locked settings (set by ReplaySimulator for determinism)
    // These override SettingsManager values during replay to match the original game
    public replaySDF: number = 10;
    public replaySoftDropProtection: boolean = true;

    // When true, engine.update() will NOT call processReplayFrame() internally.
    // Used by ReplaySimulator which drives input application externally.
    public externalReplayControl: boolean = false;

    constructor(seed?: number) {
        // If no seed provided, generate one
        this.seed = seed ?? Math.floor(Math.random() * 2147483647);
        this.board = new Board();

        // Warmup PRNG to avoid initialization bias
        this.random(); this.random(); this.random(); this.random();

        // Generate initial bag
        this.currentBag = this.generateBag(true); // First bag is strict
        this.fillNextQueue();
    }

    private random(): number {
        // Mulberry32
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    private dt: number = 1.0;

    private currentBag: { main: PuyoColor, sub: PuyoColor }[] = [];

    // Record an action (Legacy/Unused in V2 client-side, handled by NetworkManager)
    private recordAction(_type: string, _data?: any) {
        // V2: Inputs are recorded by GameScene/NetworkManager sending 'record_input' to server.
        // GameEngine does not need to store them locally unless we want local replay save.
    }

    public loadReplay(data: { seed: number, inputs: { f: number, i: string, a?: number }[] }) {
        this.replayInputs = data.inputs;
        this.isReplaying = true;
        this.replayCursor = 0;
        this.frameCount = 0;
        this.board = new Board();
        this.state = GameState.SPAWN;
        this.activePiece = null;
        this.matchedPuyos = [];
        this.chainGroup = [];
        this.stats = { score: 0, chainCount: 0, maxChain: 0, puyosCleared: 0, garbageSent: 0, garbageReceived: 0 };
        this.garbageQueue = 0;
        this.nuisanceTray = 0;
        this.scoreRemainder = 0;
        this.garbageFellThisTurn = false;
        this.dropTimer = 0;
        this.lockTimer = 0;
        this.areTimer = 0;
        this.stateTimer = 0;
        this._softDrop = false;
        this.softDropLocked = false;
        this.horizontalMoveHeld = false;
        this.bufferAction = null;
        this.bufferedMove = 0;
        this.fallingGarbage = [];
        this.fallingDestinations = [];
        this.garbageAnimationTimer = 0;

        // Reset PRNG
        this.seed = data.seed;
        this.random(); this.random(); this.random(); this.random();

        this.currentBag = this.generateBag(true); // First bag
        this.nextPieces = [];
        this.fillNextQueue();
    }

    public processReplayFrame() {
        if (!this.isReplaying) return;

        while (this.replayCursor < this.replayInputs.length) {
            const input = this.replayInputs[this.replayCursor];
            if (input.f <= this.frameCount) {
                this.executeReplayInput(input);
                this.replayCursor++;
            } else {
                break;
            }
        }
    }

    private executeReplayInput(input: { f: number, i: string, a?: number }) {
        switch (input.i) {
            case 'L': this.movePiece(-1); break;
            case 'R': this.movePiece(1); break;
            case 'CW': this.rotate(1); break;
            case 'CC': this.rotate(-1); break;
            case 'SD': this.softDrop = true; break;
            case 'SU': this.softDrop = false; break;
            case 'HD': this.hardDrop(); break;
            case 'G': if (input.a) this.addGarbage(input.a); break;
        }
    }

    // isStartBag: restricts to 3 colors for first batch
    private generateBag(isStartBag: boolean = false): { main: PuyoColor, sub: PuyoColor }[] {
        const bag: { main: PuyoColor, sub: PuyoColor }[] = [];

        let colors: PuyoColor[] = [PuyoColor.Red, PuyoColor.Green, PuyoColor.Blue, PuyoColor.Yellow, PuyoColor.Purple]; // Added Purple

        if (isStartBag) {
            // Restrict to first 3 colors only for the start
            // User requested full color pool even at start
            // colors = [PuyoColor.Red, PuyoColor.Green, PuyoColor.Blue];
        }

        // Start Bag Logic: Balanced Shuffle (Bag of 12 Puyo: 4R, 4G, 4B)
        if (isStartBag) {
            // Create pool: 4 of each color
            const pool: PuyoColor[] = [];
            for (const c of colors) { // R, G, B
                for (let k = 0; k < 4; k++) pool.push(c);
            }

            // Shuffle Pool
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(this.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            // Create 6 Pairs from Pool
            for (let i = 0; i < 6; i++) {
                let m = pool[i * 2];
                let s = pool[i * 2 + 1];

                // Enforce No Doubles for First 2 Hands
                if (i < 2 && m === s) {
                    // Swap sub with next pair's sub? Or find first non-matching in remaining pool?
                    // Simple swap with next index usually works, but pool is linear.
                    // Brute force swap with random future index until fixed.
                    let k = i * 2 + 1;
                    let attempts = 0;
                    while (m === s && attempts < 10) {
                        const swapIdx = (i * 2 + 2) + Math.floor(this.random() * (pool.length - (i * 2 + 2)));
                        if (swapIdx < pool.length) {
                            // Swap
                            const temp = pool[k];
                            pool[k] = pool[swapIdx];
                            pool[swapIdx] = temp;
                            s = pool[k];
                        }
                        attempts++;
                    }
                }

                bag.push({ main: m, sub: s });
            }
            return bag;
        }

        // Main Game Logic: Deck of Pairs (64 pieces)
        // ... handled below ...


        // Puyo doesn't strictly "shuffle a deck" like Tetris 7-bag.
        // It's random-ish. But to be "fairer" (Tetrio style), we can make it a shuffled deck.
        // Let's implement a "Deck of Pairs":
        // 5 colors * 5 colors = 25 permutations.

        // 4 of each permutation = 100 pairs.
        // This ensures every color combo appears.

        if (!isStartBag) {
            const deck: { main: PuyoColor, sub: PuyoColor }[] = [];
            const variants = colors;

            // 4 copies of every possible pair combination (25 * 4 = 100 pairs for 5 colors)
            for (let m of variants) {
                for (let s of variants) {
                    for (let k = 0; k < 4; k++) deck.push({ main: m, sub: s });
                }
            }

            // Fisher-Yates Shuffle
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(this.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            return deck;
        }

        return bag; // Return the random start bag if start
    }

    public addGarbage(amount: number) {
        this.recordAction('addGarbage', amount);
        // Convert Rocks to Points (70 pts/rock) for precision offsetting
        this.nuisanceTray += amount * 70;
        this.stats.garbageReceived += amount;
    }

    // --- Main Loop ---

    public update(dt: number = 1.0) {
        this.dt = dt;
        this.frameCount++;

        // Process Replay Inputs if active (skip when externally driven by ReplaySimulator)
        if (this.isReplaying && !this.externalReplayControl) {
            this.processReplayFrame();
        }

        switch (this.state) {
            case GameState.SPAWN:
                this.spawnPiece();
                break;

            case GameState.ACTIVE:
                this.handleActiveState();
                break;

            case GameState.FALLING:
                this.handleFallingState();
                break;

            case GameState.CHECK_MATCH:
                this.handleCheckMatch();
                break;

            case GameState.POP_ANIM:
                this.handlePopAnim();
                break;

            case GameState.GARBAGE_FALL:
                // If animation logic is active, use it (or it replaces existing logic)
                if (this.fallingGarbage.length > 0) {
                    this.handleGarbageAnimation();
                } else {
                    this.handleGarbageFall();
                }
                break;
        }
    }

    // --- Actions (Input Interfacing) ---

    public movePiece(dx: number): boolean {
        // Enforce ARE freeze on movement
        if (this.areTimer > 0) return false;

        // Allow movement if ACTIVE or (just for safety) if activePiece exists
        // (Caller usually checks state, but engine should be strict or lenient?)
        // Let's keep it strict but allow movement if piece exists for our spawn logic
        if (!this.activePiece) return false;
        // if (this.state !== GameState.ACTIVE && this.state !== GameState.SPAWN) return false; 

        // Actually, for "Spawn Frame" movement, state might be SPAWN or ACTIVE.
        // Let's rely on caller to determine if movement is allowed.

        if (this.canMove(dx, 0)) {
            this.activePiece.x += dx;
            this.lockTimer = 0; // Reset lock timer on move
            this.onActivePieceUpdate?.();
            this.recordAction('move', dx);
            return true;
        }
        return false;
    }

    public fastDrop(_active: boolean) {
        // Just modifies speed for the update loop
        // handled via `handleActiveState` pulling settings
    }

    // For replay engine - explicit soft drop control
    public setSoftDrop(active: boolean): void {
        this._softDrop = active;
    }

    // Instant hard drop (optional for Puyo, but requested in modern clones)
    public hardDrop(): boolean {
        if (this.state !== GameState.ACTIVE || !this.activePiece) return false;
        if (this.areTimer > 0) return false;

        let dropped = 0;
        while (this.canMove(0, 1)) {
            this.activePiece.y += 1;
            dropped++;
        }
        // Capture cells before lock for hard drop animation
        const hdMain = { c: this.activePiece.x, r: this.activePiece.y };
        const hdSub = this.getSubPos(this.activePiece.x, this.activePiece.y, this.activePiece.rot);
        const hdCells = [{ c: hdMain.c, r: hdMain.r }, { c: hdSub.x, r: hdSub.y }];
        if (dropped > 0) {
            this.onActivePieceUpdate?.();
            // Immediately lock without waiting for lockDelay
            this.lockPiece();
            this.onHardDrop?.(hdCells);
            this.stats.score += dropped; // Tiny bonus
            return true;
        }
        // Even if didn't drop (already on ground), hard drop usually locks?
        // Standard behavior: Hard Drop on ground -> Lock.
        this.lockPiece();
        this.onHardDrop?.(hdCells);
        this.recordAction('hardDrop');
        return true;
    }

    public rotate(dir: 1 | -1): boolean {
        if (this.state !== GameState.ACTIVE || !this.activePiece) return false;
        if (this.areTimer > 0) return false;

        const newRot = (this.activePiece.rot + dir + 4) % 4;

        // 1. Basic Rotation
        if (this.canMove(0, 0, newRot)) {
            this.activePiece.rot = newRot;
            this.lockTimer = 0; // Reset lock timer on rotate
            this.onActivePieceUpdate?.();
            this.recordAction(dir === 1 ? 'rotateCW' : 'rotateCCW');
            return true;
        }

        // 2. Wall Kicks
        // Standard Puyo kicks: L/R then Up (for floor)
        const kicks = [
            { x: 1, y: 0 }, { x: -1, y: 0 },
            { x: 0, y: -1 }, // Kick up
            { x: 1, y: -1 }, { x: -1, y: -1 } // Diagonals
        ];

        for (const k of kicks) {
            if (this.canMove(k.x, k.y, newRot)) {
                this.activePiece.x += k.x;
                this.activePiece.y += k.y;
                this.activePiece.rot = newRot;
                this.lockTimer = 0; // Reset lock timer on rotate kick
                this.onActivePieceUpdate?.();
                this.recordAction(dir === 1 ? 'rotateCW' : 'rotateCCW');
                return true;
            }
        }

        // 3. Double Rotation (180 flip) fallback if stuck? 
        // Not standard Puyo, skipping.
        return false;
    }

    // --- Logic Implementation ---

    private spawnPiece() {
        this.garbageFellThisTurn = false; // Reset garbage flag for new turn
        // Create the piece immediately so it is visible
        if (!this.activePiece) {
            const next = this.nextPieces.shift()!;
            this.fillNextQueue();

            // Check Death Condition (blocked spawn point)
            // We check this BEFORE placing the new piece.
            // Death triggers when the topmost hidden row at the spawn column is occupied.
            // This allows players to stack into both hidden rows (0 and 1) as buffer,
            // and only die when there's absolutely no room left.
            const DEATH_COL = 2;
            const DEATH_ROW = 0; // Topmost row — 2 hidden rows of buffer above visible board
            if (this.board.grid[DEATH_COL][DEATH_ROW] !== PuyoColor.None) {
                this.changeState(GameState.GAMEOVER);
                return;
            }

            this.activePiece = {
                x: 2,
                y: -1, // Spawn "Invisibly Above"
                rot: 0,
                mainColor: next.main,
                subColor: next.sub
            };

            this.onPieceSpawn?.();

            this.stats.chainCount = 0;
            this.lockTimer = 0;
            this.dropTimer = 0;
            this.changeState(GameState.ACTIVE);

            // Soft Drop Protection
            // During replay, use recorded setting for determinism
            const softDropProtection = this.isReplaying ? this.replaySoftDropProtection : SettingsManager.softDropProtection;
            if (softDropProtection && this.softDrop) {
                this.softDropLocked = true;
            } else {
                this.softDropLocked = false;
            }

            // Reset Buffer Actions
            this.bufferAction = null;
            this.bufferedMove = 0;
        }

        // Handle ARE Delay
        if (this.areTimer > 0) {
            this.areTimer -= this.dt;
            if (this.areTimer > 0) {
                return; // Wait comfortably, active piece exists (visible) but frozen
            }
        }
    }

    private handleActiveState() {
        if (!this.activePiece) return;

        // Freeze logic if still in ARE (Spawn Delay)
        if (this.areTimer > 0) {
            this.areTimer -= this.dt; // Wait for ARE
            return;
        }

        // Gravity Calculation
        // Standard Puyo G = ~0.03G to ~1G depending on level.
        // Here we track frames per drop (currentDropDelay).
        // SDF (Soft Drop Factor) is a multiplier. 
        // If SDF is "Infinity" (Max), we instant drop? No, standard is just fast.

        let delay = this.currentDropDelay;

        // Unlock Soft Drop if key is released
        if (this.softDropLocked) {
            if (!this.softDrop) {
                this.softDropLocked = false;
            }
        }

        if (this.softDrop && !this.softDropLocked) {
            // SDF Logic: Drop speed = Base Speed * SDF
            // Delay = Base Delay / SDF
            // During replay, use recorded SDF for determinism
            const sdf = this.isReplaying ? this.replaySDF : SettingsManager.sdf;
            delay = Math.max(1, Math.floor(this.currentDropDelay / sdf));

            // If SDF is huge (infinity/40), we might want immediate ground.
            if (sdf >= 40) {
                delay = 0; // Instant
            }
        }

        this.dropTimer += this.dt;

        // Handle recursive dropping if speed > 1G (delay < 1)

        if (delay === 0) {
            // Sonic drop / Instant soft drop
            while (this.canMove(0, 1)) {
                this.activePiece.y += 1;
                // Score logic moved to lockPiece

                this.lockTimer = 0;
            }
            // Soft Drop should not lock immediately
            // Do not force lockTimer increment here. 
            // It will be handled by isTouchingGround naturally, but we ensure lockDelay is respected.
        } else if (this.dropTimer >= delay) {
            this.dropTimer = 0;
            if (this.canMove(0, 1)) {
                this.activePiece.y += 1;
                // Score logic moved to lockPiece

                this.lockTimer = 0;
            }
        }

        if (this.isTouchingGround()) {
            // Soft Drop Protection Buffer:
            // If soft drop is locked (meaning user is holding Down from previous piece),
            // we PAUSE the lock timer. This prevents "instakill" if spawning on top of stack.
            // The user must release Down (clearing softDropLocked) to start the locking pressure
            // or explicitly move/rotate (which resets lockTimer).

            // Updates: "Sticky Logic" / "intelligent buffer".
            // If user is holding a horizontal movement key (Left/Right), they are likely trying 
            // to "glide" over the stack or slide into a hole.
            // In this case, we should grant generous time (intelligent buffer) by pausing lockTimer,
            // UNLESS they are also holding Soft Drop (intent to lock) without protection.

            // Flag: Are we "Gliding"?
            // Gliding = Horizontal Held AND NOT (Soft Drop Active AND NOT Locked).
            // If Soft Drop is Active (and valid, not locked), it overrides gliding (User wants down/lock).

            const intentToLock = this.softDrop && !this.softDropLocked;

            if (intentToLock) {
                // User requested: "locking it in unless you softdrop" -> Implicitly means Soft Drop overrides buffer.
                // If soft drop is pressed against the ground, we lock immediately (or very fast).
                this.lockPiece();
                return;
            }

            // During replay, we can't know held-key state, so disable glide buffer.
            // Inputs still reset lockTimer on moves, keeping timing close enough.
            const isGliding = this.isReplaying ? false : this.horizontalMoveHeld;

            let shouldIncrement = true;
            if (this.softDropLocked) shouldIncrement = false;
            // "Intelligent buffer": Pause lock timer if gliding
            if (isGliding) shouldIncrement = false;

            if (shouldIncrement) {
                this.lockTimer += this.dt;
            }

            if (this.lockTimer > this.lockDelay) {
                this.lockPiece();
            }
        }
    }

    public getSubPos(x: number, y: number, rot: number) {
        const offsets = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
        return {
            x: x + offsets[rot].x,
            y: y + offsets[rot].y
        };
    }

    private lockPiece() {
        if (!this.activePiece) return;
        const { x, y, rot, subColor } = this.activePiece;
        const sub = this.getSubPos(x, y, rot);

        // Handle Negative Y (Top Out)
        // User reports "instantly lose" on specific piece configuration.
        // If y is -1 (main) and sub is 0 (or vice versa), and we lock...
        // Strictly speaking, if ANY part of the piece is off-board (<0) when locking, it's a Top Out.
        // BUT, the user wants "always giving you an opportunity".
        // If the piece is physically blocked from entering the board at spawn (stack is too high),
        // and the user fails to move it, it locks AT spawn height (y=-1).

        // However, if the stack is at row 0 (top hidden), we spawn at -1.
        // Gravity pulls it to 0. It hits stack. It stays at -1. lockTimer starts.
        // User moves. If they can't find a hole, lockTimer expires.
        // Then lockPiece called at y=-1.
        // This check triggers "Game Over: Locked above board".

        // The user says "logical condition causing this piece to always make you instantly lose".
        // It's likely this check.
        // If we allow locking at y < 0, what happens?
        // We can't write to board.grid[x][-1]. It crashes.
        // So we MUST lose if we lock up there.

        // UNLESS the problem is we are locking TOO FAST?
        // We handled that with buffer.

        // DEATH CONDITION: "If you place at least one puyo over the red grid"
        // Red Grid is the spawn point (Col 2). If we lock and the spawn point at Row 2 (Visible Top)
        // or Row 1 (Hidden) is occupied, game over?
        // Actually, let's just use the classic Puyo Rule:
        // If the X (Column 3, Row 12, or Row 0 in our logic) is filled.
        // We'll check if our lock position interacts with the danger zone.

        // Calculate Drop Bonus (Placement Score)
        // Fixed score (10) + Drop Bonus (1 per row)
        // "All pieces dropped ... should give fixed score" + Exponential combos.
        // We ensure a minimum fixed score of 10 for locking, plus the height bonus.
        const dropBonus = Math.max(0, y + 1);
        this.stats.score += 10 + dropBonus;
        this.onScoreChange?.(this.stats.score);


        // We write the piece to the board first.
        const main = this.activePiece.mainColor;
        // const sub = this.activePiece.subColor; // already calc above

        // Validate Board Bounds before writing
        if (!this.board.isValid(x, y) || !this.board.isValid(sub.x, sub.y)) {
            console.warn("Attempted to lock out of bounds?");
            // Only if y < 0. If y >= 0, isValid is true.
            // If y < 0, we can't write -> Game Over.
            this.changeState(GameState.GAMEOVER);
            return;
        }

        this.board.grid[x][y] = main;
        this.board.grid[sub.x][sub.y] = subColor;
        this.board.handleBigPuyo(x, y);
        this.board.handleBigPuyo(sub.x, sub.y);

        // Notify renderer of landed cells for animation
        this.onPieceLock?.([{ c: x, r: y }, { c: sub.x, r: sub.y }]);

        // Broadcast board state immediately on piece lock (critical for MP sync)
        this.onBoardChange?.();

        this.activePiece = null;
        this.softDrop = false; // Reset input flag
        this.softDropLocked = false;

        // PPT Death Condition:
        // In Puyo Puyo Tetris, you die if you lock a piece where any part occupies
        // the X cell (column 2, row 0 - the spawn point).
        // Row 0 is the first hidden row where the X marker sits.

        // Trigger chain check
        this.chainGroup = [];
        this.dropTimer = 0;
        this.changeState(GameState.FALLING);
    }

    private handleFallingState() {
        if (this.stateTimer === 0) {
            // Predict falling pieces
            this.fallingDestinations = this.board.getFallingDestinations();

            if (this.fallingDestinations.length === 0) {
                // Nothing to fall, move on immediately
                // However, we must call applyGravity just in case Board state has hidden floaters?
                // getFallingDestinations essentially does the same check.
                // If empty, nothing moves.
                this.changeState(GameState.CHECK_MATCH);
                return;
            }
        }

        this.stateTimer += this.dt;
        // Scale fall delay based on chain count (exponential slowdown for emphasis)

        const scaledDelay = this.getChainScaledDuration(this.FALL_STEP_DELAY);

        if (this.stateTimer > scaledDelay) {
            this.stateTimer = 0;
            // Capture landing destinations before clearing
            const landed = this.fallingDestinations.map(f => ({ c: f.c, r: f.destR }));
            this.fallingDestinations = []; // Clear visual cache
            const fell = this.board.applyGravity();
            // Should always fall if destinations > 0, but good to check return
            if (!fell) {
                this.changeState(GameState.CHECK_MATCH);
            } else {
                // Notify renderer of landed cells for jiggle
                if (landed.length > 0) this.onGravityLanded?.(landed);
                // Gravity applied, layout changed.
                // MUST sync with network so opponent sees pieces fall.
                this.onBoardChange?.();
                this.changeState(GameState.CHECK_MATCH);
            }
        }
    }

    private handlePopAnim() {
        this.stateTimer += this.dt;
        // Scale pop animation duration based on chain count (exponential slowdown for emphasis)

        const scaledDuration = this.getChainScaledDuration(this.POP_ANIM_DURATION);
        if (this.stateTimer >= scaledDuration) {
            // Remove puyos
            for (const group of this.matchedPuyos) {
                for (const p of group) {
                    this.board.grid[p.c][p.r] = PuyoColor.None;
                }
            }
            this.matchedPuyos = [];
            this.stateTimer = 0;
            this.onBoardChange?.();
            this.changeState(GameState.FALLING); // Gravity again after pop
        }
    }

    // In GameEngine class properties
    public onScoreChange?: (score: number) => void;

    private handleGarbageFall() {
        this.garbageFellThisTurn = true; // Mark as fallen this turn

        // Calculate rocks available to fall from the committed queue
        const totalRocks = this.garbageQueue;
        // Cap at 4 rows (24 rocks) per turn - excess stays in queue for next garbage fall
        const MAX_ROCKS_PER_TURN = COLS * 4; // 6 cols * 4 rows = 24
        const amount = Math.min(totalRocks, MAX_ROCKS_PER_TURN);

        if (amount <= 0) {
            this.changeState(GameState.SPAWN);
            if (this.areTimer === 0) this.spawnPiece();
            return;
        }

        // Determine columns
        const fullRows = Math.floor(amount / COLS);
        const remainder = amount % COLS;

        const dropsPerCol = new Array(COLS).fill(fullRows);
        const cols = [0, 1, 2, 3, 4, 5];
        // Shuffle
        for (let i = cols.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [cols[i], cols[j]] = [cols[j], cols[i]];
        }
        for (let i = 0; i < remainder; i++) {
            dropsPerCol[cols[i]]++;
        }

        // Deduct rocks from queue
        this.garbageQueue -= amount;

        // Prepare Animation
        this.fallingGarbage = [];

        for (let c = 0; c < COLS; c++) {
            const count = dropsPerCol[c];
            if (count === 0) continue;

            // Find destination rows
            let r = TOTAL_ROWS - 1;
            let placed = 0;
            const dests: number[] = [];

            while (r >= 0 && placed < count) {
                if (this.board.grid[c][r] === PuyoColor.None) {
                    dests.push(r);
                    placed++;
                }
                r--; // Decrement row (Search Upwards)
            }
            // dests is [12, 11, 10...] (scanned bottom-up).
            // i=0 -> destR=12 (Bottom). Delay 0. Correct.

            // Create animation entities
            // Start from y = -1 (just above hidden row) upwards
            for (let i = 0; i < dests.length; i++) {
                this.fallingGarbage.push({
                    c: c,
                    r: -2 - i * 1, // Compact start height
                    destR: dests[i],
                    delay: 0 // INSTANT START - No stagger delay
                });
            }
        }

        if (this.fallingGarbage.length > 0 && !this.isReplaying) {
            SoundManager.play('tinygarbage');
        }
    }

    private handleGarbageAnimation() {
        // Falling Logic
        let allDone = true;

        const speed = 1.5; // rows per frame — smooth visible fall

        for (const garb of this.fallingGarbage) {
            if (garb.delay > 0) {
                garb.delay -= this.dt;
                allDone = false;
                continue;
            }

            if (garb.r < garb.destR) {
                garb.r += speed * this.dt;
                allDone = false;
                if (garb.r >= garb.destR) {
                    garb.r = garb.destR; // Snap
                }
            }
        }

        if (allDone) {
            // Commit to board
            for (const garb of this.fallingGarbage) {
                this.board.grid[garb.c][garb.destR] = PuyoColor.Garbage;
            }
            this.fallingGarbage = [];

            // Play sound if not played yet? (Played in handleGarbageFall)

            this.onBoardChange?.();
            this.changeState(GameState.FALLING); // Run gravity check just in case
        } else {
            // Let renderer know to redraw animation
            this.onBoardChange?.();
        }
    }



    private handleCheckMatch() {
        const matches = this.board.findMatches();
        if (matches.length > 0) {
            // Identify adjacent garbage (cleared along with matches)
            const garbage = this.board.findNeighborGarbage(matches);

            this.calculateScore(matches); // Pass only color matches

            // Add garbage to list for removal animation
            if (garbage.length > 0) {
                matches.push(garbage);
            }

            this.matchedPuyos = matches;
            this.stats.chainCount++;

            this.onChainStep?.(this.stats.chainCount);
            // Don't play sounds from engine during replay — ReplayScene hooks handle audio
            if (!this.isReplaying) {
                SoundManager.playCombo(this.stats.chainCount);
            }

            this.changeState(GameState.POP_ANIM);
        } else {
            // Chain End — check for All Clear (board empty)
            if (this.stats.chainCount > 0) {
                let boardEmpty = true;
                for (let c = 0; c < COLS && boardEmpty; c++) {
                    for (let r = 0; r < TOTAL_ROWS; r++) {
                        if (this.board.grid[c][r] !== PuyoColor.None) { boardEmpty = false; break; }
                    }
                }
                if (boardEmpty) {
                    this.onAllClear?.();
                }
            }

            // Convert remaining nuisance in tray to committed garbage
            if (this.nuisanceTray > 0) {
                // Convert Nuisance Points to Rocks
                const rocks = Math.floor(this.nuisanceTray / 70);

                if (rocks > 0) {
                    this.garbageQueue += rocks;
                    this.nuisanceTray -= rocks * 70;
                }
            }

            if (this.garbageQueue > 0 && !this.garbageFellThisTurn) {
                this.changeState(GameState.GARBAGE_FALL);
            } else {
                this.changeState(GameState.SPAWN);
                if (this.areTimer === 0) {
                    this.spawnPiece();
                }
            }
        }
    }

    // --- Scoring & Garbage Calc ---

    private calculateScore(matches: { c: number, r: number }[][]) {
        // Classic Puyo Formula:
        // Score = (10 * PC) * (CP + CB + GB + 1)

        let puyoCount = 0;
        let colorList = new Set<PuyoColor>();
        let groupBonus = 0;

        for (const group of matches) {
            puyoCount += group.length;

            // Color Bonus
            if (group.length > 0) {
                const c = this.board.grid[group[0].c][group[0].r];
                colorList.add(c);
            }

            // Group Bonus check
            if (group.length > 4) groupBonus += (group.length - 3);
        }

        const cp = this.getChainPower(this.stats.chainCount);
        const cb = this.getColorBonus(colorList.size);

        const multiplier = Math.max(1, cp + cb + groupBonus);
        const stepScore = (puyoCount * 10) * multiplier;

        this.stats.score += stepScore;
        this.onScoreChange?.(this.stats.score); // Notify Listener

        this.stats.puyosCleared += puyoCount;

        // Current forming chain is chainCount + 1 (since chainCount is 0-indexed here before increment)
        if (this.stats.chainCount + 1 > this.stats.maxChain) {
            this.stats.maxChain = this.stats.chainCount + 1;
        }

        // Garbage Calculation
        // 70 points = 1 garbage
        // Offset Logic (Point Based)
        let generatedPoints = stepScore + this.scoreRemainder;

        // Offset against Nuisance Tray (Points)
        if (this.nuisanceTray > 0) {
            const offsetAmount = Math.min(generatedPoints, this.nuisanceTray);
            this.nuisanceTray -= offsetAmount;
            generatedPoints -= offsetAmount;

            if (offsetAmount >= 70) {
                this.onGarbageOffset?.(Math.floor(offsetAmount / 70));
            }
        }

        // Calculate Rocks to Send from remaining points
        const rocksToSend = Math.floor(generatedPoints / 70);
        this.scoreRemainder = generatedPoints % 70;

        if (rocksToSend > 0) {
            // Play Garbage Sound (suppress during replay - scene hooks handle audio)
            if (!this.isReplaying) {
                if (rocksToSend >= 15) SoundManager.play('hugegarbage');
                else SoundManager.play('tinygarbage');
            }

            this.stats.garbageSent += rocksToSend;
            this.onGarbageGenerated?.(rocksToSend);
        }
    }

    // handleGarbageGeneration is deprecated/inlined above
    // handleGarbageGeneration is deprecated/inlined above



    private getChainPower(chain: number): number {
        // Exponential table (Powers of 2 * 10 approx)
        // 1: 0 (No bonus for 1 chain? Standard Puyo is 0 or 8. Let's make it start strong)
        // User wants "exponentially more".
        // Sequence: 0, 8, 16, 32, 64, 128, 256, 512, 1024, 2048...
        const table = [0, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
        return table[Math.min(chain, table.length - 1)] || 0;
    }

    private getColorBonus(colors: number): number {
        if (colors <= 1) return 0;
        return (colors - 1) * 3;
    }

    // --- Helpers ---

    public getChainScaledDuration(baseDuration: number): number {
        // Exponential scaling: each chain step adds progressively more delay
        // Chain 1: 1x, Chain 2: 1.3x, Chain 3: 1.7x, Chain 4: 2.3x, Chain 5: 3.1x, etc.
        // Formula: baseDuration * (1 + 0.3 * (1.3^(chainCount - 1)))

        // Puyo Tsu Style: First chain is slower/pronounced to show start of combo
        if (this.stats.chainCount <= 1) return baseDuration * 2; // ~36 frames (600ms)

        const multiplier = 1 + 0.3 * Math.pow(1.3, this.stats.chainCount - 1);
        return Math.floor(baseDuration * multiplier);
    }

    private fillNextQueue() {
        while (this.nextPieces.length < 3) {
            if (this.currentBag.length === 0) {
                this.currentBag = this.generateBag(false);
            }
            this.nextPieces.push(this.currentBag.shift()!);
        }
    }

    private canMove(dx: number, dy: number, newRot?: number): boolean {
        if (!this.activePiece) return false;
        const rot = newRot ?? this.activePiece.rot;
        const nx = this.activePiece.x + dx;
        const ny = this.activePiece.y + dy;

        if (!this.isValid(nx, ny)) return false;

        const sub = this.getSubPos(nx, ny, rot);
        if (!this.isValid(sub.x, sub.y)) return false;

        return true;
    }

    private isValid(c: number, r: number) {
        if (c < 0 || c >= COLS) return false;

        // Puyo Tetris Style / Tetrio Style "Sky" logic:
        // You can maneuver freely in the "vanish zone" (negative rows).
        // Standard Puyo usually blocks X movement if ANY block is in the hidden row.
        // But user specifically requested "Tetrio style where it lets you move past it when the piece is still above".

        // So: If r < 0, we generally say it's valid...
        // UNLESS there is a "ceiling" at some point? No ceiling.
        if (r < 0) return true; // Valid empty space above board

        if (r >= TOTAL_ROWS) return false; // Floor
        return this.board.grid[c][r] === PuyoColor.None;
    }

    private isTouchingGround(): boolean {
        if (!this.activePiece) return false;
        // Check if moving down 1 is invalid
        return !this.canMove(0, 1);
    }



    public changeState(newState: GameState) {
        this.state = newState;
        this.stateTimer = 0;
        this.onStateChange?.(newState);
    }

    // ═══ V3 Replay: Board Hash (FNV-1a) for periodic state validation ═══
    // Must produce identical output to server PuyoSimulator.computeBoardHash()
    computeBoardHash(): string {
        let hash = 0x811c9dc5; // FNV offset basis
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                hash ^= this.board.grid[c][r];
                hash = Math.imul(hash, 0x01000193); // FNV prime
            }
        }
        // Include score and garbage state for full validation
        hash ^= this.stats.score;
        hash = Math.imul(hash, 0x01000193);
        hash ^= this.garbageQueue;
        hash = Math.imul(hash, 0x01000193);
        hash ^= this.nuisanceTray;
        hash = Math.imul(hash, 0x01000193);
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    /** Expose current PRNG state for debugging */
    getSeed(): number {
        return this.seed;
    }
}
