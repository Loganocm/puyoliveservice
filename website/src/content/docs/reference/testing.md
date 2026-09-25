---
title: Testing
description: The test suites, what each one guarantees, how characterization goldens protect engine behaviour, and how to run everything locally.
sidebar:
  order: 8
---

## Running the tests

```bash
npm test                      # client, engine, server and tooling: 198 tests, ~5 s
npm run test:watch
npm run test:coverage         # v8 coverage of packages/engine and src/core
npm run typecheck             # client and tests
npx tsc -p server --noEmit    # game server (after npm run build:engine)
npx tsc -p scripts            # tooling
DATABASE_URL=postgres://… npm --prefix api test   # API: 85 tests against PostgreSQL
```

The root suite (`vitest.config.ts`) runs in Node with **no DOM**: the engine is
pure, so a test that needs `localStorage` or `Audio` means something has
coupled the engine to the browser again. Fix that rather than switching the
environment to jsdom. It resolves `@puyolive/engine` to the package **source**,
so a stale build can never make a red suite look green. Every test has a
20-second limit, so a simulation that loops forever fails instead of hanging.

The API suite (`api/`) needs a migrated PostgreSQL database; CI starts one
([CI/CD](/reference/ci-cd/)). Locally:

```bash
docker compose up -d db
export DATABASE_URL=postgres://postgres:<DB_PASSWORD>@localhost:5432/puyio_db
npm --prefix api run db:migrate && npm --prefix api test
```

## The suites

| Suite | Tests | Guarantees |
|---|---|---|
| `tests/engine/characterization` | 11 | The piece sequence of a seed, and board hashes over fixed seeds that pin gravity, matching, scoring, garbage and state timing (goldens); the hash reacts to grid and garbage changes |
| `tests/engine/replayFidelity` | 2 | Real matches rebuild from seed and inputs alone; every hash checkpoint reproduces |
| `tests/engine/engineParity` | 5 | The engine and the server's adapter agree frame by frame, with a driver good enough to chain (goldens) |
| `tests/engine/opponentView` | 8 | The opponent's board is reproduced cell for cell from their input stream |
| `tests/engine/matchClock` | 11 | Two clients with different clocks and latencies agree on frame numbers; catch-up is clamped; never runs ahead |
| `tests/input/handling` | 10 | DAS, ARR, ARR 0, last-press priority, spawn-frame moves, sub-frame taps, recording order |
| `tests/lab/catalogue` | 95 | Every animated action is demonstrated, every state transition is reached, scenarios are deterministic ([Animation catalogue](/reference/animation-catalogue/)) |
| `tests/server/*` | 14 | Room indices across reconnects, liveness, match result delivery, the Mines target board |
| `tests/core/*` | 10 | Personal bests, the frame-rate monitor |
| `tests/community/*` | 11 | The safe Markdown subset (no HTML, safe links only) and community routes |
| `tests/scripts/*` | 21 | The documentation check and changelog extraction |
| `api/src/tests/*` | 85 | Accounts, bans, matches, ratings, leaderboard, avatars, compression, forums, rate limits for the game server |

Negative controls are part of the design: different inputs must diverge, and
the hash must react to grid and garbage changes. A test that cannot fail
protects nothing.

## Characterization goldens

Snapshot files under `tests/**/__snapshots__/` are **behaviour contracts**,
not test output. If one changes, engine behaviour changed.

- Never update a snapshot to make a test pass. Find out what moved and why.
- A deliberate change updates the golden **with** an `ENGINE_VERSION` bump and
  an ADR, in the same change ([Change the engine](/guides/change-the-engine/)).
- CI fails if a snapshot changes during a test run, so `vitest -u` cannot
  launder a behaviour change into a green build, and `npm run docs:check`
  fails a change that edits a golden without a version bump or an ADR.

### Coverage floors

Some tests assert that the *drivers* still reach chains and garbage. Goldens
captured from a driver that tops out at once look green and protect nothing.
The engine parity suite once reported "identical for 3000 frames" while its
driver topped out within 250 frames and never reached `CHECK_MATCH`, and its
assertion looked for `'diverged'` in a message that said `'DIVERGED'`. Both
were fixed with ADR 0006; the suite now reports the frames it actually
compared.

## Browser checks

The animation lab and its recorders (`tests/lab/*.mjs`) drive the real client
in Chromium through Playwright: every catalogue scenario, every menu flow on a
desktop and a phone viewport, and a real two-player match between bots. They
are run by hand before and after visual changes, not in CI yet (QA-01).

## Testing multiplayer

Two tabs on one machine have almost no latency, which hides exactly the clock
and jitter-buffer behaviour that matters. Run the game server with injected
latency and a fixed seed:

```bash
SIMULATED_LATENCY_MS=80 DEV_FIXED_SEED=4242 npm run server
```

To reach the stack from another machine on your network, add its origin with
`EXTRA_CORS_ORIGINS=http://192.168.1.42:5173` ([Configuration](/reference/configuration/)).

## Known gaps

No socket-layer or end-to-end tests run in CI (QA-01), there is no lint
standard (QA-02), no property-based engine tests (QA-03) and no performance
budget (QA-04). See the [findings register](/review/findings/).
