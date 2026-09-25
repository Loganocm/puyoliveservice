---
title: Animation catalogue
description: Every animated action the game can show, the seeded scenario that demonstrates each one, and how to record, check and extend the catalogue.
sidebar:
  order: 7
---

The catalogue answers "what can the player see move, and when?" with a checked
list rather than a memory. It has three parts:

- **The inventory**, `src/lab/animations.ts`: 54 animated actions, each with
  the code that produces it and a *witness*, the evidence in a run's trace that
  proves it happened (`src/lab/session.ts`).
- **The scenarios**, `src/lab/scenarios.ts`: 35 seeded, scripted situations
  written as data, with boards drawn as text (`src/lab/board.ts`).
- **The recordings**: every scenario played in the real game at `/?lab=<id>`
  and captured as a video with exact keyframes, plus every menu flow and a real
  two-player match.

`tests/lab/catalogue.test.ts` (95 tests) runs every engine-driven scenario
headless and fails if a scenario does not witness what it claims, if any
action in the inventory is not demonstrated by some scenario, if any reachable
state-machine transition is never exercised, or if a scenario is not
deterministic.

## Running a scenario

Open the client with `?lab=<scenario id>`, for example
`http://localhost:5173/?lab=chain-6-all-clear`. The lab replaces the game's
random start with the scenario's board, queue and seed, drives the engine one
logical frame per step, and applies the scenario's script. It makes no network
calls. Keyboard scenarios press real keys, so they go through `Input` and
`HandlingController` like a player.

## Recording

```bash
npm run build && npx vite preview --port 5173     # or npm run dev

# every scenario: artifacts/catalogue/<label>/<id>.webm, keyframes, result.json
node tests/lab/record-catalogue.mjs --label after
node tests/lab/record-catalogue.mjs --only chain-2,pop-single --label check

# every menu flow, desktop and phone (needs the API running)
node tests/lab/record-screens.mjs --label after
node tests/lab/record-screens.mjs --label after --phone

# a real 1v1 between two bots (needs the API and DEV_FIXED_SEED=4242 npm run server)
node tests/lab/record-multiplayer.mjs --label after
```

