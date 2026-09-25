---
title: Rules fidelity
description: How Puyo Live's rules compare with Puyo Puyo Tsu, the competitive standard — scoring tables, garbage, timing, piece generation and field rules, with sources.
sidebar:
  order: 2
---

Competitive Puyo has standardised on the rules of **Puyo Puyo Tsu** (1994):
its scoring, garbage and field behaviour are what the community's strategy,
terminology and chain theory assume. A game in this genre does not have to copy
Tsu, but every deviation changes how the game is played, so each one should be
a deliberate choice, recorded as a ruleset, not an accident.

This page compares the current engine with Tsu. Findings are in the
[register](/review/findings/) under `RUL-*`; the proposed ruleset model is in
[engine v2](/architecture/engine-v2/#rulesets).

## Sources

Puyo Nexus, the community wiki, is the usual reference but was unreachable from
the review environment, so tables were taken from an independent, executable
source and cross-checked where possible:

- **puyoai** (github.com/puyoai/puyoai), an open-source framework for writing
  Puyo Puyo Tsu AIs that play the real game. `src/core/score.h` gives the
  chain, colour and group bonus tables, the 1–999 multiplier clamp, 70 points
  per garbage and the all-clear bonus; `src/core/frame.h` gives frame timings;
  `src/core/kumipuyo_seq_generator.cc` reproduces the arcade Tsu sequence
  generator.
- Its cumulative score table (`ACCUMULATED_RENSA_SCORE`: 40, 360, 1000 … 36,840
  for a 10-chain of single four-groups) reproduces exactly from the tables
  below, which confirms they are read correctly.
- Published summaries of the Tsu rule (margin time, 30-garbage drop cap, quick
  turn, the hidden 13th row) agree with the above.

## Score formula

Both engines use the classic formula for each chain link:

```text
score = (10 × puyos cleared) × clamp(chain power + colour bonus + group bonus, 1, 999)
```

The formula matches. The tables and the clamp do not.

### Chain power

| Link | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 15 | 19+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Tsu** | 0 | 8 | 16 | 32 | 64 | 96 | 128 | 160 | 192 | 224 | 256 | 384 | 512 |
| **Puyo Live** | 0 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 | 65536 | 65536 |

Garbage sent by a chain of single four-puyo groups (70 points per garbage):

| Chain | Tsu | Puyo Live | Ratio |
|---|---|---|---|
| 5 | 69 | 69 | 1.0× |
| 7 | 197 | 288 | 1.5× |
| 10 | 526 | 2,336 | 4.4× |

A board holds 72 visible cells and at most 24–30 garbage fall per turn, so both
are lethal at 10, but at 6–8 links, the range most real games are decided in,
Puyo Live's attacks are far stronger. That rewards racing to a medium chain
over building a big one or countering.

### Colour and group bonus

| Colours in link | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **Tsu** | 0 | 3 | 6 | 12 | 24 |
| **Puyo Live** | 0 | 3 | 6 | 9 | 12 |

| Group size | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|---|---|---|---|---|---|---|---|---|
| **Tsu** | 0 | 2 | 3 | 4 | 5 | 6 | 7 | 10 |
| **Puyo Live** | 0 | 2 | 3 | 4 | 5 | 6 | 7 | size − 3 |

Tsu clamps the multiplier to 999; Puyo Live does not clamp it.

## Garbage

| Rule | Tsu | Puyo Live |
|---|---|---|
| Target point (points per garbage) | 70 | 70 |
| Remainder carried between links | Yes | Yes |
| Offsetting incoming with outgoing | Yes | Yes, in points (exact) |
| Margin time (target point falls over time) | Target point × 0.75 every 16 s after the margin, until 1 or 14 steps | Setting exists; **not implemented** (RUL-10) |
| All-clear bonus | Next chain sends 30 extra (2,100 points) | **None**, visual only (RUL-09) |
| Most garbage per drop | 30 (5 rows) | 24 (4 rows) (RUL-11) |
| Column distribution | Full rows, then remainder in random distinct columns | Same |
| Garbage of a chain in progress | Held until that chain ends | Droppable at the receiver's next placement (RUL-13) |
| Placement points feed garbage | Soft-drop points count | No (RUL-14) |

## Timing

| Event | Tsu (frames at 60 fps) | Puyo Live |
|---|---|---|
| Vanish animation per link | 50, constant | 18 at link 1, then `9 × (1 + 0.3 × 1.3^(n−1))`: 37 at link 10, 312 at link 19 (RUL-03) |
| Move a pair 1 / 3 / 5 columns (held) | 4 / 8 / 12 | 0 / 40 / 70 with default DAS 25, ARR 15: the first step is instant, the rest are slow (CLI-12) |
| Natural fall | Level-dependent, half-cell steps | 30 frames per row, whole-cell steps |

## Field and piece rules

| Rule | Tsu | Puyo Live |
|---|---|---|
| Field | 6 × 12 visible, 13th row hidden, 14th row vanishes | 6 × 12 visible, 2 hidden rows |
| Hidden rows in chains | 13th-row puyos never pop | Both hidden rows can pop and trigger (RUL-07) |
| Top-out | Column 3, row 12 (the X) filled | Topmost hidden cell of column 3 filled at spawn (RUL-06) |
| Movement above the field | Constrained | Free (TETR.IO-style) |
| Quick turn (180° in a 1-wide well) | Yes | **No** (RUL-08) |
| Kicks | Wall push, floor kick | Wall, floor and diagonal |
| Lock stalling | Arcade infinite-rotation stall was a bug fixed later | Unlimited resets, plus a hold-to-pause glide buffer (RUL-05) |
| Colours in versus | 4 | 5 (RUL-12) |
| Sequence | 256 puyo (64 × 4 colours) shuffled into 128 pairs; first 3 pairs ≤ 3 colours; same for both players | 100-pair decks of ordered pairs; **diverges between players once garbage is received** (RUL-04) |

## What this means

Two of these are **bugs regardless of design intent**: pieces diverging after
garbage (RUL-04) breaks the fairness promise of a shared sequence, and
unlimited stalling (RUL-05) is an exploit. They are scheduled for engine v2.

The rest are **ruleset decisions**. The recommendation is to stop treating
"the rules" as one thing:

- **Tsu** for ranked play: the tables, timing and field rules above, four
  colours, a lock-reset budget. Strategy knowledge from 30 years of the genre
  transfers directly, and results are comparable.
- **Puyo Live** (the current rules, with its bugs fixed) for casual play and
  Puyo Mines, where the faster, more explosive rules are part of the fun.

Both become data in a versioned ruleset object that the replay records, so old
replays keep playing under the rules they were recorded with.
