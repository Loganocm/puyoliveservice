---
title: Change the engine
description: How to change game rules or timing in packages/engine without breaking replays — goldens, ENGINE_VERSION, the ADR and the pages to update.
sidebar:
  order: 1
---

The engine is the one part of the code where a small change can silently
rewrite every recorded match. This is the procedure; the reasons are in
[ADR 0002](/decisions/0002-replay-determinism/) and
[ADR 0006](/decisions/0006-shared-engine-package/).

## Before you start

- Read [Game rules](/reference/rules/) and [Frame timing](/reference/frame-timing/)
  for the behaviour as it is, and the [findings register](/review/findings/)
  for what is known to be wrong with it. Rules marked *Decision* need an owner's
  ruleset choice, not a quiet fix.
- Run `npm test` so you know the suite is green before you touch anything.

## Refactoring (no behaviour change)

1. Change the code in `packages/engine/src/`.
2. `npm test`. Every characterization golden must be unchanged. If one
   changed, this is not a refactor: go to the next section.
3. `npm run build:engine` (the engine's own type check, with no DOM and no
   Node types) and `npx tsc -p server --noEmit`.
4. Update any page that names what you moved (`npm run docs:check` tells you
   which rule applies) and add a `### Changed` line to the changelog if anyone
   outside the engine would notice.

## Changing behaviour

1. **Write the ADR first**, as *Proposed*: what changes, why, and what happens
   to existing replays ([Write an ADR](/guides/write-an-adr/)).
2. Change the code, and add a test that pins the new behaviour (a unit test, or
   a catalogue scenario if it is visible: [Add a catalogue
   scenario](/guides/add-a-catalogue-scenario/)).
3. Run `npm test`. The characterization suites fail; read the diff and make sure
   **everything** that moved is explained by your change. An unexplained moved
   golden is a bug you have not found yet.
4. Update the goldens: `npx vitest run -u tests/engine`, then read the snapshot
   diff once more.
5. Bump `ENGINE_VERSION` in `packages/engine/src/replay.ts` (the rules for the
   number are in [Versioning](/reference/versioning/)).
6. Update [Game rules](/reference/rules/) or [Frame timing](/reference/frame-timing/),
   the [fidelity review](/review/rules-fidelity/) if it compares this rule with
   Tsu, and the finding's status in the register.
7. Add the changelog entry under `### Changed`, citing the finding
   (`**RUL-05**: ...`), and mark the ADR *Accepted*.
8. `npm run docs:check` must pass: it refuses a golden change that has neither a
   version bump nor a new ADR.

## Things that are always engine behaviour

- Anything that draws from the random generator, or changes how often it is
  drawn: the piece sequence and the garbage columns share it (RUL-04).
- Any timer, including chain pop and fall durations.
- Scoring and garbage arithmetic, including rounding.
- The order of state transitions within a frame.
- Adding an input symbol: widen `InputType` in `replay.ts`, then handle it in
  `ReplaySimulator.executeInput`, `PuyoSimulator.executeInput` and the
  server's `record_input` whitelist, and document it in
  [Replay format](/reference/replay-format/#inputs).

## Never

- Update a golden to make a test pass without knowing why it moved.
- Read settings, time, `Math.random` or the DOM inside `packages/engine`.
- Call `engine.update()` anywhere but the one step function of each mode.
