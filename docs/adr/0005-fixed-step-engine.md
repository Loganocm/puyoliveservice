# 5. The engine is fixed-step and takes no delta

**Status:** Accepted
**Date:** 2026-08-25

## Context

`GameEngine.update(dt)` scaled every timer by a caller-supplied multiplier,
while `frameCount++` incremented unconditionally:

```ts
this.dt = dt;
this.frameCount++;        // always +1
this.dropTimer += this.dt;   // scaled
this.lockTimer += this.dt;   // scaled
```

On a 144 Hz display `dt ≈ 0.4167`, so after one second `frameCount` had
advanced 144 while the simulation had advanced 60 frames' worth of time.

`frameCount` therefore meant **"update calls"** in single player and
**"logical frames"** in multiplayer, where the caller always passed `1.0`.
Nothing was actively broken, because everything that reads the field — replay
input stamps, the 300-frame hash checkpoints — only ran in multiplayer. But
the same field meant two different things depending on how it was called, and
a shared engine package cannot ship that ambiguity.

Variable `dt` was doing real work: it kept wall-clock pacing correct across
refresh rates. The question was where that work belongs.

## Decision

**`update()` advances exactly one logical frame and takes no argument.**
Wall-clock pacing moves out of the engine and into the callers:

- Multiplayer: `MatchClock` derives the target frame from the shared clock
  (ADR 0003).
- Single player: an accumulator in `GameScene`.
- Puyo Mines: an accumulator in `QuickPlayScene`.
- Replay and opponent view: already one call per logical frame.

Each accumulator clamps catch-up and discards a backlog beyond the clamp, so a
stalled tab resumes rather than fast-forwarding past the player.

## What this costs

Most engine state is discrete and unaffected: `activePiece.y` is an integer
row, the grid is integers, pops are state transitions. Particles, landing
jiggle and spawn scaling are renderer-side and still run on real delta.

The only continuous value inside the engine is the garbage fall (`garb.r` is a
float). On a high-refresh display it now animates in ~9 steps over ~150 ms
instead of ~22. If that ever matters, the fix is interpolation in the renderer,
not a delta in the engine.

## Consequences

- `frameCount` always means logical frames elapsed. One meaning, everywhere.
- The shared engine has no mode that silently breaks determinism, so there is
  no parameter the server must remember never to use.
- Single player becomes recordable and replayable for free: its frame numbers
  now mean the same thing multiplayer's do.
- Removing `dt` also removed the last reason for the unreachable in-engine
  replay player (`loadReplay`, `processReplayFrame`, `executeReplayInput`,
  `externalReplayControl`), which was dead because real playback goes
  ReplayScene -> ReplayEngine -> ReplaySimulator.
- The accumulator added to `QuickPlayScene` is a mechanical wrapper preserving
  its previous wall-clock rate. It does **not** address that mode's separate
  client/server divergence, which is out of scope.

## Related

- ADR 0001 — frame timing and the single-advance invariant
- ADR 0003 — shared match clock
