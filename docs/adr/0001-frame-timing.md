# 1. Frame timing and the single-advance invariant

**Status:** Accepted
**Date:** 2026-08-25

## Context

The engine is frame-quantised: every timer is counted in frames at 60 logical
fps, and nothing reads the wall clock. This is what makes the simulation
deterministic and therefore replayable.

That invariant was silently broken. `GameScene` advanced the engine inside the
fixed-timestep accumulator **and again** in the input block below it, so the
engine ran at roughly 120 logical frames per second while every constant was
written as if it ran at 60.

Three consequences followed:

- Every frame constant took half its stated wall-clock time. `currentDropDelay
  = 60` was documented as "~1s/row" but played at ~0.5s/row.
- DAS and ARR are counted against a per-rendered-frame counter, which was *not*
  doubled. Handling and gravity therefore ran on clocks 2:1 apart, so the
  handling settings never meant what they said.
- Replay inputs were stamped on the doubled clock while the replay file
  declared `fps: 60`, so playback replayed a 120 Hz log at 60 Hz.

## Decision

**The engine is advanced exactly once per logical frame, from one place.**
`GameScene`'s input block reads state and applies input; it must never call
`update()`. In multiplayer that single advance point is driven by `MatchClock`
(see ADR 0003).

**The frame constants are restated to the speed the game actually played at**,
rather than restored to their nominal values. The doubled speed is what the
game shipped with and was tuned around, and it plays well. Halving every
constant preserves that exactly while making the numbers honest:

| Constant | Was | Now | Wall time |
|---|---|---|---|
| `currentDropDelay` | 60 | 30 | 2 rows/sec |
| `lockDelay` | 30 | 15 | 0.25s |
| `POP_ANIM_DURATION` | 18 | 9 | 0.15s |
| `FALL_STEP_DELAY` | 10 | 5 | 0.083s |

DAS/ARR are unchanged: they were already counted on the correct clock, and
restating gravity restores the intended ratio between them.

For reference, Puyo Puyo Tsu Level 1 is 60 frames/row (~1 row/sec). This game
deliberately runs at double that.

## Consequences

- Gravity, lock delay, pop and cascade timing are unchanged in wall-clock terms
  from what players experienced. Nothing feels different.
- Frame constants now mean what they say, so future tuning is arithmetic rather
  than guesswork.
- The two board-evolution characterization goldens changed, deliberately. No
  other golden moved, which confirms the blast radius: determinism, replay
  fidelity and piece sequencing were unaffected.
- The same constants exist in `server/PuyoSimulator.ts` and must match exactly.
  That duplication is removed when both engines become one package.

## Related

- ADR 0002 — replay determinism
- ADR 0003 — shared match clock
