# Puyo Live

A competitive Puyo-style puzzle game for the browser, with real-time
multiplayer, deterministic replays, ELO rankings and player profiles.

**Live:** [puyo.live](https://puyo.live)

---

## Contents

- [Architecture](#architecture)
- [Match timing](#match-timing)
- [Authority model](#authority-model)
- [Replay format](#replay-format)
- [Opponent view](#opponent-view)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Deployment pipeline](#deployment-pipeline)
- [Logging](#logging)
- [Vocabulary](#vocabulary)
- [Project layout](#project-layout)
- [Known limitations](#known-limitations)
- [Decision records](#decision-records)

---

## Architecture

Three independently deployable Node processes plus a database. The browser
speaks REST to the API and WebSocket to the game server; the game server calls
the API server-to-server with a shared secret.

```
   Browser client ──── WebSocket ────▶ Game server ──┐
   (Vite/React/Pixi)                  (Socket.IO)    │ X-Internal-Key
          │                                          ▼
          └────────── HTTPS + JWT ───────────▶  REST API ──▶ PostgreSQL
                                               (Express/Prisma)
```

| Service | Root | Responsibility |
|---|---|---|
| Client | `src/` | Rendering, input, all UI |
| Game server | `server/` | Matchmaking, rooms, input relay, replay recording |
| REST API | `api/` | Accounts, JWT, matches, ELO, XP, leaderboard, admin |
| Database | `api/prisma/` | Users, matches, replays, bans, audit and login logs |

The simulation is not in that list, because it is not a service. It is a
package, `packages/engine`, and the client and the game server both run it
([ADR 0006](docs/adr/0006-shared-engine-package.md)).

Match state is hot, ephemeral and lives in memory on the game server. Account
state is durable and lives in Postgres. Nothing about a live match touches the
database until the match ends, at which point one transaction records the
result, both ELO snapshots, both XP deltas and the serialised replay.

---

## Match timing

The simulation is frame-quantised. Every timer counts **engine frames at 60
logical fps**, and nothing reads the wall clock. This is what makes the game
deterministic and therefore replayable.

**The engine is advanced exactly once per logical frame, from exactly one
place.** In multiplayer that place is driven by `MatchClock`; in single player
it is the render loop. Any code that calls `engine.update()` a second time
breaks gravity, handling and replays simultaneously — this has happened once
already ([ADR 0001](docs/adr/0001-frame-timing.md)).

Both players derive their frame number from a **shared clock** rather than a
local accumulator:

```
targetFrame = floor((serverNow() - startAt) / (1000/60))
```

The server announces `startAt` as an absolute instant; clients estimate their
offset from server time with an NTP-style handshake over the existing socket.
Frame N therefore means the same moment on both machines, which is what makes
cross-player alignment real and lockstep replay correct
([ADR 0003](docs/adr/0003-shared-match-clock.md)).

### Frame constants

| Constant | Frames | Wall time |
|---|---|---|
| `currentDropDelay` | 30 | gravity, 2 rows/sec |
| `lockDelay` | 15 | 0.25s grace before lock |
| `POP_ANIM_DURATION` | 9 | 0.15s clear animation |
| `FALL_STEP_DELAY` | 5 | 0.083s cascade step |

DAS, ARR and SDF are player settings and are counted on the same clock.

Terms used throughout — frame, accumulator, tray vs queue, main vs sub — are
defined once under [Vocabulary](#vocabulary).

---

## Authority model

**State this honestly, because the code does.**

The server runs a `PuyoSimulator` per player — since
[ADR 0006](docs/adr/0006-shared-engine-package.md), literally the same engine
the client runs rather than a hand-mirrored copy of it — and validates, clamps
and rate-limits everything the client sends. But **garbage and death are
currently client-authoritative**: the server does not independently verify them.

The simulation exists and is wired; enforcement is deliberately switched off,
and unifying the engines does not change that. The problem was never that the
two implementations disagreed about the rules — they agreed. It is that the
server's simulation runs one network round trip behind the client, and under
that skew it reported deaths on boards the client had already resolved and
relayed garbage at the wrong frame, producing false losses for honest players.
Disabling enforcement was judged better than shipping a game that steals wins.

The known fix is rollback netcode: buffer inputs against a frame-tagged
timeline, roll the simulator back to the frame an input claims, re-apply and
reconcile. It is scoped but not built.

What **is** enforced server-side:

- Per-socket, per-event sliding-window rate limits
- Schema validation on every payload, including a strict 6x14 grid guard
- Explicit key whitelists on client-supplied settings (no spreading untrusted
  objects)
- Input alphabet enforcement — clients cannot inject garbage through the input
  channel
- A 256 KB Socket.IO buffer cap
- Same-IP ranked demotion
- A board-state heartbeat that aborts a match after 7s of silence

---

## Replay format

A replay stores a **seed plus an input log**, not board states. A five-minute
match serialises to tens of kilobytes instead of megabytes. This is event
sourcing: the log is the truth, and state is a fold over the log.

That only works if the fold is deterministic, so every source of randomness is
either eliminated or recorded ([ADR 0002](docs/adr/0002-replay-determinism.md)).

### Input alphabet

| Symbol | Meaning |
|---|---|
| `L` / `R` | move left / right |
| `CW` / `CC` | rotate clockwise / counter-clockwise |
| `SD` / `SU` | soft drop pressed / released |
| `HD` | hard drop |
| `HH` / `HU` | horizontal key held / released (drives the glide buffer) |
| `G` | garbage received (recorded by the receiver) |

Hold states are recorded as edges because the glide buffer depends on held-key
state, which movement edges alone cannot express.

### The ordering invariant

A hash stamped frame N describes the board **before** the inputs also stamped
frame N. The client records the hash after `update()` but before
`handleInput()`; `ReplaySimulator` reproduces this by applying inputs with
`f < currentFrame` at the top of the next iteration.

Any harness that captures state *after* applying a frame's inputs will appear
to diverge at frame 1. This is the single easiest mistake to make here.

### Verification

The client hashes the board (FNV-1a over the grid, score, garbage queue and
nuisance tray) every 300 frames and ships the checkpoint to the server.
Playback recomputes and compares. Divergence is logged loudly, and the test
suite asserts 100% checkpoint reproduction.

### Versioning

`ENGINE_VERSION` is stamped into every replay. A change to game logic that
affects determinism **must** bump it, so old replays are gated out rather than
played back incorrectly.

---

## Opponent view

The opponent's board is **simulated locally from their relayed input stream**,
not reconstructed from grid snapshots ([ADR 0004](docs/adr/0004-opponent-simulation.md)).

Both engines share the room seed and the engine is deterministic, so replaying
their inputs reproduces their board exactly — at 60fps, for roughly two orders
of magnitude less bandwidth than the previous snapshot relay, which the server
rate-limited to 10/s and silently truncated.

The view renders behind the shared clock by a jitter buffer sized from measured
RTT (6–24 frames). Their input cannot arrive before they make it, so a small
steady delay is correct; rendering at the current frame would mean constantly
simulating frames whose inputs have not arrived and then correcting them.

`send_board_state` remains at 2/s as a safety net and as the server's AFK
heartbeat. `reconcile()` compares before writing, so it only touches the board
when simulation genuinely disagrees.

---

## Getting started

### Prerequisites

- Node.js 22+
- Docker (for PostgreSQL)

### Local development

```bash
# 1. Start the database
docker compose up -d db

# 2. Install dependencies
#    One install covers the client, packages/engine and the game server: they
#    are one npm workspace. The API is not a workspace and installs separately.
npm install
cd api && npm install && cd ..

# 3. Run migrations
cd api && npm run db:migrate && cd ..

# 4. Run the three services (separate terminals)
npm run dev        # client,      :5173
npm run server     # game server, :3000
npm run api        # REST API,    :8080
```

Ports match `docker-compose.yml` and the client's dev fallbacks, so this works
with no environment configuration. (Both services previously defaulted to 3001
— a collision that meant local dev could not start unconfigured.)

### Environment variables

Production **refuses to start** without secrets rather than falling back to
defaults. Development generates ephemeral ones per process.

| Variable | Scope | Purpose |
|---|---|---|
| `JWT_SECRET` | api | ≥64 chars, required in production |
| `INTERNAL_API_KEY` | api, server | ≥32 chars, server-to-server auth |
| `DATABASE_URL` | api | Postgres connection string |
| `CORS_ORIGIN` | api, server | Primary allowed origin |
| `EXTRA_CORS_ORIGINS` | api, server | Comma-separated extra origins, **dev only** |
| `SIMULATED_LATENCY_MS` | server | Injects outbound delay, **dev only** |
| `VERCEL_PREVIEW_PREFIX` | api | Project prefix for preview-deploy CORS |

### Testing multiplayer realistically

Two browser tabs on one machine have ~0 RTT, which hides exactly the
clock-offset and jitter-buffer behaviour that matters. To test properly:

```bash
SIMULATED_LATENCY_MS=80 npm run server
```

The clock-sync reply is deliberately never delayed — skewing it would corrupt
the measurement it exists to take.

To drive the stack on another machine from your dev browser, add your LAN
origin:

```bash
EXTRA_CORS_ORIGINS=http://192.168.1.42:5173
```

---

## Testing

```bash
npm test              # engine suite: no database, no network, no DOM, ~800ms
npm run test:watch
npm run test:coverage
npm run typecheck     # client + tests

npm run build:engine  # compiles the engine — also its type check
cd server && npx tsc --noEmit && cd ..   # needs build:engine first
cd api && npx tsc --noEmit && cd ..

cd api && npm test    # API suite: requires PostgreSQL
```

The game server needs `build:engine` first because it resolves
`@puyolive/engine` through `node_modules` to the package's built output. The
client and the test suite do not: they alias it to the source.

The engine suite runs anywhere because it touches nothing external — no
database, no network, and **no DOM**. The engine takes its handling settings
from an injected `EngineConfig` and reports audio through an `onSound` hook, so
it reaches no browser global.

If an engine test ever fails for want of `localStorage` or `Audio`, something
has re-coupled the engine to the browser. Fix that rather than switching the
environment back to jsdom.

### What is covered

| Area | Guarantee |
|---|---|
| Piece sequence | A seed always produces the same pieces. Every replay is a seed plus inputs, so a change here silently rewrites every recorded match |
| Board evolution | Checkpoint hashes across 10 fixed seeds pin gravity, matching, scoring, garbage and state-machine timing |
| Self-determinism | Same seed + same inputs → identical board, every time |
| Replay fidelity | Real matches reconstructed from seed + input log alone; reports a percentage |
| Opponent view | The opponent's board reproduced cell-for-cell from their input stream |
| Match clock | Two clients with different local clocks and latencies agree on frame numbers; catch-up is clamped; never runs ahead |
| Negative controls | Different inputs must diverge; the hash must react to grid and garbage changes |
| Server recording | The frame each replay-recording hook fires on, and the order they fire in — pinned as goldens captured from the pre-unification server simulator |

### Characterization goldens

Snapshot files under `tests/**/__snapshots__/` are **behaviour contracts**, not
test output.

**If a golden changes, stop and find out what moved.** A red characterization
test means engine behaviour changed. Only after you understand why should you
update the snapshot, and the change must be accompanied by an ADR.

CI fails if snapshots drift during a run, specifically so that `vitest -u`
cannot be used to launder a behaviour change into a green build.

### Coverage floors

Some tests assert that the *test drivers* still reach chains and garbage. Goldens
captured from a driver that tops out immediately look green and protect nothing;
these fail loudly instead.

This is not hypothetical. The engine parity suite reported "identical for 3000
frames" across 30 runs while its driver was actually topping out in 60–250
frames, having never once reached `CHECK_MATCH` — so chain scoring, the colour
and group bonuses, the offset arithmetic and the garbage column shuffle were
never compared at all. Its assertion also filtered for `'diverged'` against a
message that said `'DIVERGED'`, so it could not have failed either way. Both
were found and fixed while unifying the engines
([ADR 0006](docs/adr/0006-shared-engine-package.md)); the suite now runs a
second driver that plays well enough to chain, and reports the frames it
actually compared rather than the frame budget.

---

## Continuous integration

`.github/workflows/verify.yml` is a reusable pipeline invoked by both
`ci.yml` (every branch, every PR) and `deploy.yml` (before publishing images).

| Job | Guarantee |
|---|---|
| `typecheck` | The engine package, the client, the API and the game server all compile, including the test suite. The engine is checked under its own no-DOM, no-Node tsconfig |
| `engine-tests` | Engine suite passes and goldens did not drift |
| `build` | Client bundle builds and is non-empty |
| `deploy-smoke` | The full Docker stack boots and answers its health check |

**Nothing reaches production without passing every job.** Watchtower
auto-deploys published images within ~5 minutes, so this is the only gate.

---

## Deployment pipeline

```
push to main → verify → build images → GHCR → Watchtower (5 min poll) → minipc
```

- Client: Vercel static build
- Services: multi-stage Alpine images, published to GHCR tagged `latest` and
  the commit SHA
- Ingress: Cloudflare Tunnel — no inbound ports opened on the host
- Migrations: `prisma migrate deploy` runs in the container entrypoint before
  the server starts
- Backups: sidecar runs `pg_dump -Fc | gzip` every 10 days, keeping the last 10
- Logs: capped at 10 MB x 3 per service (added after container logs filled the
  host's disk)

### Docker Desktop on Windows

The stack runs on Docker Desktop with the WSL2 backend, which produces
`linux/amd64` containers — the same platform GitHub Actions builds, so CI
validates the real artifact.

The `db` service bind-mounts `./data/postgres`. **Keep the repository inside
the WSL2 filesystem.** Postgres on a Windows-path bind mount hits permission
errors on its data directory; this is the most common Docker Desktop failure
mode for this stack.

---

## Logging

Production builds silence `log`, `info`, `debug`, `dir` and `trace`.
**`warn` and `error` are always kept** — they are what you need when something
breaks in the wild.

This is noise control, not security. An earlier version replaced every console
method with a no-op "to prevent exploitation", which stopped no attacker and
made production bugs impossible to diagnose.

To restore verbose logging in a production build:

```js
localStorage.setItem('puyolive_debug', '1'); // then reload
```

---

## Vocabulary

One name per concept. The table of names that used to exist twice is gone: the
duplicates it tracked collapsed when the engine became one package
([ADR 0006](docs/adr/0006-shared-engine-package.md)).

### Time

The engine has **no notion of wall-clock time**. Its only unit is the frame.

| Term | Meaning |
|---|---|
| **frame** | One logical simulation step: 1/60 s. Every engine timer is counted in these |
| `currentFrame` | Frames elapsed since this engine started. Always logical frames — never "update calls" ([ADR 0005](docs/adr/0005-fixed-step-engine.md)) |
| `startAt` | Absolute instant on the **server** clock at which frame 0 occurs |
| `targetFrame` | The frame the shared clock says we should be on right now |
| **accumulator** | Real time carried between rendered frames, expressed in logical frames. Lives in callers, never in the engine |
| `delta` | Renderer-only: Pixi's frame delta, ~1.0 at 60fps. Never reaches the engine |

`update()` takes no argument and advances exactly one frame. Wall-clock pacing
is the caller's job.

### Board

| Term | Meaning |
|---|---|
| `grid[col][row]` | Column-major. Gravity walks one column, so columns are contiguous |
| `COLS` / `ROWS` | 6 columns, 12 visible rows |
| `HIDDEN_ROWS` / `TOTAL_ROWS` | 2 hidden rows above the visible board; 14 total |
| **vanish zone** | Rows above row 0. Traversable but not occupiable — locking there is a top-out |
| `c` / `r` | Column and row indices. Always in that order |

Note that a **larger** row index means **lower** on the board. Row 13 is the
floor.

### Piece

| Term | Meaning |
|---|---|
| `PuyoPair` | A pair of colours: `{ mainColor, subColor }`. What `nextPieces` and the bag hold |
| `ActivePiece` | A `PuyoPair` plus where it is: `{ x, y, rot, mainColor, subColor }` |
| **main** | The axis puyo — the one the pair rotates around, and the one that lands against the stack at rotation 0 |
| **sub** | The orbiting puyo. At rotation 0 it sits *above* main |
| `rot` | 0–3. Offsets are `[{0,-1}, {1,0}, {0,1}, {-1,0}]` |

`nextPieces` used to spell these `{ main, sub }` while `activePiece` spelled the
same two values `{ mainColor, subColor }`, so every spawn translated between
them. One spelling now, declared once.

### Garbage

The two fields below hold **different units**. This is the easiest thing in the
codebase to get wrong.

| Term | Unit | Meaning |
|---|---|---|
| **rock** | — | One garbage puyo |
| `nuisanceTray` | **points** | Incoming garbage that can still be cancelled by chaining. 70 points = 1 rock |
| `garbageQueue` | **rocks** | Committed garbage that will fall next turn. No longer cancellable |
| `scoreRemainder` | **points** | Sub-rock remainder carried between chain steps |

Points, not rocks, are the working unit: settling in points means a partial
counter-attack is preserved exactly instead of rounding away.

Flow: chain scores points → offset against `nuisanceTray` → surplus ÷ 70 sent
as rocks → at chain end, leftover tray points floor into `garbageQueue`.

### Input

Ten symbols, carried identically on the wire, in replays and to the opponent.
See [Replay format](#replay-format) for the table.

| Field | Meaning |
|---|---|
| `f` | Frame the input was taken on |
| `p` | Player index within the room: `0` or `1` |
| `i` | Input symbol |
| `a` | Amount — only used by `G` |

### Identity

Three distinct identifiers, deliberately not interchangeable:

| Term | Scope | Lifetime |
|---|---|---|
| `socketId` | One WebSocket connection | Dies on disconnect; changes on reconnect |
| `userId` | Database primary key | Permanent; absent for guests |
| `playerIndex` | Position within a room or replay (`0` or `1`) | The match |

Reconnection swaps `socketId` while keeping `userId` and `playerIndex`, which
is why room state is keyed by socket but *identity* is keyed by user.

### Engine inputs and outputs

The engine is a pure function of its seed, its config, and the inputs applied
to it. Everything else is a hook.

| Term | Meaning |
|---|---|
| `EngineConfig` | Handling settings that affect simulation: `sdf`, `softDropProtection`. Injected, never read from a global. Live play points it at the player's settings; replay and the opponent view point it at what was recorded |
| `onSound` | Reports audible moments (`chain`, `garbageLand`, `garbageSmall`, `garbageLarge`). Left unwired, the engine is silent — which is how replay and the opponent view stay quiet without a flag |
| `seed` | The only source of randomness. Same seed plus same inputs always produces the same game |

There is deliberately **no** `isReplaying` flag. It used to exist to select
recorded settings and mute audio; injected config and an optional hook do both
without a mode.

### Engines

There is one. `GameEngine`, in `packages/engine`, is the simulation, and every
consumer runs that same code:

| Consumer | Where | How it uses the engine |
|---|---|---|
| Local player | `src/scenes/GameScene.ts` | One engine, advanced by `MatchClock` |
| Opponent view | `src/core/OpponentView.ts` | A second engine fed by their relayed inputs |
| Replay playback | `src/core/ReplaySimulator.ts` | Two engines fed by the recorded log |
| Game server | `server/PuyoSimulator.ts` | One per player, fed by the wire |
| Puyo Mines | `server/MinesRoom.ts` | One per player, via `PuyoSimulator` |

`PuyoSimulator` keeps its name but is now an adapter, not an implementation: it
translates the wire alphabet into engine calls and shapes the engine's recorded
moments for `GameRoom`. It contains no rules
([ADR 0006](docs/adr/0006-shared-engine-package.md)).

`tests/engine/engineParity.test.ts` still compares the engine against the
adapter frame by frame, and still prints what it measured.

### The rules / presentation boundary

| File | Holds | May be imported by |
|---|---|---|
| `packages/engine/src/Constants.ts` | The rules: `COLS`, `ROWS`, `HIDDEN_ROWS`, `TOTAL_ROWS`, `PuyoColor` | Anything, including the server |
| `src/core/RenderConstants.ts` | How it looks: `CELL_SIZE`, `PUYO_COLORS` | Scenes only |

Splitting those apart is what made the extraction possible: a rule and a sprite
size were sitting in the same file, and only one of them belongs on the server.

The engine package compiles with **no DOM lib and no Node types**, so reaching
for `document`, `localStorage`, `Audio` or `process` inside it is a compile
error rather than a review comment. Its one host dependency, `console.warn`, is
declared explicitly in `packages/engine/src/env.d.ts`.

---

## Project layout

An npm workspace. The root, `packages/engine` and `server/` share one
`package-lock.json` and one `node_modules`; `api/` deliberately does not
([ADR 0006](docs/adr/0006-shared-engine-package.md)).

```
packages/
  engine/        THE SIMULATION — shared by the client and the game server
    src/
      Constants.ts   the rules: board size, colours
      Board.ts       grid, gravity, flood fill
      GameEngine.ts  state machine, scoring, garbage
      replay.ts      the replay format, declared once
      env.d.ts       the engine's entire dependency on its host
src/
  core/          clock, opponent view, replay, network, audio, settings
  scenes/        Pixi scenes: game, menu, quick play, replay
  screens/       React overlays and menus
  components/    shared React components
server/
  index.ts       socket handlers, matchmaking, rooms
  GameRoom.ts    per-room state, replay assembly
  PuyoSimulator.ts  adapter: wire alphabet in, recorded events out
  MinesRoom.ts   persistent free-for-all mode
api/
  src/routes/    REST endpoints
  src/services/  auth, match, leaderboard, XP
  prisma/        schema and migrations
tests/
  engine/        characterization, replay fidelity, clock, opponent view, parity
  helpers/       deterministic drivers and fixed seeds
docs/adr/        architecture decision records
```

The client resolves `@puyolive/engine` to the package's **source**, through an
alias in `vite.config.ts`, `vitest.config.ts` and `tsconfig.json`. The game
server resolves the same package through `node_modules` to its **built output**,
so `npm run build:engine` must run before `cd server && npx tsc --noEmit`.

### Where things live

| Concern | File |
|---|---|
| Simulation, state machine, scoring, garbage | `packages/engine/src/GameEngine.ts` |
| Grid, gravity, flood fill | `packages/engine/src/Board.ts` |
| Replay format declarations | `packages/engine/src/replay.ts` |
| Shared frame timeline | `src/core/MatchClock.ts` |
| Opponent simulation | `src/core/OpponentView.ts` |
| Replay playback | `src/core/ReplayEngine.ts`, `ReplaySimulator.ts` |
| Render loop, input, DAS/ARR | `src/scenes/GameScene.ts` |
| Wire alphabet to engine calls | `server/PuyoSimulator.ts` |
| Matchmaking, rooms, wire validation | `server/index.ts` |
| Accounts, ELO, leaderboard | `api/src/services/` |
| Test drivers and fixed seeds | `tests/helpers/scriptedRun.ts` |

---

## Known limitations

Stated up front rather than discovered.

- **Anti-cheat is not enforced.** See [Authority model](#authority-model).
- **The game server cannot scale horizontally.** Room state lives in process
  memory with no Redis adapter, so one instance is the ceiling.
- **Leaderboard rank is computed per request** as a count over the users table.
  Fine at current scale; needs a materialised column well before 100k users.
- **ELO is mildly inflationary.** The loser's rating is floored at 100, so
  total rating is not conserved when the floor binds.
- **Avatar uploads are unvalidated** beyond size limits.
- **Replays recorded before `ENGINE_VERSION` 2.0.0 cannot play back** and are
  gated out of the UI.

---

## Contributing

Working rules that keep this healthy — for future you, or for an assistant with
no memory of earlier sessions.

- **Never commit to `main` directly.** Watchtower deploys it within five
  minutes. Branch, let CI go green, then merge.
- **Run `npm test` before and after any engine change.** If piece sequences
  change, every stored replay is invalidated and `ENGINE_VERSION` must be
  bumped.
- **A changed golden is a finding, not a chore.** Investigate before updating.
- **Adding a socket event?** Validate the payload server-side and add it to the
  input whitelist. Never spread untrusted objects into settings.
- **Frame constants are in frames, not milliseconds**, and the engine is
  advanced exactly once per logical frame.
- **Adding an input symbol** means widening `InputType` in
  `packages/engine/src/replay.ts`, then handling it in `ReplaySimulator`,
  `PuyoSimulator.executeInput` and the server's wire whitelist. The alphabet
  itself is declared once, so the four handlers cannot disagree about what the
  symbols *are*.
- **The engine package stays pure.** No DOM, no Node APIs, no settings
  singleton, no renderer. Its tsconfig enforces this; if you find yourself
  fighting it, the code you are writing belongs in a consumer.

---

## Decision records

| ADR | Subject |
|---|---|
| [0001](docs/adr/0001-frame-timing.md) | Frame timing and the single-advance invariant |
| [0002](docs/adr/0002-replay-determinism.md) | Replays store a seed and an input log |
| [0003](docs/adr/0003-shared-match-clock.md) | Both players derive frames from a shared clock |
| [0004](docs/adr/0004-opponent-simulation.md) | The opponent's board is simulated, not relayed |
| [0005](docs/adr/0005-fixed-step-engine.md) | The engine is fixed-step and takes no delta |
| [0006](docs/adr/0006-shared-engine-package.md) | The engine is one package, shared by the client and the server |

---

## License

MIT
