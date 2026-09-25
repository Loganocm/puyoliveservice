---
title: Replay format
description: The V3 replay file — a seed plus a frame-stamped input log — its input alphabet, the ordering invariant, hash checkpoints, and how ENGINE_VERSION gates playback.
sidebar:
  order: 3
---

A replay stores **a seed and every input**, not board states. The game is a
deterministic function of those (see [ADR 0002](/decisions/0002-replay-determinism/)),
so playing the inputs back through the same engine rebuilds every frame. A
five-minute match is tens of kilobytes.

The types are declared once, in `packages/engine/src/replay.ts`, and imported
by the client and the game server; before that they were two hand-kept copies.

## The file

`ReplayFileV3`. The game server builds it when a **ranked** match between two
signed-in players ends and sends it to the API with the result; it is stored as
JSON in `matches.replay_data` and served by `GET /api/matches/:id/replay`
([API](/reference/api/)). Unranked and guest matches are not stored.

| Field | Type | Meaning |
|---|---|---|
| `version` | `3` | Format version |
| `engineVersion` | string | `ENGINE_VERSION` of the server that recorded it, e.g. `"1.0.0"` |
| `seed` | number | The room seed. Both players' engines start from it |
| `players` | `{ id, username, userId?, elo? }[]` | Player 0 and player 1, in room order |
| `winner` | `0`, `1` or `null` | |
| `duration` | number | Frames: the latest of the shared clock, the last input and the last hash |
| `fps` | `60` | |
| `inputs` | `ReplayInput[]` | Every input, both players, frame-stamped (below) |
| `playerSettings` | two `{ sdf, softDropProtection }` | Each player's handling that affects the simulation. The server clamps SDF to 1–40 |
| `roomSettings` | `{ garbageMultiplier, marginTime }` | |
| `pieceSequences` | two `number[]` | Each player's pairs, flattened `[main0, sub0, main1, …]`: an audit record, not used for playback |
| `garbageColumns` | two `number[][]` | The column order of each garbage drop: audit only |
| `events` | `DeterministicEvent[]` | Server-side moments (`spawn`, `lock`, `match`, `garbage_drop`, `chain_end`, `gameover`, `bag_gen`) for debugging |
| `stateHashes` | `{ f, p, h }[]` | Board hash checkpoints from each client (below) |

Version 2 files (no `engineVersion`, one settings object) are recognised only so
the interface can say they are too old; they are not playable. Every client and
API check requires `version === 3`, a string `engineVersion` and a non-empty
input list.

## Inputs

```ts
interface ReplayInput { f: number; p: 0 | 1; i: InputType; a?: number }
```

| Symbol | Meaning | Engine call on playback |
|---|---|---|
| `L` / `R` | move left / right | `movePiece(-1)` / `movePiece(1)` |
| `CW` / `CC` | rotate clockwise / anticlockwise | `rotate(1)` / `rotate(-1)` |
| `SD` / `SU` | soft drop pressed / released | `setSoftDrop(true/false)` |
| `HD` | hard drop | `hardDrop()` |
| `HH` / `HU` | a horizontal key is held / released (the glide buffer) | `horizontalMoveHeld = true/false` |
| `G` | garbage arrived, `a` puyos, recorded by the **receiver** | `addGarbage(a)` |

Held keys are recorded as edges (`SD`/`SU`, `HH`/`HU`) because locking depends
on what is held, which moves alone cannot express. Only **successful** moves and
rotations are recorded: `HandlingController` calls the `record` hook after the
engine accepts a change, so the log is the list of things that happened, not
of keys pressed.

The same records travel live as `record_input` (client → server) and
`opponent_input` (server → opponent), so one stream feeds the replay, the
opponent's view and the server's simulation ([Wire protocol](/reference/wire-protocol/)).

## The ordering invariant

**An input stamped frame N was applied after the engine's step N.** A hash
stamped frame N describes the board after step N and **before** that frame's
inputs.

Live play does: step (frame becomes N), hash if N is a checkpoint, apply and
record inputs as frame N. `ReplaySimulator` reproduces it by applying, at the
top of each iteration, every input with `f < currentFrame`, then stepping:

```ts
while (currentFrame < maxFrames) {
    currentFrame++;
    applyInputsWhere(input => input.f < currentFrame);   // inputs of frame currentFrame − 1
    engine1.update(); engine2.update();                  // step currentFrame
    compareHash(currentFrame);                           // before currentFrame's inputs
}
```

A harness that hashes *after* applying a frame's inputs will appear to diverge
at frame 1. This is the easiest mistake to make here; the step order is fixed in
[Frame timing](/reference/frame-timing/#who-advances-the-engine).

## Hash checkpoints

Every 300 frames (5 s) each client sends `record_hash` with
`computeBoardHash()`: 32-bit FNV-1a over the grid (column by column), then the
score, `garbageQueue` and `nuisanceTray`, as 8 hex digits. Playback recomputes
the hash at each recorded frame and counts mismatches (`desyncCount`), logging
the frame, score and garbage state of the first ones. The test suite requires
100 % of checkpoints to reproduce ([Testing](/reference/testing/)).

## Playback

`ReplaySimulator.simulate()` runs both engines from the seed, with each
player's recorded `playerSettings`, for `duration + 600` frames (capped at
360 000, 100 minutes) and keeps a `FrameSnapshot` of both boards for every
frame. `ReplayScene` then draws snapshots at the chosen speed, so seeking is
instant; the cost is memory proportional to the match length.

## Versioning

`ENGINE_VERSION` (`packages/engine/src/replay.ts`, currently `1.0.0`) is
stamped into every replay. Any change to engine behaviour, which the
characterization goldens detect, must bump it and come with an ADR
([Change the engine](/guides/change-the-engine/)). How the number is chosen is
in [Versioning](/reference/versioning/).

Today the version is recorded but **not compared**: playback does not refuse a
replay from another engine version, it plays it and the hash checkpoints
report the divergence. Clients and server do not compare versions when a match
starts either (NET-12). Keeping old engines playable (a registry of rulesets
keyed by version) is planned in [engine v2](/architecture/engine-v2/).

## Known gaps

- If a player's `record_settings` never arrives, the server records SDF 10 and
  soft drop protection on, which is not the current default (SDF 20); such a
  replay can diverge from the start (NET-16).
- `G` is recorded by the receiving client and garbage is client-authoritative,
  so a modified client can misreport it (NET-01 on the
  [findings register](/review/findings/)).
