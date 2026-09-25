---
title: Quality and testing
description: Review of the test suites, coverage gaps and code standards, and the test strategy that closes them.
sidebar:
  order: 8
---

Findings: `QA-01` to `QA-04`, `OPS-06` in the [register](/review/findings/).

## The engine suite is a model

Characterization goldens, replay fidelity measured as a percentage, parity
between implementations, negative controls that prove the hash reacts, coverage
floors that fail when a test driver stops reaching the code it claims to test,
and a CI step that fails if goldens change during a run. This is better than
most commercial game test suites. The testing problem is everything around it.

## Gaps

| Layer | Tests before this review | Gap |
|---|---|---|
| Engine | Characterization, fidelity, parity | Nothing proves every state and transition is reached; no invariants over random play (QA-03) |
| Client core | Match clock, opponent view | Input layer, scenes, network manager (QA-01) |
| Game server | Engine parity via the adapter | Socket handlers, rooms, matchmaking, reconnect (QA-01) |
| API | 63 tests, 2 failing, not in CI (OPS-06, fixed) | Admin routes, avatars |
| UI | None | Every screen (QA-01) |
| End to end | None | Nothing starts the real stack and plays (QA-01) |
| Performance | None | Bundle size, asset weight, frame time (QA-04) |

Two of this review's bugs lived in the untested layers: unrecorded spawn-frame
moves (NET-06) and lost key taps (CLI-11).

## Strategy

The test pyramid, adapted to a deterministic game:

1. **Engine scenarios.** A catalogue of named, seeded scenarios (wall kick,
   floor kick, quick turn, offset, all clear, top-out by spawn, top-out by
   lock, soft-drop protection, glide) each asserting exact outcomes, plus a
   **state-transition coverage** test that fails if any engine state or
   transition is never reached. This is what "every logically possible game
   state" means in practice: the state machine is small and fully enumerable,
   so coverage of states *and* edges is achievable and checkable.
2. **Properties.** Random seeded input streams checked against invariants
   after every frame: no floating puyos while a piece is active, no
   unresolved groups of four, puyo counts conserved, determinism under replay,
   hash sensitivity. Property-based testing (QuickCheck, Claessen & Hughes
   2000; fast-check in JavaScript) finds the cases nobody thinks to write down,
   and shrinks failures to minimal reproductions.
3. **Unit tests** for the input layer, match clock, rooms and services.
4. **Browser end-to-end** with Playwright against the real stack: a seeded
   demo mode drives the actual client through scripted play, asserts engine
   state through a test hook, and saves screenshots for visual review.
5. **Budgets** in CI: bundle and asset size limits that fail the build.

## Standards

There is no lint or format configuration (QA-02): 138 explicit `any`s and 214
console calls. Recommended: Biome (one fast tool for lint and format), adopted
in "report" mode on existing code and "enforce" mode on changed lines, so the
baseline improves without a disruptive reformat of 25,000 lines.
