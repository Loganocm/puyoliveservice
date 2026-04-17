// ═══════════════════════════════════════════════════════════════════════════════
// PuyoSimulator — Server-authoritative Puyo game simulation
// Deterministic engine for anti-cheat: no rendering, no sound.
// Must match client GameEngine logic exactly for frame-perfect determinism.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Constants (must match client Constants.ts) ──
const COLS = 6;
const HIDDEN_ROWS = 2;
const TOTAL_ROWS = 12 + HIDDEN_ROWS; // 14

const PuyoColor = {
  None: 0,
  Red: 1,
  Green: 2,
  Blue: 3,
  Yellow: 4,
  Purple: 5,
  Garbage: 6,
} as const;

const SimState = {
  SPAWN: 0,
  ACTIVE: 1,
  FALLING: 2,
  CHECK_MATCH: 3,
  POP_ANIM: 4,
  GARBAGE_FALL: 5,
  GAMEOVER: 6,
} as const;
type SimState = (typeof SimState)[keyof typeof SimState];

// ── Board ──
class SimBoard {
  grid: number[][];

  constructor() {
    this.grid = [];
    for (let c = 0; c < COLS; c++) {
      this.grid[c] = new Array(TOTAL_ROWS).fill(PuyoColor.None);
    }
  }

  isValid(c: number, r: number): boolean {
    return c >= 0 && c < COLS && r >= 0 && r < TOTAL_ROWS;
  }

  applyGravity(): boolean {
    let fell = false;
    for (let c = 0; c < COLS; c++) {
      let writeRow = TOTAL_ROWS - 1;
      for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
        if (this.grid[c][r] !== PuyoColor.None) {
          if (r !== writeRow) {
            this.grid[c][writeRow] = this.grid[c][r];
            this.grid[c][r] = PuyoColor.None;
            fell = true;
          }
          writeRow--;
        }
      }
    }
    return fell;
  }

  getFallingDestinations(): { c: number; r: number; destR: number }[] {
    const falling: { c: number; r: number; destR: number }[] = [];
    for (let c = 0; c < COLS; c++) {
      let writeRow = TOTAL_ROWS - 1;
      for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
        if (this.grid[c][r] !== PuyoColor.None) {
          if (r !== writeRow) {
            falling.push({ c, r, destR: writeRow });
          }
          writeRow--;
        }
      }
    }
    return falling;
  }

  findMatches(): { c: number; r: number }[][] {
    const visited: boolean[][] = [];
    for (let c = 0; c < COLS; c++) visited[c] = [];

    const matches: { c: number; r: number }[][] = [];

    for (let c = 0; c < COLS; c++) {
      for (let r = 1; r < TOTAL_ROWS; r++) {
        if (
          this.grid[c][r] === PuyoColor.None ||
          this.grid[c][r] === PuyoColor.Garbage
        )
          continue;
        if (visited[c][r]) continue;

        const group = this.floodFill(c, r, visited, this.grid[c][r]);
        if (group.length >= 4) {
          matches.push(group);
        }
      }
    }
    return matches;
  }

  private floodFill(
    c: number,
    r: number,
    visited: boolean[][],
    color: number,
  ): { c: number; r: number }[] {
    const queue = [{ c, r }];
    const group: { c: number; r: number }[] = [];
    visited[c][r] = true;

    while (queue.length > 0) {
      const current = queue.pop()!;
      group.push(current);

      const neighbors = [
        { c: current.c + 1, r: current.r },
        { c: current.c - 1, r: current.r },
        { c: current.c, r: current.r + 1 },
        { c: current.c, r: current.r - 1 },
      ];

      for (const n of neighbors) {
        if (
          this.isValid(n.c, n.r) &&
          !visited[n.c][n.r] &&
          this.grid[n.c][n.r] === color
        ) {
          visited[n.c][n.r] = true;
          queue.push(n);
        }
      }
    }
    return group;
  }

  findNeighborGarbage(
    matches: { c: number; r: number }[][],
  ): { c: number; r: number }[] {
    const garbage: { c: number; r: number }[] = [];
    const seen = new Set<string>();

    for (const group of matches) {
      for (const p of group) {
        const neighbors = [
          { c: p.c + 1, r: p.r },
          { c: p.c - 1, r: p.r },
          { c: p.c, r: p.r + 1 },
          { c: p.c, r: p.r - 1 },
        ];
        for (const n of neighbors) {
          if (
            this.isValid(n.c, n.r) &&
            this.grid[n.c][n.r] === PuyoColor.Garbage
          ) {
            const key = `${n.c},${n.r}`;
            if (!seen.has(key)) {
              seen.add(key);
              garbage.push(n);
            }
          }
        }
      }
    }
    return garbage;
  }
}

