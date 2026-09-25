---
title: Engine review
description: The simulation package's strengths, the structural limits that block rollback, verification and bots, and what engine v2 changes.
sidebar:
  order: 3
---

Findings: `ENG-01` to `ENG-06`, `RUL-04`, `RUL-05` in the
[register](/review/findings/). The design that answers them is
[engine v2](/architecture/engine-v2/).

## What is right

The engine is the best part of the codebase, and the properties that make it
good are the ones that are hardest to add later:

- **Deterministic.** Integer frames, no wall clock, one seeded PRNG, no
  ambient globals. Same seed plus same inputs gives the same game, and the test
  suite proves it on ten fixed seeds.
- **Pure by compiler enforcement.** No DOM and no Node types in scope, so
  coupling to a host is a build error ([ADR 0006](/decisions/0006-shared-engine-package/)).
- **Shared.** The client, the opponent view, replay playback, the game server
  and Puyo Mines all run the same code.
- **Fixed-step.** `update()` advances exactly one frame; pacing belongs to the
  caller ([ADR 0005](/decisions/0005-fixed-step-engine/)).
- **Characterized.** Goldens pin behaviour, CI refuses silent golden updates,
  and coverage floors prove the drivers reach chains.

## What limits it

### State is an object graph, not a value

The engine's state is about thirty mutable fields on a class, some public and
written by consumers (ENG-01). That is fine for a single-player game. It is the
wrong shape for everything competitive games need next:

| Capability | Needs |
|---|---|
| Rollback netcode | Save the full state every frame, restore to an earlier frame, re-simulate |
| Server verification | Run the same state forward from inputs and compare with a compact digest |
| Bots and hints | Clone the state thousands of times per move to search ahead |
| Fuzzing | Snapshot, apply random inputs, check invariants, shrink failures |
| Desync diagnosis | Diff two states field by field at the first mismatching frame |

The standard answer, used by GGPO-style rollback libraries and by
data-oriented engines generally, is to keep simulation state in a compact,
plain, copyable form (here: a 6 × 14 byte grid plus a few dozen integers) and
treat the class as functions over it. A full snapshot is then a few hundred
bytes and copying it costs microseconds, so saving one per frame for rollback
is affordable. Puyo's state is small enough that this is easy.

### The hash sees too little, too late

The periodic hash covers the grid, score and garbage counters but not the
active piece, queue, PRNG state or state machine, and it runs every 300
frames (ENG-02). A desync in any of those is invisible until it reaches the
grid, up to five seconds later. With snapshotting in place, hashing the full
state is cheap enough to do every frame on the server and every few frames on
the client.

### Randomness is one stream shared by two purposes

Pieces and garbage columns share one PRNG (RUL-04). The fix is the standard
one: derive **independent streams** from the match seed (for example with
SplitMix64 or by hashing `seed ‖ stream id`), one for the piece sequence and one
per player for garbage placement. The piece stream can then be generated once
for the whole match, which also makes "both players see the same pieces" true
by construction.

### Rules are code

Chain power, bonuses, colours, timings, caps and the death cell are literals
scattered through `GameEngine.ts` (ENG-03). This is why room settings like
`marginTime` do nothing (RUL-10): there is nowhere for them to go. A
`Ruleset` value passed in at construction, recorded in the replay and hashed
into the match identity turns every rule question into data.

### Stalling

The lock timer resets without limit and pauses while a direction is held
(RUL-05). Modern guideline stackers solved this with a **move-reset budget**:
each piece may reset its lock timer a fixed number of times (15 in the Tetris
Guideline), after which it locks at the next grounded moment. The glide buffer
can stay, bounded by the same budget.

## Smaller issues

- **Top-out is logged as a warning** (ENG-06): locking above the board is a
  normal way to lose, not an error. The engine should report game over through
  its state and a hook, not `console.warn`.
- **The PRNG state is an unbounded float** (ENG-04). Output is correct today;
  `>>> 0` makes that a guarantee.
- **Dead code and misleading comments** (ENG-05). The 70-line comment in
  `lockPiece` describes rules the code does not implement. In a codebase
  maintained largely by AI agents, a wrong comment is worse than none: it is
  read as a specification.

## Versioning behaviour changes

Fixing RUL-04 and RUL-05 changes behaviour, so both change goldens and require
an `ENGINE_VERSION` bump. Today a bump makes every earlier replay unplayable.
Engine v2 instead keeps **old behaviour selectable by version**: the replay
records the engine version and ruleset, and playback constructs the engine in
that mode. Players' replay libraries survive rule fixes.
