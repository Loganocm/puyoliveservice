---
title: Glossary
description: One name per concept — the terms the code and these pages use for time, the board, pieces, garbage, input, identity and the engine's boundaries.
sidebar:
  order: 11
---

One name per concept, used the same way in the code and in these pages.

## Time

The engine has **no notion of wall-clock time**; its only unit is the frame.

| Term | Meaning |
|---|---|
| **frame** | One logical simulation step, 1/60 s. Every engine timer counts these |
| `currentFrame` | Frames since this engine started. Always logical frames, never "update calls" (ADR 0005) |
| `startAt` | The instant on the **server** clock at which frame 0 happens |
| `targetFrame` | The frame the shared clock says we should be on now |
| **accumulator** | Real time carried between rendered frames, in logical frames. Lives in callers, never in the engine |
| `delta` | Renderer only: Pixi's frame delta, about 1.0 at 60 fps. Never reaches the engine |
| **logical frame** vs **rendered frame** | The first is simulation; the second is whatever the monitor refreshes at. DAS and ARR count logical frames |

`update()` takes no argument and advances exactly one frame. Details:
[Frame timing](/reference/frame-timing/).

## Board

| Term | Meaning |
|---|---|
| `grid[col][row]` | Column-major, because gravity walks one column |
| `COLS` / `ROWS` | 6 columns, 12 visible rows |
| `HIDDEN_ROWS` / `TOTAL_ROWS` | 2 hidden rows above the visible board; 14 in all |
| **row 0** | The **top** hidden row. A larger row index is lower; row 13 is the floor |
| **sky** | Negative rows above the board: a piece may move there but not lock there |
| **death cell** | Column 2, row 0. Filled at spawn time, the game is over |
| `c` / `r` | Column and row indices, always in that order |

## Pieces

| Term | Meaning |
|---|---|
| `PuyoPair` | Two colours, `{ mainColor, subColor }`: what the queue and the decks hold |
| `ActivePiece` | A pair plus where it is: `{ x, y, rot, mainColor, subColor }` |
| **main** | The axis puyo, the one the pair rotates around |
| **sub** | The orbiting puyo; above main at rotation 0 |
| `rot` | 0–3: sub is up, right, down, left of main |
| **split** (chigiri) | A horizontal pair landing on uneven columns, so one half drops further |

## Garbage

The two fields below hold **different units**; this is the easiest thing in
the code to get wrong (an opponent tray once showed 70 times the real amount).

| Term | Unit | Meaning |
|---|---|---|
| **garbage** (ojama, nuisance) | puyos | Grey puyos sent by chains |
| `nuisanceTray` | **points** | Incoming garbage that chaining can still cancel. 70 points = 1 puyo |
| `garbageQueue` | **puyos** | Committed garbage that falls next turn; no longer cancellable |
| `scoreRemainder` | points | The part of a link's score below 70 carried to the next link |
| `pendingGarbage()` | puyos | What the tray shows: `garbageQueue + floor(nuisanceTray / 70)` |
| **tray icons** | puyos | small 1, big 6, rock 30, star 180, moon 360, crown 720 |

Flow: a link scores points → they offset `nuisanceTray` → the rest ÷ 70 is
sent → when the receiver's turn resolves, whole puyos move from the tray to
`garbageQueue` and fall, at most 24 a turn ([Game rules](/reference/rules/#garbage)).

## Input

| Term | Meaning |
|---|---|
| **input symbol** | One of ten: `L R CW CC SD SU HD HH HU G` ([Replay format](/reference/replay-format/#inputs)) |
| `f`, `p`, `i`, `a` | Frame, player index, symbol, amount (only for `G`) |
| **DAS** | Delayed auto shift: frames a direction is held before it repeats |
| **ARR** | Auto repeat rate: frames between repeats; 0 is instant |
| **SDF** | Soft drop factor: gravity multiplier while soft drop is held; 40 or more is instant |
| **glide** | Holding a direction while grounded pauses the lock timer (`horizontalMoveHeld`, `HH`/`HU`) |
| **frame latch** / **play latch** | `Input` keeps every press until the next rendered frame and the next logical frame respectively, so a tap shorter than a frame is not lost |

## Identity

| Term | Scope | Lifetime |
|---|---|---|
| `socketId` | One WebSocket connection | Ends on disconnect; changes on reconnect |
| `userId` | Database primary key | Permanent; absent for guests |
| `playerIndex` | Position in a room or replay, 0 or 1 | The match |

A reconnect swaps `socketId` and keeps `userId` and `playerIndex`: room state
is keyed by socket, identity by user.

## The engine and its consumers

| Term | Meaning |
|---|---|
| `GameEngine` | The one simulation, in `packages/engine` |
| `EngineConfig` | Handling that affects simulation (`sdf`, `softDropProtection`), injected; replays and the opponent view use the recorded values |
| `onSound` | The engine's only way to make a sound; left unset, it is silent |
| **seed** | The only source of randomness (Mulberry32) |
| `PuyoSimulator` | The game server's adapter: wire symbols in, recorded events out. It contains no rules |
| `OpponentView` | A second engine on the client, fed by the opponent's inputs |
| `ReplaySimulator` | Two engines fed by a replay's log |
| `BoardFrame` | Everything `BoardView` needs to draw one board, from an engine (`engineFrame`) or a bare grid (`gridFrame`) |
| `BoardView` | The only thing that draws a board |
| **golden** | A characterization snapshot: a behaviour contract, not test output |

## The rules and presentation boundary

| File | Holds | Imported by |
|---|---|---|
| `packages/engine/src/Constants.ts` | The rules: `COLS`, `ROWS`, `HIDDEN_ROWS`, `TOTAL_ROWS`, `PuyoColor` | Anything, including the server |
| `src/core/RenderConstants.ts` | How it looks: `CELL_SIZE`, board placement | The client only |
| `src/theme/tokens.ts` | Colours, fonts and themes | The client only |

The engine compiles with no DOM and no Node types, so reaching for
`document`, `localStorage`, `Audio` or `process` inside it is a compile error.
Its one host dependency, `console.warn`, is declared in
`packages/engine/src/env.d.ts`.
