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

**Design.** Key events are latched as they arrive, with their timestamp, into
a queue. Each logical frame consumes the events that happened before its
instant. A press and release inside one frame still yields one press. DAS and
ARR count logical frames, so they mean the same everywhere.

## Handling defaults

New players judge the game on its defaults (CLI-12).

| Preset | DAS | ARR | SDF | Notes |
|---|---|---|---|---|
| **Standard** (default) | 10 | 2 | 20 | Moves three columns in 14 frames, close to Tsu's feel |
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

| Action | Feedback |
|---|---|
| Move, rotate | Piece moves; a quiet tick sound |
| Blocked move or rotation | A tiny nudge toward the wall and a muted tick, so a failed input is distinguishable from a missed one |
| Lock | Group squash; landing sound |
| Pop | Glow, burst and chain numeral; the pitch of the chain sound rises with each link |
| Garbage incoming | Tray icons appear above the board; a warning tick |
| Danger | Board rim and death ring pulse |

## How it is verified

The [animation catalogue](/reference/animation-catalogue/) records every one of
these moments frame by frame, from seeded scenarios, before and after each
change. The input requirements have browser scenarios of their own
(`keys-tap-loss`, `keys-das-arr`, `keys-arr-zero`, `keys-spawn-das`).
