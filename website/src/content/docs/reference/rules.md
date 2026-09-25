---
title: Game rules
description: The rules the engine implements today (ruleset live-v1) — board, pieces, movement, locking, clearing, scoring, garbage and topping out — exactly as the code does them.
sidebar:
  order: 1
---

This page describes what `packages/engine` **does**, not what Puyo Puyo Tsu
does. Where the two differ, the [rules fidelity review](/review/rules-fidelity/)
lists the difference and the plan; the rulesets planned for
[engine v2](/architecture/engine-v2/) (`live-v2`, `tsu`) will make those
differences a choice. Timings are on [Frame timing](/reference/frame-timing/).

## Board

| | |
|---|---|
| Size | 6 columns × 14 rows: 12 visible rows and 2 hidden rows above them |
| Coordinates | `grid[column][row]`, column 0 on the left, **row 0 at the top** of the hidden rows; visible rows are 2–13 |
| Cells | `PuyoColor`: `None` 0, `Red` 1, `Green` 2, `Blue` 3, `Yellow` 4, `Purple` 5, `Garbage` 6 |
| Constants | `COLS`, `ROWS`, `HIDDEN_ROWS`, `TOTAL_ROWS` in `packages/engine/src/Constants.ts` |

Above row 0 there is open sky: a piece may be above the board (negative rows)
and moves freely there.

## Pieces

A piece is a **pair**: a main puyo and a second puyo attached to it. Its
rotation (0 up, 1 right, 2 down, 3 left) says where the second puyo sits
relative to the main one.

- **Sequence.** Each game is seeded; the same seed gives the same pieces.
  The first six pairs come from a start pool of four puyos of each of the five
  colours, shuffled, with no same-colour pair in the first two. After that,
  pairs are drawn from shuffled decks of 100: four copies of each of the 25
  ordered colour combinations. All five colours are in play from the start
  (Tsu uses four; RUL-12).
- **Next queue.** Three pairs are known in advance; the client shows two.
- **Spawn.** A new pair appears with the main puyo at column 2, row −1 (above
  the board) and the second puyo above it. There is no spawn delay.
- **Random numbers.** One seeded generator (Mulberry32) serves the piece
  sequence **and** the garbage column shuffle, so receiving garbage changes
  which pieces come later (RUL-04).

## Moving and rotating

- **Move** one column left or right if both puyos fit.
- **Rotate** clockwise or anticlockwise. If the new position is blocked the
  engine tries these offsets in order and takes the first that fits: right,
  left, up, up-right, up-left. There is no 180° quick turn (RUL-08).
- **Soft drop** multiplies gravity by the soft drop factor (40 or more is
  instant). With soft drop protection on, a soft drop held through a spawn does
  not apply to the new piece until the key is released.
- **Hard drop** moves the pair straight down and locks it at once.

## Gravity and locking

- The pair falls one row every 30 frames on its own.
- When the pair rests on something, a lock timer counts up; the pair locks when
  it passes 15 frames. **Moving or rotating resets the timer**, with no limit on
  resets (RUL-05).
- **Glide:** while a horizontal key is held the timer pauses, so a pair can be
  slid along a stack. Soft dropping onto the stack locks immediately.
- On locking, both puyos are written to the board, then any puyo with nothing
  under it falls (a horizontal pair over uneven columns splits).

## Clearing and chains

- Four or more same-colour puyos connected orthogonally clear together.
  Garbage never forms groups.
- Groups are searched from row 1 down: a group lying entirely in row 0 does not
  clear, but a group reaching into rows 0 or 1 from below does, and row 1 can
  start a clear by itself (RUL-07; in Tsu the hidden rows never clear).
- Garbage next to a clearing group clears with it.
- After a clear, everything above falls, and new groups formed by the fall
  clear in turn: each round is one **link** of the chain.
- When nothing more clears and the board is empty, that is an **all clear**.
  The client celebrates it; it gives no score or garbage bonus (RUL-09).

## Scoring

Locking a pair scores 10 plus the main puyo's row + 1: the lower it locks, the
more it scores (11 in the top hidden row, 24 on the floor). A hard drop adds 1
per row dropped. Neither counts towards garbage (RUL-14).

Each link of a chain scores

> **10 × puyos cleared × max(1, chain power + colour bonus + group bonus)**

| Term | Value |
|---|---|
| Chain power (link 1, 2, 3, …) | 0, 8, 16, 32, 64, 128, 256, 512, 1024 … doubling to 65536 |
| Colour bonus (colours cleared in the link) | 3 × (colours − 1): 0, 3, 6, 9, 12 |
| Group bonus (per group) | 0 for 4 puyos, otherwise size − 3 (5 → 2, 6 → 3, …) |

There is no upper limit on the multiplier. Tsu's tables are different
(chain power 8, 16, 32, 64, 96 …; colour bonus 3, 6, 12, 24; group bonus capped
at 10; multiplier 1–999): RUL-01 and RUL-02 on the
[fidelity review](/review/rules-fidelity/).

## Garbage

- **Sending.** Every 70 points scored by a link is one garbage puyo. Remainders
  carry over to the next link.
- **Waiting.** Incoming garbage waits in the receiver's `nuisanceTray`, counted
  in points (70 per puyo).
- **Offsetting.** Points the receiver scores cancel waiting garbage first; only
  what is left over is sent.
- **Committing and dropping.** When the receiver's turn resolves (a lock, then
  any chain, then a check that finds no group), whole puyos move from the tray
  to `garbageQueue` and fall at once, at most **24 puyos (4 rows) per turn**
  (Tsu: 30, RUL-11); the rest falls on later turns. Committed garbage can no
  longer be cancelled. Garbage sent by a chain still resolving can land before
  that chain ends (RUL-13).
- **Where it lands.** Full rows land in every column; a partial row lands in
  columns chosen by the shared random generator. Garbage clears only next to a
  clearing group.
- **Display.** The tray above the board shows pending garbage as icons: small
  1, big 6, rock 30, star 180, moon 360, crown 720.

## Topping out

The game is lost when a new piece is due and the **death cell** (column 2,
row 0, the top hidden row) is occupied, or when a piece locks with a puyo above
the board. The board shows the death cell as a ring marker at the top of
column 3 (counting from 1). Tsu ends the game when the top *visible* cell of
column 3 fills (RUL-06).

## Where this lives in the code

| Behaviour | Code |
|---|---|
| States and the frame step | `GameEngine.update`, `GameState` |
| Spawn, sequence, bags | `GameEngine.spawnPiece`, `generateBag`, `fillNextQueue` |
| Movement, rotation, drops | `GameEngine.movePiece`, `rotate`, `hardDrop`, `handleActiveState` |
| Locking | `GameEngine.lockPiece` |
| Clearing and chains | `Board.findMatches`, `GameEngine.handleCheckMatch`, `handlePopAnim` |
| Scoring and garbage | `GameEngine.calculateScore`, `handleGarbageFall` |