// ── Simulator ──

export class PuyoSimulator {
  board: SimBoard;
  state: SimState = SimState.SPAWN;

  private seed: number;

  // Active piece
  activePiece: {
    x: number;
    y: number;
    rot: number;
    mainColor: number;
    subColor: number;
  } | null = null;

  nextPieces: { main: number; sub: number }[] = [];

  stats = {
    score: 0,
    chainCount: 0,
    maxChain: 0,
    puyosCleared: 0,
    garbageSent: 0,
    garbageReceived: 0,
  };

  // Garbage system
  private scoreRemainder = 0;
  garbageQueue = 0;
  nuisanceTray = 0;
  private garbageFellThisTurn = false;

  // Timers (frame-based, dt = 1 per tick)
  frameCount = 0;
  private dropTimer = 0;
  private lockTimer = 0;
  private stateTimer = 0;

  // Fixed settings (must match client defaults for determinism)
  private readonly currentDropDelay = 60;
  private readonly lockDelay = 30;
  private readonly POP_ANIM_DURATION = 18;
  private readonly FALL_STEP_DELAY = 10;
  private readonly sdf = 10; // Soft Drop Factor (matches SettingsManager default)
  private readonly softDropProtection = true;

  // Input state
  private _softDrop = false;
  private softDropLocked = false;

  // Matching data (held during POP_ANIM state)
  private matchedPuyos: { c: number; r: number }[][] = [];

  // Garbage animation tracking (must match client timing)
  private fallingGarbage: {
    c: number;
    r: number;
    destR: number;
    delay: number;
  }[] = [];

  // Bag system
  private currentBag: { main: number; sub: number }[] = [];

  // ── Events (set by server for integration) ──
  onGarbageGenerated?: (amount: number) => void;
  onGarbageOffset?: (amount: number) => void;

  constructor(seed: number) {
    this.seed = seed;
    this.board = new SimBoard();

    // Warmup PRNG — must match client (4 calls)
    this.random();
    this.random();
    this.random();
    this.random();

    // Generate initial bag
    this.currentBag = this.generateBag(true);
    this.fillNextQueue();
  }

