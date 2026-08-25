# 4. The opponent's board is simulated locally, not relayed

**Status:** Accepted
**Date:** 2026-08-25

## Context

The opponent's board arrived as a serialised 6x14 grid, pushed on every board
change via `send_board_state`. The server rate-limits that event to 10/s and
**silently drops the excess**, so the view did not merely lag — it skipped
states. Pieces teleported between columns, chains appeared already half
resolved, and garbage materialised without a fall. There was also no frame
stamp on the payload, so there was nothing to align the two boards *to*.

It was a slideshow assembled from whichever packets survived the rate limiter.

Meanwhile the same information was already crossing the wire in a better form:
every input is sent to the server as `record_input` for replay recording.

## Decision

**Reconstruct the opponent's board locally from their input stream.**

Both players' engines are seeded from the same `room.seed` and the engine is
deterministic, so replaying the opponent's inputs reproduces their board
exactly. The server broadcasts each recorded input to the other player in the
room, and `OpponentView` maintains a second engine fed by that stream.

This is the mechanism replays already use. One input stream now serves three
consumers: live spectating, replay playback, and the server's mirrored
simulation.

| | Before | After |
|---|---|---|
| Payload | 84-number grid | one input event |
| Rate | 10/s, lossy | a few per second |
| Smoothness | 10 snapshots/sec | 60 fps |
| Accuracy | approximate | exact |

### Display lag is deliberate

An opponent's input cannot arrive before they make it, so the view renders
behind the shared clock by a jitter buffer — one one-way trip plus margin,
sized from measured RTT and clamped to 6–24 frames (100–400ms).

Rendering at the current frame instead would mean continuously simulating
frames whose inputs have not arrived and then correcting them. A small, steady
delay reads as "watching them play"; constant correction reads as broken.

The buffer only ever widens, and only in response to inputs that actually
arrived late, so a connection that degrades mid-match self-tunes rather than
thrashing.

### Late inputs are applied, not dropped

An input whose frame has already been simulated is applied immediately. It sits
slightly wrong in time; dropping it would leave the simulation permanently
wrong, which is worse.

### Snapshots become a safety net

`send_board_state` is retained at low frequency and is already the server's AFK
heartbeat. `reconcile()` compares before writing, so it only touches the board
when the simulation genuinely disagrees — the common case has no visual pop.
A rising correction count means inputs are being *lost*, not merely delayed,
and is the signal worth alerting on.

## Consequences

- The opponent panel is a real view of them playing, verified: 10/10 boards
  reproduced cell-for-cell from the input stream alone.
- Bandwidth for opponent state drops by roughly two orders of magnitude.
- The render path is unchanged. `GameScene` mirrors the simulated engine into
  the same fields the draw code already read, so this swap is invisible to it.
- This depends entirely on ADR 0003. Without a shared clock, frame numbers on
  the relayed inputs would be meaningless and reconstruction impossible.
- Spectating a match becomes nearly free to add later: it is the same
  `OpponentView`, fed by both players' streams.

## Related

- ADR 0002 — replay determinism (same reconstruction mechanism)
- ADR 0003 — shared match clock (prerequisite)
