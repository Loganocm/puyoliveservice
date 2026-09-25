---
title: Add an input or event
description: How to add a replay input symbol or a Socket.IO event without desyncing replays, the opponent view or the server.
sidebar:
  order: 5
---

Inputs and socket events cross a trust boundary and, for inputs, a
determinism boundary. Both have one place where they are declared and several
places that must agree.

## An input symbol

An input symbol is anything that changes the engine: it is recorded in
replays, relayed to the opponent and applied by the server. Adding one is an
engine behaviour change ([Change the engine](/guides/change-the-engine/)).

1. Widen `InputType` in `packages/engine/src/replay.ts`, with a comment saying
   what it means.
2. Make the engine support it: a method or a field on `GameEngine`, changed
   only through that method.
3. Record it where it happens. Player actions go through
   `HandlingController.frame` (`src/input/Handling.ts`) and its `record` hook,
   never straight to the engine, so the replay, the network and the opponent
   see the same thing (NET-06).
4. Apply it in every consumer:
   - `ReplaySimulator.executeInput` (`src/core/ReplaySimulator.ts`);
   - `OpponentView` (`src/core/OpponentView.ts`);
   - `PuyoSimulator.executeInput` (`server/PuyoSimulator.ts`);
   - the `record_input` whitelist in `server/index.ts` (and `mines_record_input`
     if Puyo Mines should accept it).
5. Test that a replay containing it reproduces (`tests/engine/replayFidelity`)
   and that the opponent view follows it (`tests/engine/opponentView`).
6. Document it in [Replay format](/reference/replay-format/#inputs) and bump
   `ENGINE_VERSION`: old engines cannot play replays that contain it.

## A socket event

1. **Server:** add the handler in `server/index.ts` next to its neighbours:
   - check every field's type and range before using it, and drop anything
     else silently;
   - add a per-socket limit with `checkSocketRate(socket.id, '<event>', N)`;
   - check the sender is in the room it names (`room.players.has(socket.id)`);
   - copy known keys only; never spread a client object into server state;
   - answer the sender with `socket.emit`, the room with `emitToRoom` or
     `relayToRoom` (these honour `SIMULATED_LATENCY_MS`). Broadcast to every
     socket (`io.emit`) only for state everyone needs, never as the reply to a
     request (NET-17).
2. **Client:** send and receive it in `src/core/NetworkManager.ts`, and remove
   the listener when the scene or screen goes away.
3. If the logic is more than a few lines, put it in its own module under
   `server/` with a unit test in `tests/server/`, as `matchResult.ts` and
   `minesTarget.ts` do; the socket layer itself has no tests yet (QA-01).
4. Document it in [Wire protocol](/reference/wire-protocol/): direction,
   payload, limit and effect.

Remember who decides what: the client may **report**, but results, ratings and
anything another player sees as authoritative belong to the server
([Wire protocol](/reference/wire-protocol/#who-decides-what)).