The catalogue recorder renders every logical frame exactly once, freezes the
game while it captures keyframes, and **fails** if the rendered run disagrees
with the headless run of the same scenario. Recordings go to `artifacts/`,
which is not committed; record before and after any visual change and compare
(the [definition of done](/start/documentation-system/#definition-of-done)
asks for it).

| Recording | What it covers |
|---|---|
| Catalogue | The 35 scenarios below, 1000 × 900 |
| Screens | Onboarding, menu, single player, game over, settings, leaderboard, community, multiplayer lobby, profile; 1280 × 800 and a Pixel 7 |
| Multiplayer | Matchmaking, the versus screen, the simulated opponent board, incoming garbage, attack and offset callouts, the opponent's tray, and both result screens |

In headless Chromium with software rendering both multiplayer clients run
slowly, so one of them usually falls behind the shared clock and shows
"RECONNECTING…" (CLI-20) before the match ends.

## Inventory

¹ Drawn or triggered by the client rather than the engine, so it is witnessed in
the browser by the recorder, not by the headless test.

### Piece

| ID | What you see | Code | Shown in |
|---|---|---|---|
| `piece.spawn` | New pair scales and fades in at the spawn point | `BoardView.drawPiece (spawn scale)` | `spawn-fall-lock` |
| `queue.advance` | Next queue slides up by one pair | `engine.onPieceSpawn -> NextQueueView` | `spawn-fall-lock` |
| `piece.gravity-step` | Pair falls one row under natural gravity | `GameEngine.handleActiveState` | `spawn-fall-lock`, `soft-drop` |
| `piece.soft-drop` | Pair falls faster while soft drop is held | `GameEngine.handleActiveState (sdf)` | `floor-kick`, `soft-drop` |
| `piece.sonic-drop` | Pair drops to the stack in one frame (SDF 40) | `GameEngine.handleActiveState (delay 0)` | `sonic-drop-protection` |
| `piece.hard-drop` | Hard drop: instant drop, lock and a small shake | `engine.onHardDrop -> BoardView.shake` | `move-rotate-open`, `keys-tap-loss` |
| `piece.move` | Pair moves one column | `GameEngine.movePiece` | `move-rotate-open` |
| `piece.move-blocked` | Move rejected by a wall or the stack | `GameEngine.movePiece (false)` | `move-rotate-open` |
| `piece.rotate` | Pair rotates in place | `GameEngine.rotate` | `move-rotate-open`, `floor-kick`, `same-colour-pair` |
| `piece.wall-kick` | Rotation pushed sideways off a wall or the stack | `GameEngine.rotate (kick x)` | `wall-kick-right`, `wall-kick-left` |
| `piece.floor-kick` | Rotation pushed up off the floor or the stack | `GameEngine.rotate (kick y)` | `floor-kick` |
| `piece.diagonal-kick` | Rotation pushed diagonally (non-standard) | `GameEngine.rotate (kick x and y)` | `diagonal-kick` |
| `piece.rotate-blocked` | Rotation rejected: no kick fits | `GameEngine.rotate (false)` | `rotate-blocked` |
| `piece.same-colour` | Same-colour pair drawn joined while falling | `BoardView.drawPiece (joined orbs)` | `same-colour-pair`, `pop-group-bonus` |
| `piece.ghost` | Ghost shows where the pair will land on an uneven stack | `BoardView.drawPiece (landingCells, ghost outlines)` | `split-chigiri`, `pop-two-colours-split` |
| `piece.lock-delay` | Grounded pair locks after the lock delay | `GameEngine.handleActiveState (lockTimer)` | `spawn-fall-lock` |
| `piece.lock-reset` | Moves while grounded keep resetting the lock timer (RUL-05) | `GameEngine.movePiece / rotate (lockTimer = 0)` | `lock-reset-stall` |
| `piece.glide` | Holding a direction while grounded pauses the lock timer (RUL-05) | `GameEngine.handleActiveState (isGliding)` | `glide-hold` |
| `piece.soft-drop-protection` | Soft drop held across a spawn does not slam the new pair | `GameEngine.spawnPiece (softDropLocked)` | `sonic-drop-protection` |
| `piece.soft-drop-lock` | Soft drop against the stack locks immediately | `GameEngine.handleActiveState (intentToLock)` | `sonic-drop-protection` |
| `piece.lock-jiggle` | Landed pair and its connected group squash and settle | `BoardView.detect / land (squash about the group centre)` | `spawn-fall-lock` |
| `piece.split` | A horizontal pair lands unevenly and one half drops (chigiri) | `GameEngine.handleFallingState after lock` | `split-chigiri`, `pop-two-colours-split` |

### Clears and chains

| ID | What you see | Code | Shown in |
|---|---|---|---|
| `clear.pop` | A group glows, swells and bursts into droplets and a ring | `BoardView.beginPop / drawPopping / burst` | `pop-single`, `pop-group-bonus`, `garbage-clear`, `all-clear-simple` |
| `clear.group-bonus` | A group of five or more pops | `GameEngine.calculateScore (group bonus)` | `pop-group-bonus` |
| `clear.multi-group` | Two or more groups pop in one step | `GameEngine.handleCheckMatch` | `pop-two-colours-split` |
| `clear.multi-colour` | Groups of two or more colours pop in one step | `GameEngine.calculateScore (colour bonus)` | `pop-two-colours-split` |
| `clear.cascade-fall` | Puyos above a pop fall into the gap | `BoardView.drawCells (FALLING, fallingDestinations)` | `pop-single`, `chain-2` |
| `clear.cascade-jiggle` | Fallen puyos squash on landing | `BoardView.detect / land` | `split-chigiri`, `pop-single` |
| `clear.chain-text` | "N CHAIN" callout at the popping group; the backdrop pulses from 3 links | `BoardView.beginPop -> callout; engine.onChainStep -> Backdrop.pulse` | `chain-2`, `chain-6-all-clear`, `chain-12-timing` |
| `clear.long-chain` | A chain of six or more links, with growing link duration (RUL-03) | `GameEngine.getChainScaledDuration` | `chain-6-all-clear`, `chain-12-timing` |
| `clear.garbage-clear` | Garbage next to a popping group clears with it | `Board.findNeighborGarbage` | `garbage-clear` |
| `clear.all-clear` | "ALL CLEAR" callout and a shake | `engine.onAllClear -> BoardView.callout / shake` | `chain-2`, `chain-6-all-clear`, `all-clear-simple` |
| `clear.hidden-row-pop` | A group reaching into a hidden row pops (RUL-07) | `Board.findMatches` | `hidden-row-pop` |

### Garbage

| ID | What you see | Code | Shown in |
|---|---|---|---|
| `garbage.receive` | Incoming garbage appears as icons in the tray above the board | `GameEngine.addGarbage -> BoardView.drawTray (trayIcons)` | `garbage-small`, `garbage-offset` |
| `garbage.tray-rock` | Thirty or more pending garbage shows a rock icon in the tray | `BoardView.drawTray (trayIcons)` | `garbage-capped-danger` |
| `garbage.fall-partial` | Fewer than six garbage fall into random columns | `GameEngine.handleGarbageFall / handleGarbageAnimation` | `garbage-small` |
| `garbage.fall-rows` | Whole rows of garbage fall | `GameEngine.handleGarbageFall` | `garbage-rows-on-stack`, `garbage-capped-danger` |
| `garbage.fall-capped` | A large attack falls 24 at a time over several turns (RUL-11) | `GameEngine.handleGarbageFall (MAX_ROCKS_PER_TURN)` | `garbage-capped-danger` |
| `garbage.on-stack` | Garbage lands on an uneven stack | `GameEngine.handleGarbageFall (per-column destinations)` | `garbage-rows-on-stack` |
| `garbage.offset` | A chain cancels incoming garbage ("OFFSET −N") | `engine.onGarbageOffset -> BoardView.callout` | `garbage-offset` |
| `garbage.send` | A chain generates an attack ("ATTACK +N") | `engine.onGarbageGenerated -> BoardView.callout` | `chain-2`, `chain-6-all-clear`, `chain-12-timing` |
| `garbage.large-attack` | One link sends 15+ garbage (large-attack sound) | `engine.onSound('garbageLarge')` | `chain-6-all-clear`, `chain-12-timing` |

### Endings

| ID | What you see | Code | Shown in |
|---|---|---|---|
| `end.topout-spawn` | Top-out: the spawn cell is filled | `GameEngine.spawnPiece (DEATH_ROW)` | `topout-spawn` |
| `end.topout-lock` | Top-out: a pair locks partly above the board | `GameEngine.lockPiece (out of bounds)` | `topout-lock` |
| `end.hidden-row-stack` | Stacking into the hidden rows without dying (RUL-06) | `GameEngine.lockPiece` | `hidden-row-stack` |
| `end.time-up` ¹ | Timed mode ends: "TIME'S UP!" and the results overlay | `GameScene.update (timeLimit) -> changeState(GAMEOVER) -> GameOverScreen` | `time-up` |

### Board and HUD

| ID | What you see | Code | Shown in |
|---|---|---|---|
| `hud.score` | Score, max chain and cleared counters update | `GameScene -> StatPanel.set` | `spawn-fall-lock` |
| `hud.x-marker` ¹ | The death-cell ring turns faster and the rim glows as the stack nears it | `BoardView.drawMarker / drawRim (danger)` | `spawn-fall-lock` |
| `hud.timer` ¹ | Timed mode countdown, red under 30 s | `GameScene -> StatPanel (TIME, danger tone)` | `time-up` |
| `hud.pause` ¹ | Pause overlay opens and closes | `GameScene.togglePause -> PauseScreen` | `pause-overlay` |

### Input

| ID | What you see | Code | Shown in |
|---|---|---|---|
| `input.das-arr` ¹ | Held direction: one step, DAS delay, then ARR repeats | `HandlingController.frame` | `keys-das-arr`, `keys-spawn-das` |
| `input.arr-zero` ¹ | ARR 0: the pair jumps to the wall | `HandlingController.frame (ARR 0)` | `keys-arr-zero` |
| `input.spawn-das` ¹ | Charged DAS moves a new pair on its spawn frame | `HandlingController.frame (spawned)` | `keys-spawn-das` |
| `input.tap` ¹ | A key tap shorter than one frame still moves the pair (CLI-11, fixed) | `Input.consumePlay (play latch)` | `keys-tap-loss` |

## Scenarios

"Driven by" says how a scenario runs: *engine* scenarios script the engine
directly and are checked headless; *browser* scenarios need the real page
(keys, pause, timers) and are checked by the recorder.

| Scenario | Seed | Shows | Driven by |
|---|---|---|---|
| `spawn-fall-lock` | 1001 | Spawn, natural gravity, lock delay | engine |
| `move-rotate-open` | 1002 | Moves, rotations and a blocked move in open space | engine |
| `wall-kick-right` | 1003 | Wall kick off the right wall | engine |
| `wall-kick-left` | 1004 | Wall kick off the left wall | engine |
| `floor-kick` | 1005 | Floor kick onto a stack | engine |
| `diagonal-kick` | 1006 | Diagonal kick (non-standard) | engine |
| `rotate-blocked` | 1007 | Rotation blocked in a one-column well | engine |
| `same-colour-pair` | 1008 | Same-colour pairs | engine |
| `split-chigiri` | 1009 | Split: a horizontal pair lands unevenly | engine |
| `soft-drop` | 1010 | Soft drop | engine |
| `sonic-drop-protection` | 1011 | Sonic drop, soft-drop lock and soft-drop protection | engine |
| `lock-reset-stall` | 1012 | Lock-timer resets stall a grounded pair (RUL-05) | engine |
| `glide-hold` | 1013 | Holding a direction pauses the lock timer (RUL-05) | engine |
| `pop-single` | 1014 | A single group of four pops | engine |
| `pop-group-bonus` | 1015 | A group of five | engine |
| `pop-two-colours-split` | 1016 | Two groups of two colours pop together | engine |
| `chain-2` | 1017 | A 2-chain | engine |
| `chain-6-all-clear` | 1018 | A 6-chain staircase ending in an all clear | engine |
| `chain-12-timing` | 1035 | A 12-chain: how link duration grows | engine |
| `garbage-clear` | 1019 | Garbage next to a pop clears with it | engine |
| `all-clear-simple` | 1020 | A single-step all clear | engine |
| `hidden-row-pop` | 1021 | A group in the hidden rows pops (RUL-07) | engine |
| `garbage-small` | 1022 | A few garbage fall into random columns | engine |
| `garbage-rows-on-stack` | 1023 | Three rows of garbage onto an uneven stack | engine |
| `garbage-capped-danger` | 1024 | A 40-garbage attack: a rock in the tray and a capped drop | engine |
| `garbage-offset` | 1025 | A chain offsets incoming garbage | engine |
| `hidden-row-stack` | 1026 | Stacking into the hidden rows (RUL-06) | engine |
| `topout-lock` | 1027 | Top-out: locking above the board | engine |
| `topout-spawn` | 1028 | Top-out: the spawn cell is filled | engine |
| `keys-das-arr` | 1029 | Held key: DAS then ARR (default handling) | browser |
| `keys-arr-zero` | 1030 | ARR 0: straight to the wall | browser |
| `keys-spawn-das` | 1031 | Charged DAS moves a new pair on its first frame | browser |
| `keys-tap-loss` | 1032 | A tap shorter than one frame (CLI-11) | browser |
| `pause-overlay` | 1033 | Pause and resume | browser |
| `time-up` | 1034 | Timed mode runs out | browser |

## Adding a scenario or an animation

Adding an animation to the game means adding it to the inventory with a
witness **and** to at least one scenario, in the same change; the catalogue
test fails otherwise. See [Add a catalogue scenario](/guides/add-a-catalogue-scenario/).
