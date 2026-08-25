# 3. Both players derive their frame number from a shared clock

**Status:** Accepted
**Date:** 2026-08-25

## Context

Each client derived its frame number from a local accumulator started when its
own `game_start` packet arrived. Player A's frame 1000 and player B's frame
1000 were therefore different wall-clock moments, offset by network jitter,
`requestAnimationFrame` phase, and any tab stall.

Two problems followed, and they looked unrelated until traced:

- **Live.** Cross-player alignment was approximate. There was no shared
  reference to align *to*, and the opponent's board arrived as a rate-limited
  snapshot relay with no frame stamp at all.
- **Replays.** `ReplaySimulator` advances both engines in lockstep by frame
  index. That assumes frame N meant the same instant for both players. It did
  not. The replay was faithfully reproducing a timeline that never existed.

The replay was not wrong about the *data*. It was wrong about what a frame
number *meant*.

## Decision

**Both clients derive frames from a clock they agree on.**

```
targetFrame = floor((serverNow() - startAt) / (1000/60))
```

- The server announces `startAt`, an absolute instant on its own clock, a few
  seconds in the future. Previously a `setTimeout` fired and each client began
  when its packet landed; now every client counts down to the same moment.
- Clients estimate their offset from server time with a short NTP-style
  handshake over the existing socket. `MatchClock` keeps the **lowest-RTT**
  sample rather than an average: the minimum round trip is least polluted by
  queueing delay, and averaging lets one congested sample bias the offset
  permanently.
- `GameScene` advances the engine toward `targetFrame` instead of running a
  private accumulator.

### Guard rails

- **Catch-up is clamped** to 5 frames per rendered frame. A stalled tab can
  fall arbitrarily far behind; unbounded catch-up causes a visible fast-forward
  and risks a spiral where each catch-up costs more than the frame it reclaims.
- **A client never runs ahead.** If it is past the shared clock it waits.
  Simulating a future the opponent has not reached is not a valid state.
- **Desync is surfaced at 3 seconds**, before the server's 7-second board-state
  heartbeat aborts the match, so the client can explain itself first.

## Consequences

- Frame N is the same instant on every machine. Live alignment is real, and
  **lockstep replay becomes correct by construction** rather than assumed.
- The replay file format is unchanged. This is a timing fix, not a storage
  change.
- The `tick_frame` round trip is deleted: the server derives the frame itself
  from `startAt`. `GameRoom.tick()`, `frameCount`, `lastTickFrame` (written but
  never read) and the client accumulator go with it.
- Clients now depend on a reasonably stable local clock. A machine whose clock
  steps mid-match will re-sync on the next sample burst; a machine with a
  drifting clock is bounded by the desync threshold.
- This is the prerequisite for rendering the opponent's board by local
  simulation rather than snapshot relay, which is the next step.

## Related

- ADR 0001 — frame timing
- ADR 0002 — replay determinism