  // Mulberry32 PRNG — must be identical to client
  private random(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private generateBag(
    isStartBag: boolean,
  ): { main: number; sub: number }[] {
    const bag: { main: number; sub: number }[] = [];
    const colors = [
      PuyoColor.Red,
      PuyoColor.Green,
      PuyoColor.Blue,
      PuyoColor.Yellow,
      PuyoColor.Purple,
    ];

    if (isStartBag) {
      // Start bag: balanced shuffle — 4 of each color, 6 pairs
      const pool: number[] = [];
      for (const c of colors) {
        for (let k = 0; k < 4; k++) pool.push(c);
      }

      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      for (let i = 0; i < 6; i++) {
        let m = pool[i * 2];
        let s = pool[i * 2 + 1];

        // Enforce no doubles for first 2 hands
        if (i < 2 && m === s) {
          const k = i * 2 + 1;
          let attempts = 0;
          while (m === s && attempts < 10) {
            const swapIdx =
              i * 2 +
              2 +
              Math.floor(this.random() * (pool.length - (i * 2 + 2)));
            if (swapIdx < pool.length) {
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

    // Main game: deck of pairs (5×5×4 = 100 pairs)
    const deck: { main: number; sub: number }[] = [];
    for (const m of colors) {
      for (const s of colors) {
        for (let k = 0; k < 4; k++) {
          deck.push({ main: m, sub: s });
        }
      }
    }

    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private fillNextQueue() {
    while (this.nextPieces.length < 3) {
      if (this.currentBag.length === 0) {
        this.currentBag = this.generateBag(false);
      }
      this.nextPieces.push(this.currentBag.shift()!);
    }
  }

  // ═══ Main Loop (called once per frame via tick_frame) ═══

  update() {
    this.frameCount++;

    switch (this.state) {
      case SimState.SPAWN:
        this.spawnPiece();
        break;
      case SimState.ACTIVE:
        this.handleActiveState();
        break;
      case SimState.FALLING:
        this.handleFallingState();
        break;
      case SimState.CHECK_MATCH:
        this.handleCheckMatch();
        break;
      case SimState.POP_ANIM:
        this.handlePopAnim();
        break;
      case SimState.GARBAGE_FALL:
        if (this.fallingGarbage.length > 0) {
          this.handleGarbageAnimation();
        } else {
          this.handleGarbageFall();
        }
        break;
    }
  }

  // ═══ Input Interface (called from record_input events) ═══

  executeInput(input: { i: string; a?: number }) {
    switch (input.i) {
      case 'L':
        this.movePiece(-1);
        break;
      case 'R':
        this.movePiece(1);
        break;
      case 'CW':
        this.rotate(1);
        break;
      case 'CC':
        this.rotate(-1);
        break;
      case 'SD':
        this._softDrop = true;
        break;
      case 'SU':
        this._softDrop = false;
        break;
      case 'HD':
        this.hardDrop();
        break;
      case 'G':
        if (input.a) this.addGarbage(input.a);
        break;
    }
  }

  // ═══ Actions ═══

  private movePiece(dx: number): boolean {
    if (!this.activePiece) return false;
    if (this.canMove(dx, 0)) {
      this.activePiece.x += dx;
      this.lockTimer = 0;
      return true;
    }
    return false;
  }

  private hardDrop(): boolean {
    if (this.state !== SimState.ACTIVE || !this.activePiece) return false;

    let dropped = 0;
    while (this.canMove(0, 1)) {
      this.activePiece.y += 1;
      dropped++;
    }

    this.lockPiece();
    if (dropped > 0) {
      this.stats.score += dropped;
    }
    return true;
  }

  private rotate(dir: 1 | -1): boolean {
    if (this.state !== SimState.ACTIVE || !this.activePiece) return false;

    const newRot = (this.activePiece.rot + dir + 4) % 4;

    // Basic rotation
    if (this.canMove(0, 0, newRot)) {
      this.activePiece.rot = newRot;
      this.lockTimer = 0;
      return true;
    }

    // Wall kicks (must match client exactly)
    const kicks = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
    ];

    for (const k of kicks) {
      if (this.canMove(k.x, k.y, newRot)) {
        this.activePiece.x += k.x;
        this.activePiece.y += k.y;
        this.activePiece.rot = newRot;
        this.lockTimer = 0;
        return true;
      }
    }

    return false;
  }

  addGarbage(amount: number) {
    this.nuisanceTray += amount * 70;
    this.stats.garbageReceived += amount;
  }

  // ═══ State Machine ═══

  private spawnPiece() {
    this.garbageFellThisTurn = false;

    if (!this.activePiece) {
      const next = this.nextPieces.shift()!;
      this.fillNextQueue();

      // Death check: grid[2][0] blocked (topmost row — allows 2 hidden buffer rows)
      const DEATH_COL = 2;
      const DEATH_ROW = 0;
      if (this.board.grid[DEATH_COL][DEATH_ROW] !== PuyoColor.None) {
        this.changeState(SimState.GAMEOVER);
        return;
      }

      this.activePiece = {
        x: 2,
        y: -1, // Spawn above board
        rot: 0,
        mainColor: next.main,
        subColor: next.sub,
      };

      this.stats.chainCount = 0;
      this.lockTimer = 0;
      this.dropTimer = 0;
      this.changeState(SimState.ACTIVE);

      // Soft drop protection
      if (this.softDropProtection && this._softDrop) {
        this.softDropLocked = true;
      } else {
        this.softDropLocked = false;
      }
    }
  }

  private handleActiveState() {
    if (!this.activePiece) return;

    let delay = this.currentDropDelay;

    // Unlock soft drop on release
    if (this.softDropLocked && !this._softDrop) {
      this.softDropLocked = false;
    }

    if (this._softDrop && !this.softDropLocked) {
      delay = Math.max(1, Math.floor(this.currentDropDelay / this.sdf));
      if (this.sdf >= 40) delay = 0;
    }

    this.dropTimer += 1;

    if (delay === 0) {
      // Sonic/instant soft drop
      while (this.canMove(0, 1)) {
        this.activePiece.y += 1;
        this.lockTimer = 0;
      }
    } else if (this.dropTimer >= delay) {
      this.dropTimer = 0;
      if (this.canMove(0, 1)) {
        this.activePiece.y += 1;
        this.lockTimer = 0;
      }
    }

    if (this.isTouchingGround()) {
      const intentToLock = this._softDrop && !this.softDropLocked;
      if (intentToLock) {
        this.lockPiece();
        return;
      }

      let shouldIncrement = true;
      if (this.softDropLocked) shouldIncrement = false;
      // Note: horizontalMoveHeld (gliding buffer) is not tracked server-side.
      // This may cause lock timing to differ by a few frames in rare edge cases.
      // The server is authoritative regardless.

      if (shouldIncrement) {
        this.lockTimer += 1;
      }

      if (this.lockTimer > this.lockDelay) {
        this.lockPiece();
      }
    }
  }

  private getSubPos(x: number, y: number, rot: number) {
    const offsets = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    return { x: x + offsets[rot].x, y: y + offsets[rot].y };
  }

  private lockPiece() {
    if (!this.activePiece) return;
    const { x, y, rot, mainColor, subColor } = this.activePiece;
    const sub = this.getSubPos(x, y, rot);

    // Drop bonus (matches client lockPiece)
    const dropBonus = Math.max(0, y + 1);
    this.stats.score += 10 + dropBonus;

    // Validate bounds — out-of-bounds lock = death
    if (!this.board.isValid(x, y) || !this.board.isValid(sub.x, sub.y)) {
      this.changeState(SimState.GAMEOVER);
      return;
    }

    this.board.grid[x][y] = mainColor;
    this.board.grid[sub.x][sub.y] = subColor;

    this.activePiece = null;
    this._softDrop = false;
    this.softDropLocked = false;

    this.dropTimer = 0;
    this.changeState(SimState.FALLING);
  }

  private handleFallingState() {
    if (this.stateTimer === 0) {
      const destinations = this.board.getFallingDestinations();
      if (destinations.length === 0) {
        this.changeState(SimState.CHECK_MATCH);
        return;
      }
    }

    this.stateTimer += 1;
    const scaledDelay = this.getChainScaledDuration(this.FALL_STEP_DELAY);

    if (this.stateTimer > scaledDelay) {
      this.stateTimer = 0;
      this.board.applyGravity();
      this.changeState(SimState.CHECK_MATCH);
    }
  }

  private handlePopAnim() {
    this.stateTimer += 1;
    const scaledDuration = this.getChainScaledDuration(this.POP_ANIM_DURATION);

    if (this.stateTimer >= scaledDuration) {
      // Remove matched puyos from board
      for (const group of this.matchedPuyos) {
        for (const p of group) {
          this.board.grid[p.c][p.r] = PuyoColor.None;
        }
      }
      this.matchedPuyos = [];
      this.stateTimer = 0;
      this.changeState(SimState.FALLING);
    }
  }

  private handleCheckMatch() {
    const matches = this.board.findMatches();

    if (matches.length > 0) {
      const garbage = this.board.findNeighborGarbage(matches);
      this.calculateScore(matches);

      // Include garbage puyos in removal list
      if (garbage.length > 0) {
        matches.push(garbage);
      }

      this.matchedPuyos = matches;
      this.stats.chainCount++;

      this.changeState(SimState.POP_ANIM);
    } else {
      // Chain ended — all clear check
      if (this.stats.chainCount > 0) {
        let boardEmpty = true;
        outer: for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < TOTAL_ROWS; r++) {
            if (this.board.grid[c][r] !== PuyoColor.None) {
              boardEmpty = false;
              break outer;
            }
          }
        }
        // All clear bonus could be handled here if needed
        void boardEmpty;
      }

      // Convert nuisance tray to committed garbage queue
      if (this.nuisanceTray > 0) {
        const rocks = Math.floor(this.nuisanceTray / 70);
        if (rocks > 0) {
          this.garbageQueue += rocks;
          this.nuisanceTray -= rocks * 70;
        }
      }

      if (this.garbageQueue > 0 && !this.garbageFellThisTurn) {
        this.changeState(SimState.GARBAGE_FALL);
      } else {
        this.changeState(SimState.SPAWN);
        this.spawnPiece();
      }
    }
  }

  private handleGarbageFall() {
    this.garbageFellThisTurn = true;

    const totalRocks = this.garbageQueue;
    const MAX_ROCKS_PER_TURN = COLS * 4; // 24
    const amount = Math.min(totalRocks, MAX_ROCKS_PER_TURN);

    if (amount <= 0) {
      this.changeState(SimState.SPAWN);
      this.spawnPiece();
      return;
    }

    // Distribute garbage across columns (must match client RNG usage)
    const fullRows = Math.floor(amount / COLS);
    const remainder = amount % COLS;
    const dropsPerCol = new Array(COLS).fill(fullRows);

    const cols = [0, 1, 2, 3, 4, 5];
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    for (let i = 0; i < remainder; i++) {
      dropsPerCol[cols[i]]++;
    }

    this.garbageQueue -= amount;

    // Create falling garbage entries (animation timing must match client)
    this.fallingGarbage = [];
    for (let c = 0; c < COLS; c++) {
      const count = dropsPerCol[c];
      if (count === 0) continue;

      let r = TOTAL_ROWS - 1;
      let placed = 0;
      const dests: number[] = [];

      while (r >= 0 && placed < count) {
        if (this.board.grid[c][r] === PuyoColor.None) {
          dests.push(r);
          placed++;
        }
        r--;
      }

      for (let i = 0; i < dests.length; i++) {
        this.fallingGarbage.push({
          c: c,
          r: -2 - i * 1,
          destR: dests[i],
          delay: 0,
        });
      }
    }
  }

  private handleGarbageAnimation() {
    const speed = 1.5; // rows per frame — must match client
    let allDone = true;

    for (const garb of this.fallingGarbage) {
      if (garb.delay > 0) {
        garb.delay -= 1;
        allDone = false;
        continue;
      }
      if (garb.r < garb.destR) {
        garb.r += speed;
        allDone = false;
        if (garb.r >= garb.destR) {
          garb.r = garb.destR;
        }
      }
    }

    if (allDone) {
      // Commit garbage to board
      for (const garb of this.fallingGarbage) {
        this.board.grid[garb.c][garb.destR] = PuyoColor.Garbage;
      }
      this.fallingGarbage = [];
      this.changeState(SimState.FALLING);
    }
  }

  // ═══ Scoring & Garbage ═══

  private calculateScore(matches: { c: number; r: number }[][]) {
    let puyoCount = 0;
    const colorList = new Set<number>();
    let groupBonus = 0;

    for (const group of matches) {
      puyoCount += group.length;
      if (group.length > 0) {
        colorList.add(this.board.grid[group[0].c][group[0].r]);
      }
      if (group.length > 4) groupBonus += group.length - 3;
    }

    const cp = this.getChainPower(this.stats.chainCount);
    const cb = this.getColorBonus(colorList.size);
    const multiplier = Math.max(1, cp + cb + groupBonus);
    const stepScore = puyoCount * 10 * multiplier;

    this.stats.score += stepScore;
    this.stats.puyosCleared += puyoCount;

    if (this.stats.chainCount + 1 > this.stats.maxChain) {
      this.stats.maxChain = this.stats.chainCount + 1;
    }

    // Garbage calculation: 70 points = 1 rock
    let generatedPoints = stepScore + this.scoreRemainder;

    // Offset against incoming nuisance
    if (this.nuisanceTray > 0) {
      const offsetAmount = Math.min(generatedPoints, this.nuisanceTray);
      this.nuisanceTray -= offsetAmount;
      generatedPoints -= offsetAmount;

      if (offsetAmount >= 70) {
        this.onGarbageOffset?.(Math.floor(offsetAmount / 70));
      }
    }

    const rocksToSend = Math.floor(generatedPoints / 70);
    this.scoreRemainder = generatedPoints % 70;

    if (rocksToSend > 0) {
      this.stats.garbageSent += rocksToSend;
      this.onGarbageGenerated?.(rocksToSend);
    }
  }

  private getChainPower(chain: number): number {
    const table = [
      0, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768,
      65536,
    ];
    return table[Math.min(chain, table.length - 1)] || 0;
  }

  private getColorBonus(colors: number): number {
    if (colors <= 1) return 0;
    return (colors - 1) * 3;
  }

  private getChainScaledDuration(baseDuration: number): number {
    if (this.stats.chainCount <= 1) return baseDuration * 2;
    const multiplier =
      1 + 0.3 * Math.pow(1.3, this.stats.chainCount - 1);
    return Math.floor(baseDuration * multiplier);
  }

  // ═══ Helpers ═══

  private canMove(dx: number, dy: number, newRot?: number): boolean {
    if (!this.activePiece) return false;
    const rot = newRot ?? this.activePiece.rot;
    const nx = this.activePiece.x + dx;
    const ny = this.activePiece.y + dy;

    if (!this.isValidPos(nx, ny)) return false;
    const sub = this.getSubPos(nx, ny, rot);
    if (!this.isValidPos(sub.x, sub.y)) return false;

    return true;
  }

  private isValidPos(c: number, r: number): boolean {
    if (c < 0 || c >= COLS) return false;
    if (r < 0) return true; // Above board = valid (Tetrio-style sky logic)
    if (r >= TOTAL_ROWS) return false;
    return this.board.grid[c][r] === PuyoColor.None;
  }

  private isTouchingGround(): boolean {
    if (!this.activePiece) return false;
    return !this.canMove(0, 1);
  }

  private changeState(newState: SimState) {
    this.state = newState;
    this.stateTimer = 0;
  }

  get isGameOver(): boolean {
    return this.state === SimState.GAMEOVER;
  }
}
