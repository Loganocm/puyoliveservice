---
title: Add a catalogue scenario
description: How to add a seeded scenario to the animation lab, prove it shows what it claims, and record it.
sidebar:
  order: 4
---

Scenarios live in `src/lab/scenarios.ts`, the animations they demonstrate in
`src/lab/animations.ts`. Every animation must be demonstrated by at least one
scenario, and every scenario must prove what it claims
([Animation catalogue](/reference/animation-catalogue/)).

## 1. Describe the situation

A scenario is data:

```ts
{
    id: 'chain-2',                         // also the URL: /?lab=chain-2
    title: 'A 2-chain',
    notes: 'What to look at in the recording.',
    covers: ['clear.chain-text', 'clear.cascade-fall', 'garbage.send', 'clear.all-clear'],
    seed: 1017,                            // next free seed: unique per scenario
    board: ['RG....', 'RG....', 'RG....'], // bottom-aligned; the last row is the floor
    queue: ['RG', 'BY', 'PB'],             // main then sub
    script: [{ f: 3, i: 'L' }, { f: 6, i: 'L' }, { f: 12, i: 'HD' }],
    frames: 140,
    expect: { maxChain: 2, garbageSent: 5, board: ['......'] },
}
```

- **Board notation** (`src/lab/board.ts`): `.` empty, `R G B Y P` colours,
  `O` garbage. Up to 14 rows; with all 14, the top two are the hidden rows.
- **Script steps** use the [input alphabet](/reference/replay-format/#inputs)
  (`{ i: 'CW' }`) at an absolute frame (`f`) or anchored to a piece's life:
  `{ piece: 2, on: 'grounded', plus: 3, i: 'R' }`, `{ piece: 1, on: 'y', y: 10, i: 'SU' }`.
  Keyboard scenarios use `{ key: 'moveLeft', down: true }` or `{ tap: 'hardDrop' }`
  and set `browserOnly: true`.
- `expect` pins the outcome: final state, max chain, garbage sent, or the exact
  final board.

## 2. Add the animation, if it is new

In `src/lab/animations.ts`, add an entry with an id (`group.name`), a title
that says what the player sees, the code that produces it, and its layer. In
`src/lab/session.ts`, add its **witness**: a rule over the run's trace that is
true only if the animation really happened. Engine animations are witnessed
headless; client ones (`layer: 'client'`) by the recorder in a browser.

## 3. Check it

```bash
npx vitest run tests/lab
```

The suite fails if the scenario does not witness everything in `covers`, if
its expectations do not hold, or if two runs differ.

## 4. Record it and look

```bash
npm run build && npx vite preview --port 5173
node tests/lab/record-catalogue.mjs --only <id> --label check
```

Watch `artifacts/catalogue/check/<id>.webm` and the keyframes beside it. The
recorder fails if the browser run disagrees with the headless one.

## 5. Document it

Add the scenario and any new animation to the tables on
[Animation catalogue](/reference/animation-catalogue/).
