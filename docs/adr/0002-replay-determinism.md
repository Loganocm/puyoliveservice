# 2. Replays store a seed and an input log, not board states

**Status:** Accepted
**Date:** 2026-08-25

## Context

A match must be reviewable after the fact. Recording board state per frame
would cost megabytes per match; recording video is worse.

The engine is deterministic, so a match can instead be stored as its **initial
seed plus the log of inputs**, and reconstructed by replaying them. A five
minute match serialises to tens of kilobytes. This is event sourcing: the log
is the truth, and state is a fold over the log.

That only works if the fold is deterministic, which means every source of
non-determinism must be eliminated or recorded. Two were neither, and each
alone guaranteed that replays diverged from the match they claimed to show.

### Fault 1 — the frame clock was wrong

Inputs were stamped on a doubled clock. See ADR 0001.

### Fault 2 — the glide buffer was unrecordable

The glide buffer pauses the lock timer while a horizontal key is **held**, on
the inference that the player is sliding into a gap rather than placing. It
depends on held-key state, and the input log recorded only movement *edges*.
Playback could not reconstruct it, so it force-disabled the buffer:

```ts
const isGliding = this.isReplaying ? false : this.horizontalMoveHeld;
```

Players hold a direction almost constantly while pieces land, so nearly every
piece locked on a different frame in playback than it did live. This was a
guarantee, not an edge case.

## Decision

**Keep the seed-plus-input-log format.** The storage win is large and the
format is not the problem.

**Record held-key state as explicit edges.** Horizontal hold and release are
recorded as `HH` / `HU`, exactly mirroring how soft drop already uses
`SD` / `SU`. Playback then uses the real value and the force-disable is gone.

**Verify rather than assume.** The client already computed an FNV-1a hash over
the board, score, garbage queue and nuisance tray every 300 frames and shipped
it to the server. Those checkpoints are now compared during playback and in
CI, so divergence is loud instead of silent.

### Recorded sources of non-determinism

| Source | Treatment |
|---|---|
| Piece colours | Seeded Mulberry32; seed stored in the file |
| Garbage column order | Same PRNG stream, plus explicitly logged as a backstop |
| Per-player handling | SDF and soft-drop protection captured per player |
| Held-key state | Recorded as `HH`/`HU` edges |
| Wall-clock time | Eliminated — the engine advances on integer frames only |
| Engine logic version | `engineVersion` stamped so a rules change invalidates rather than corrupts |

### Ordering invariant

A hash stamped frame N describes the board **before** the inputs also stamped
frame N. The live client records the hash after `update()` but before
`handleInput()`; `ReplaySimulator` reproduces this by applying inputs with
`f < currentFrame` at the top of the next iteration. Any harness that captures
state after applying a frame's inputs will appear to diverge at frame 1.

## Consequences

- Replay fidelity is measured, not asserted: 39/39 checkpoints reproduced,
  including 15/15 on matches played with the glide buffer engaged.
- Adding a new input requires widening the alphabet in five places until the
  engines are unified: the client engine, the replay types, `ReplaySimulator`,
  the server's wire whitelist, and `PuyoSimulator`.
- Replays recorded before these fixes cannot play back correctly. `ENGINE_VERSION`
  gates them out rather than playing them wrong.

## Related

- ADR 0001 — frame timing
- ADR 0003 — shared match clock
