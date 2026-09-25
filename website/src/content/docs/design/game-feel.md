---
title: Game feel
description: What makes Puyo Live feel responsive — the input pipeline, handling defaults, render smoothness and feedback — and the measurable targets for each.
sidebar:
  order: 2
---

"Feel" is the sum of small, measurable things: whether every key press
registers, how quickly the piece responds, whether the frame rate holds, and
whether each action has clear feedback. Each is specified here with a target
that can be tested.

## Input

| Requirement | Target | Finding |
|---|---|---|
| Every press registers, however short | 100% of presses, including ones shorter than a frame | CLI-11 |
| Handling is independent of the monitor | DAS and ARR measured in logical frames (1/60 s) on every display | CLI-01 |
| Input is timed to the simulation | Presses applied on the logical frame they occurred in | CLI-10 |
| Bindings are respected | No hard-coded keys | CLI-08 |

**How it works (0.3.0; all four met).** `Input` latches every press as it
arrives and keeps it until the next logical frame consumes it
(`Input.consumePlay`), so a press and release inside one frame still yields
one press. `HandlingController` runs once per engine step, after the step, and
counts DAS and ARR in logical frames, so they mean the same on every display.
Rotation and drops come only from bound actions. Details:
[Frame timing](/reference/frame-timing/#handling).

## Handling defaults

New players judge the game on its defaults (CLI-12).

| Preset | DAS | ARR | SDF | Notes |
|---|---|---|---|---|
| **Standard** (default) | 10 | 2 | 20 | Moves three columns in 12 frames (Tsu: 8) |
| Relaxed | 16 | 4 | 10 | For new or casual players |
| Competitive | 7 | 0 | 40 | Instant ARR, sonic soft drop |
| Custom | any | any | any | Existing settings screen |

Players who changed the old defaults keep their values; only untouched
defaults move to Standard.

## Frame rate and smoothness

| Requirement | Target |
|---|---|
| Steady 60 fps on a mid-range laptop and phone | No dropped frames during a 12-chain |
| No per-frame allocation in the render loop | Sprites pooled and reused, not created and destroyed each frame |
| Sharp on high-density screens | Canvas resolution follows `devicePixelRatio` |

The baseline renderer destroyed and re-created every puyo sprite every frame,
which produces garbage-collection pauses: micro-stutter at the worst moments,
such as during chains.

## Feedback

Every action a player takes must be visibly acknowledged within one frame:

| Action | Feedback | In 0.3.0 |
|---|---|---|
| Move, rotate | Piece moves (the second puyo swings round on a rotation); a quiet tick sound | Yes |
| Blocked move or rotation | A tiny nudge toward the wall and a muted tick, so a failed input is distinguishable from a missed one | Not yet |
| Lock | Group squash; landing sound | Squash yes; a sound only on hard drop |
| Pop | Glow, burst and chain callout; a different, rising chain sound for each link up to 7 | Yes |
| Garbage incoming | Tray icons appear above the board and a "+N INCOMING" callout; a warning tick | Icons and callout yes; no sound |
| Danger | Board rim and death ring pulse | Yes |

## How it is verified

The [animation catalogue](/reference/animation-catalogue/) records every one of
these moments frame by frame, from seeded scenarios, before and after each
change. The input requirements have browser scenarios of their own
(`keys-tap-loss`, `keys-das-arr`, `keys-arr-zero`, `keys-spawn-das`).
