# 6. The engine is one package, shared by the client and the server

**Status:** Accepted
**Date:** 2026-08-25

## Context

The simulation was implemented twice.

`src/core/GameEngine.ts` ran in the browser. `server/PuyoSimulator.ts` was a
960-line hand-mirrored copy of the same rules, headed by a comment reading
"Must match client GameEngine logic exactly". Every rules change had to be made
in both, correctly, or the server's mirrored simulation and every stored replay
diverged from what players actually saw.

The duplication was not limited to the simulation. Six replay-format
declarations — `ENGINE_VERSION`, `InputType`, `ReplayInput`, `StateHash`,
`DeterministicEvent` and `ReplayFileV3` — existed as byte-identical copies in
`src/core/ReplayEngine.ts` and `server/GameRoom.ts`. That is the more dangerous
kind of duplicate: two structurally identical types type-check against each
other happily, so a copy that drifts produces a replay one side cannot read
rather than a compile error. Adding one input symbol meant editing five places.

The prerequisite work was already done (ADRs 0001–0005). The engine was
fixed-step, took an injected `EngineConfig`, reported audio through an
`onSound` hook, and touched no browser global. `Constants.ts`, `Board.ts` and
`GameEngine.ts` formed a closed dependency island, with presentation constants
already split out into `RenderConstants.ts`.

What remained was to prove the two implementations actually agreed, and then to
delete one of them.

## What the parity measurement actually showed

`tests/engine/engineParity.test.ts` reported "identical for 3000 frames" across
30 seed × SDF combinations. Two things about that were wrong.

**The assertion could not fail.** It filtered results for the string
`'diverged'` while the failure branch wrote `'DIVERGED'`. The suite reported
green whatever it measured.

**The runs were not 3000 frames.** The adversarial driver injects garbage on
roughly one frame in fourteen while moving at random, so it buried the board
and topped out in 60–250 frames. It never reached `CHECK_MATCH` even once.
Chain scoring, cascade timing, the group and colour bonuses, the offset
arithmetic and the garbage column shuffle — the parts most likely to have
drifted between two hand-maintained copies — were never compared at all.

Both are fixed here. A second, heuristic driver now plays well enough to build
chains, and the two implementations were compared under it before one was
deleted: ~16,000 frames of real games across the same 30 combinations, still
identical, this time through the paths that matter. The reported figure is now
the frames actually compared rather than the frame budget.

## Decision

**One engine, in `packages/engine`, consumed by both.**

The repository becomes an npm workspace. `Constants.ts`, `Board.ts` and
`GameEngine.ts` move into `packages/engine/src` unchanged in behaviour, joined
by `replay.ts` holding the format declarations both sides need.

### `PuyoSimulator` becomes an adapter

It keeps its name and its entire public surface — `executeInput`, `isGameOver`,
`spawnedPieces`, `garbageColumnLog` and the seven recording hooks — so
`server/index.ts` and `server/MinesRoom.ts` needed no changes beyond one type
annotation. What it no longer contains is any rules.

What is left is genuinely server-specific: translating the ten-symbol wire
alphabet into engine calls, and shaping the engine's recorded moments the way
`GameRoom` wants to store them.

### The engine gained four hooks, and no behaviour

The server records events the client never needed: which bag was shuffled, which
colour groups triggered a chain step, when a chain ended, and which column order
a garbage drop used. Two of those are consumed inside the state machine and
never exposed again, so no adapter could observe them from outside.

`onBagGenerated`, `onMatchFound`, `onChainEnd` and `onGarbageDrop` were
therefore added to the engine, firing at exactly the points the mirrored
simulator fired its equivalents. Each is optional and unset by default, so a
consumer that ignores them sees the engine it had before.

### Piece pairs have one spelling

`nextPieces` held `{ main, sub }` while `activePiece` held
`{ mainColor, subColor }` for the same two values, so every spawn translated
between them. The type is now declared once, as `PuyoPair`, with
`ActivePiece extends PuyoPair`. This was the commit to do it in: the type
became shared here, so it could be spelled correctly exactly once.

### Purity is enforced by the compiler, not by review

`packages/engine/tsconfig.json` compiles with `lib: ["ES2022"]` and
`types: []` — neither the DOM nor Node's globals are in scope. Reaching for
`document`, `localStorage`, `Audio` or `process` in the engine is now a
compile error rather than a review comment. The one host facility the engine
genuinely uses, `console.warn`, is declared explicitly in `src/env.d.ts` so the
dependency is visible instead of inherited.

### The client reads source; the server reads the build

The package publishes `dist/` for the game server, which imports it through
node and needs real JavaScript with real file extensions. The browser client
has a bundler, so `vite.config.ts`, `vitest.config.ts` and `tsconfig.json` all
alias `@puyolive/engine` to `packages/engine/src` instead.

That asymmetry buys two things: `npm run dev` needs no watch task on the
package, and the test suite exercises the source the client ships, so a stale
`packages/engine/dist` can never make a red suite look green. It costs one
thing: the engine must be built before the game server can be type-checked,
which CI now does explicitly.

### The API is deliberately not a workspace

npm workspaces hoist `node_modules`, which would relocate Prisma's generated
client and force changes to both the `postinstall: prisma generate` hook and
`api/Dockerfile`.

The API does not use the engine, so it gains nothing from the workspace. It
keeps its own `package-lock.json`, its own `node_modules` and its own build
context, and this change does not touch `api/Dockerfile`,
`api/.dockerignore` or `api/tsconfig.json` at all. The hoisting problem is
avoided rather than solved, which is cheaper and less to go wrong.

### Build contexts moved with the files, in the same commit

`server/` built with context `./server`, which cannot see a sibling
`packages/`. The game server image now builds from the repository root with
`dockerfile: server/Dockerfile`, in `docker-compose.yml` and
`.github/workflows/deploy.yml` alike, and a root `.dockerignore` keeps the
Postgres bind mount and the client's asset bundle out of that context.

This had to land atomically. A commit where file locations and build contexts
disagree builds nothing, and Watchtower deploys whatever reaches GHCR within
five minutes.

## Consequences

- A rules change is made once. The class of bug where the server's mirror
  disagrees with the client is gone, not merely tested for.
- Adding an input symbol now touches the engine, `ReplaySimulator`, the server's
  wire whitelist and `PuyoSimulator.executeInput` — four places, not five, and
  the alphabet itself is declared once.
- `server/PuyoSimulator.ts` went from 960 lines to 229, none of which are rules.
- The parity suite outlives the duplication it measured. It still compares the
  engine against the adapter, and it gained goldens capturing the mirrored
  simulator's **recording surface** — the frame each hook fires on and the
  order they fire in, which the frame-by-frame check never covered because the
  client engine had no equivalent to compare against. Those goldens were
  captured from the old implementation before it was deleted, and the adapter
  reproduces them exactly.
- `npm ci` at the root now installs the client, the engine and the game server
  together. The API still installs separately.
- Puyo Mines is unchanged. Its known client/server divergence is deferred and
  was explicitly out of scope; it consumes `PuyoSimulator` through the same
  surface as before.

## Related

- ADR 0001 — frame timing (the duplicated frame constants this removes)
- ADR 0002 — replay determinism (the duplicated format declarations this removes)
- ADR 0005 — fixed-step engine (the prerequisite that made the engine portable)
