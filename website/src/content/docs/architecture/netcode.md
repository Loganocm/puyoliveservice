---
title: Netcode
description: The target netcode — server-authoritative simulation from frame-stamped inputs, deterministic garbage delivery, and client-side prediction with rollback — and why Puyo makes it cheap.
sidebar:
  order: 4
---

Resolves `NET-01` to `NET-05`, `NET-08`, `NET-11`, `NET-12`. Roadmap items
P1.3 to P1.5. Builds on the shared clock (ADR 0003), the input-simulated
opponent view (ADR 0004) and [engine v2](/architecture/engine-v2/).

## Background

The techniques are standard and well documented:

- **Deterministic lockstep** simulates identical inputs on every machine
  (Bettner and Terrano, *1500 Archers on a 28.8*, 2001). Puyo Live already
  does this for replays and the opponent view.
- **Client-side prediction and server reconciliation**: the client acts
  immediately and corrects when the authority disagrees (Bernier, *Latency
  Compensating Methods*, Valve, 2001).
- **Rollback**: keep snapshots, and when late information arrives, rewind to
  the frame it applies to and re-simulate to the present (GGPO, Cannon, 2006;
  open-sourced 2019). Rollback needs a deterministic simulation with cheap
  snapshots, which engine v2 provides.

## Why Puyo is cheap to roll back

In a fighting game both players touch the same state every frame, so every
late input can change what you see. In Puyo the boards are independent. **The
only interaction is garbage, and garbage is delayed by design**: it waits in the
tray until the receiver's next placement, and under Tsu rules until the
attacker's chain has finished. If delivery is scheduled at least one network
round trip after the chain link that caused it, the receiver learns about
incoming garbage before it can land, and almost no correction is ever visible.

## Design

### Inputs

Each client sends its inputs stamped with the frame they apply to, exactly as
today. A player's own inputs are the only thing that decides their own board,
so their client predicts it with **zero input delay**.

### The server's simulation

For each match the server runs one engine per player, advanced by the shared
clock at `serverFrame − B`, where *B* is a small buffer (default 6 frames,
100 ms; adapted per match from measured jitter). Each input is applied at its
stamped frame. An input stamped more than *B* frames late is applied at the
current frame instead and counted: a consistently late client is lagging or
tampering, and both are visible in metrics.

This removes NET-04: the server is no longer approximating the players'
timeline, it is computing it.

### Garbage delivery

When player A's link at frame *f* generates garbage, the server schedules it
into B's tray at frame *f + D*. *D* is part of the ruleset (for example 30
frames, 500 ms), which is comfortably more than a typical one-way trip.
Because A's inputs are deterministic, both clients can compute the same
schedule once they have A's inputs, and so can the server. This removes NET-05.

### Authority

The server's simulation decides:

- **Garbage**: clients no longer send `send_garbage`. The server tells each
  client what was scheduled, and when, as confirmation of what they predicted.
- **Top-out**: the match ends when the server's simulation tops out. Clients
  show their predicted top-out immediately; the server confirms it within one
  round trip.
- **Results**: the recorded replay is the server's own input log, and it
  replays to the server's result by construction.

This removes NET-01 and NET-02. A modified client can still automate its
inputs (a bot); that is detected statistically (input timing and speed),
roadmap P4.4.

### Client prediction and rollback

Each client keeps a ring buffer of snapshots of its own board. When the server
reports garbage scheduled for a frame the client has already simulated without
it (possible only when *D* is shorter than the network delay), the client
restores the snapshot for that frame, applies the garbage and re-simulates to
the present, usually one to three frames of work. When the server's periodic
hash disagrees with the client's, the server sends its snapshot and the client
adopts it; this should never happen, and every occurrence is a reported bug
(NET-11).

The opponent view stays as it is (simulated from relayed inputs behind a jitter
buffer), now also fed the server's garbage schedule so it never guesses.

### Connection loss

If a player's inputs stop, the server's simulation simply continues: pieces
fall and lock under gravity, as they would for an idle player. A reconnect
within the window (default 20 seconds) resumes from the server's state. After
the window the match is forfeited, and it is recorded as a loss (NET-03).

### Versioning

Clients send their `ENGINE_VERSION` and the ruleset hash when they join a
queue; the server refuses a mismatch with "a new version is available, reload"
(NET-12).

## Rollout

1. Frame-aligned server simulation, still not authoritative. Measure agreement
   with the clients' hashes in production for two weeks (target: 100% of
   matches agree at every checkpoint).
2. Deterministic garbage schedule, used by clients and server.
3. Server authority for garbage and top-out, behind a flag, on for unranked
   first, then ranked.
4. Remove `send_garbage` and `player_lost` from the protocol.

## Transport

Socket.IO over WebSocket is adequate: inputs are tiny and ordered delivery is
what a lockstep log wants anyway. WebTransport (unreliable datagrams over
HTTP/3) can later reduce tail latency on lossy connections. Adopt it only when
metrics show head-of-line blocking matters, and keep WebSocket as the fallback.
