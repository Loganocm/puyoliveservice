---
title: Current architecture
description: How Puyo Live works today — services, the deterministic frame model, the shared match clock, the opponent view, and the authority model with its known gaps.
sidebar:
  order: 1
---

This page explains the design as it stands. Exact formats and numbers are in
[Reference](/reference/rules/); known problems are in the
[findings register](/review/findings/); where it is going is the
[target architecture](/architecture/target/).

## Services

Three Node processes and a database, around one shared simulation package (see
the [project tour](/start/project-tour/) for the diagram). Match state is hot
and in memory on the game server; account state is durable in PostgreSQL.
Nothing about a live match touches the database until it ends, when one
transaction records the result, both rating snapshots, both XP changes and the
replay.

## Frames, not time

The simulation is frame-quantised. Every engine timer counts **logical frames
at 60 per second**, and nothing in the engine reads a clock. That is what makes
it deterministic, and therefore replayable.

**The engine is advanced exactly once per logical frame, from exactly one
place** ([ADR 0001](/decisions/0001-frame-timing/),
[ADR 0005](/decisions/0005-fixed-step-engine/)):

| Mode | Who advances the engine |
|---|---|
| Multiplayer | `GameScene`, stepping toward the frame the shared clock names |
| Single player | `GameScene`, from a real-time accumulator |
| Puyo Mines | `QuickPlayScene`, from an accumulator |
| Replay, opponent view | One `update()` per logical frame by their drivers |
| Animation lab | `LabDriver`, one frame per rendered frame |

Calling `update()` a second time per frame breaks gravity, handling and replays
at once; it happened once already.

## The shared match clock

Both players derive their frame number from one clock
([ADR 0003](/decisions/0003-shared-match-clock/)):

```text
targetFrame = floor((serverNow() - startAt) / (1000 / 60))
```

The server announces `startAt` as an absolute instant a few seconds ahead.
Clients estimate their offset from server time with an NTP-style exchange over
the socket, keeping the lowest-round-trip sample. Frame N therefore means the
same moment on both machines. Catch-up is clamped to 5 frames per rendered
frame; a client never runs ahead of the clock; a desync is shown after 3
seconds.

## Replays

A replay is a **seed plus an input log**, not a recording of board states:
event sourcing, with state as a fold over the log
([ADR 0002](/decisions/0002-replay-determinism/)). A five-minute match is tens
of kilobytes. Every source of non-determinism is eliminated or recorded, and
periodic board hashes let playback prove it reproduced the match. The format
is specified in [Replay format](/reference/replay-format/).

## The opponent view

The opponent's board is **simulated locally from their relayed inputs**, not
reconstructed from snapshots ([ADR 0004](/decisions/0004-opponent-simulation/)).
Both engines share the room seed, so replaying their inputs reproduces their
board. It renders behind the shared clock by a jitter buffer sized from the
measured round trip (6–24 frames), because their inputs cannot arrive before
they make them. Board snapshots at 2 Hz remain as a safety net and as the
server's liveness heartbeat.

## Authority

The server runs a simulation per player (literally the same engine as the
client, [ADR 0006](/decisions/0006-shared-engine-package/)) and validates,
clamps and rate-limits everything clients send:

- per-socket, per-event rate limits;
- schema checks on every payload, including a strict 6 × 14 grid guard;
- explicit key whitelists for client-supplied settings;
- an input alphabet whitelist, so garbage cannot be injected as input;
- a 256 KB message cap;
- ranked demotion when both players share an IP address;
- a board-state heartbeat that ends a match after 7 seconds of silence.

**But garbage and top-out are decided by the client** (NET-01, NET-02), and the
server's simulation is not used as an authority. It was switched off because
its results disagreed with the clients'. The review traced that to the
simulation being stepped by a drifting interval and applying inputs on arrival
instead of at their stamped frame (NET-04), and to garbage timing being set by
packet arrival (NET-05). The fix is designed in
[target netcode](/architecture/netcode/).

## Logging

Production client builds silence `log`, `info`, `debug`, `dir` and `trace`;
`warn` and `error` are always kept. This is noise control, not security. To
restore verbose logging in a production build:

```js
localStorage.setItem('puyolive_debug', '1'); // then reload
```

## The rules / presentation boundary

| File | Holds | Imported by |
|---|---|---|
| `packages/engine/src/Constants.ts` | The rules' dimensions: `COLS`, `ROWS`, `HIDDEN_ROWS`, `TOTAL_ROWS`, `PuyoColor` | Anything, including the server |
| `src/core/RenderConstants.ts` | How it looks: `CELL_SIZE`, colours for effects | The client only |
| `src/theme/` | The visual identity's tokens and piece art ([visual identity](/design/visual-identity/)) | The client only |

The engine compiles with no DOM library and no Node types, so reaching for a
host API inside it is a compile error.
