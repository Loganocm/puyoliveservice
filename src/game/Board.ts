import { COLS, TOTAL_ROWS, PuyoColor } from '../core/Constants';

export class Board {
  grid: PuyoColor[][];

  constructor() {
    this.grid = [];
    for (let c = 0; c < COLS; c++) {
      this.grid[c] = [];
      for (let r = 0; r < TOTAL_ROWS; r++) {
        this.grid[c][r] = PuyoColor.None;
      }
    }
  }

  isValid(c: number, r: number) {
    return c >= 0 && c < COLS && r >= 0 && r < TOTAL_ROWS;
  }

  // Returns true if any puyos fell
  applyGravity(): boolean {
    let fell = false;
    for (let c = 0; c < COLS; c++) {
      let writeRow = TOTAL_ROWS - 1;
      // Iterate from bottom to top
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

  // Returns list of pieces that WILL fall, with their start and end positions
  getFallingDestinations(): { c: number, r: number, destR: number }[] {
    const falling: { c: number, r: number, destR: number }[] = [];

    for (let c = 0; c < COLS; c++) {
      let writeRow = TOTAL_ROWS - 1;
      // Iterate from bottom to top
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

  // Returns list of groups that match
  findMatches(): { c: number, r: number }[][] {
    const visited: boolean[][] = [];
    for (let c = 0; c < COLS; c++) visited[c] = [];

    const matches: { c: number, r: number }[][] = [];

    for (let c = 0; c < COLS; c++) {
      // Start from 1 to skip hidden row (won't trigger pop)
      for (let r = 1; r < TOTAL_ROWS; r++) {
        if (this.grid[c][r] === PuyoColor.None || this.grid[c][r] === PuyoColor.Garbage) continue;
        if (visited[c][r]) continue;

        const group = this.floodFill(c, r, visited, this.grid[c][r]);
        // Also check if valid group is only in valid area?
        // Actually, if a group connects to hidden row, we should probably include those in pop if the trigger is in valid area.
        // But for "won't pop", usually means they don't form a chain trigger themselves.
        // If I start search from r=1, I might still find a neighbor in r=0 via floodFill.

        // Filter out hidden row puyos from the count? 
        // Standard rule: A group of 4 must contain at least one puyo in visible area? 
        // Or hidden puyos participate but don't TRIGGER.
        // Since we iterate r=1..end, we only start search from visible.
        // If floodFill reaches r=0, it includes it.
        // If total >= 4 including hidden ones, does it pop?
        // Usually, yes, if they are connected to visible ones.
        // But a group entirely in hidden row (not possible if we start search at r=1) won't pop.

        if (group.length >= 4) {
          matches.push(group);
        }
      }
    }
    return matches;
  }

  private floodFill(c: number, r: number, visited: boolean[][], color: PuyoColor): { c: number, r: number }[] {
    const queue = [{ c, r }];
    const group = [];
    visited[c][r] = true;

    while (queue.length > 0) {
      const current = queue.pop()!;
      group.push(current);

      const neighbors = [
        { c: current.c + 1, r: current.r },
        { c: current.c - 1, r: current.r },
        { c: current.c, r: current.r + 1 },
        { c: current.c, r: current.r - 1 }
      ];

      for (const n of neighbors) {
        if (this.isValid(n.c, n.r) && !visited[n.c][n.r] && this.grid[n.c][n.r] === color) {
          visited[n.c][n.r] = true;
          queue.push(n);
        }
      }
    }
    return group;
  }

  // Find garbage adjacent to cleared puyos (Up/Down/Left/Right)
  findNeighborGarbage(matches: { c: number, r: number }[][]): { c: number, r: number }[] {
    const garbage: { c: number, r: number }[] = [];
    const seen = new Set<string>();

    // Matches are the colored puyos being actively cleared
    for (const group of matches) {
      for (const p of group) {
        const neighbors = [
          { c: p.c + 1, r: p.r }, { c: p.c - 1, r: p.r },
          { c: p.c, r: p.r + 1 }, { c: p.c, r: p.r - 1 }
        ];
        for (const n of neighbors) {
          if (this.isValid(n.c, n.r) && this.grid[n.c][n.r] === PuyoColor.Garbage) {
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


  removePuyos(coords: { c: number, r: number }[]) {
    for (const p of coords) {
      this.grid[p.c][p.r] = PuyoColor.None;
    }
  }

  getSerializedData(): number[][] {
    // Return a copy of the grid (number[][])
    // Grid is [col][row]
    return this.grid.map(col => [...col]);
  }

  handleBigPuyo(_c: number, _r: number) {
    // Placeholder for Big Puyo logic
  }

  updateFromData(data: number[][]) {
    if (!data || !Array.isArray(data) || data.length !== COLS) {
      console.warn("Invalid board data received:", data);
      return;
    }
    for (let c = 0; c < COLS; c++) {
      if (!data[c] || !Array.isArray(data[c])) {
        // Partial update failure? Reset col or ignore?
        // Safer to ignore bad columns to prevent crash
        continue;
      }
      // Ensure we copy effectively
      // Also validate length?
      this.grid[c] = [...data[c]] as PuyoColor[];
    }
  }
}
