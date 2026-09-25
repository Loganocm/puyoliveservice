---
title: Visual identity
description: The art direction for Puyo Live's own look — pieces, board, colour, type, motion and backgrounds — and the theme system that implements it.
sidebar:
  order: 1
---

**Status:** adopted in 0.3.0; pieces redrawn as the Circuit skin, and skins
made player-selectable, after 0.3.0. The implementation is `src/theme/` (board,
menus) and `src/skins/` (pieces); this page is the specification they follow.
The skin file format is on [Skins](/reference/skins/).

## Why

The game looked like a copy (CLI-14): recycled pieces in the official games'
style, unrelated stock photographs behind the board, and generic menus. It also
could not legally be sold that way (LEG-01). Games with devoted communities,
such as osu! and TETR.IO, are recognisable from one frame. That comes from a
handful of strong decisions applied everywhere, not from lavish art.

## Principles

1. **The board is the brightest thing on screen.** Everything else supports it
   and never competes with it.
2. **Readable at speed.** Colour, shape and value (lightness) each distinguish
   pieces, so they stay distinct for colour-blind players, on bad screens and in
   peripheral vision.
3. **Connection is the mechanic, so connection is the visual.** Same-colour
   neighbours visibly *fuse*. You can see a group forming before it pops.
4. **Drawn in code.** Pieces, board, icons and backgrounds are generated at
   runtime. Nothing to license, nothing to download, and sharp at any size and
   pixel density. Players can replace the pieces with a skin of their own.
5. **Hard edges.** Pieces are built from crisp shapes: outlines, flat colour,
   hard-edged highlights. Nothing on a piece is blurred, so it reads cleanly at
   play size, on a 1x screen as well as a 3x one.
6. **One source of truth.** A single set of theme tokens drives the canvas
   (PixiJS) and the menus (CSS), so they cannot drift apart.

## Pieces: Circuit

The default skin, **Circuit**, draws each puyo like a keycap on a rail:

- a **crisp outline** in a deep shade of the piece colour;
- a flat, saturated **rail** that joins same-colour neighbours at full width,
  so a group reads as one solid capsule or block, with no necks and no seams
  (a small filler closes the centre of 2x2 blocks);
- a raised **cap** on each piece with a machined **bevel** (light along the
  top, shadow along the bottom), a hard-edged **gloss band** and one small,
  sharp **glint**;
- the colour's **symbol engraved** in the cap: a dark cut with a light lip.

Garbage is a **bolted steel plate**: the same build in grey, with no gloss, a
recessed centre and four rivets. The ghost is the piece's outline with a faint
fill. Tray icons and the death-cell reticle use the same flat-and-outlined
finish.

Orbs have **no faces**. The official characters' eyes are the most
recognisable part of that design and the part most clearly owned by it; a
piece without a face is unmistakably this game's own.

Each colour carries a **symbol**, so colour is never the only cue:

| Colour | Hex | Symbol |
|---|---|---|
| Red | `#FF5A6A` | circle |
| Green | `#3DDC97` | triangle |
| Blue | `#4C8DFF` | square |
| Yellow | `#FFD23F` | diamond |
| Purple | `#B57BFF` | plus |
| Garbage | `#8A93A6` | none; a bolted plate |

The hues are spaced around the wheel *and* separated in lightness (yellow
lightest, blue darkest), which keeps them apart under the common colour-vision
deficiencies. Symbols can be switched to bold for players who need them and
off for players who do not; bold symbols are drawn over imported art too.

### Skins

Pieces come from the player's **skin** (Settings, Display). Built in:

| Skin | Look |
|---|---|
| **Circuit** (default) | The keycaps above, round |
| **Tile** | The same finish on rounded squares, in the manner of modern block-puzzle games |
| **Contrast** | Circuit in maximum-contrast colours (formerly the high-contrast theme's pieces) |
| **Gel** | The soft glossy orbs of 0.3.0, joined like beads |

A skin is a folder: a `skin.json` and any images it wants to replace, in the
way of osu! skins; everything it leaves out is drawn by its style in its
colours. Players import skins as a .zip or a folder, export any skin as an
editable template, and can drop in a classic community `puyo.png` sheet as it
is. The format is specified on [Skins](/reference/skins/), and
[Make a skin](/guides/make-a-skin/) walks through making one. Skins are
cosmetic only: they never touch the simulation, and they stay on the
player's device.

## Board

- A **frosted glass panel**, slightly lighter than the background, with a faint
  cell grid. Not a black void, and not a heavy white frame.
- A thin accent rim that reacts to play: it glows with the chain colour during
  a chain and pulses red when the stack is near the top (the danger state).
- The death cell is a **ring marker** in the accent colour that pulses faster
  as the stack approaches it, replacing the red X.
- The hidden rows fade out above the top edge instead of drawing over the UI.

## Colour system

| Token | Dark (default) | Role |
|---|---|---|
| `bg.base` | `#0B0E17` | Page and canvas background |
| `bg.raised` | `#131826` | Panels, cards |
| `bg.board` | `rgba(26,32,52,0.72)` | The board panel |
| `line.subtle` | `rgba(255,255,255,0.06)` | Grid, dividers |
| `text.primary` | `#EEF1F8` | Headings, numbers |
| `text.muted` | `#8C95AB` | Labels |
| `accent.primary` | `#FF4F7B` | Brand, primary actions, chain glow |
| `accent.secondary` | `#35D0E6` | Secondary actions, links, focus |
| `state.danger` | `#FF5A5A` | Danger state, destructive actions |
| `state.success` | `#3DDC97` | Wins, confirmations |

The brand pair (hot pink and cyan) is energetic and competitive without
borrowing from any existing game's palette.

## Type

- **Display:** Fredoka (SIL Open Font License), a rounded geometric sans that
  echoes the orbs. Used for the wordmark, headings and big numbers.
- **UI:** the system font stack, for speed and legibility.
- **Numbers** in the HUD use tabular figures so scores do not jitter as they
  change.
- Fonts are **self-hosted** (bundled with the client), removing a
  render-blocking third-party request.

## Motion

| Moment | Motion | Duration |
|---|---|---|
| Spawn | Scale from 70% with a slight overshoot | 8 frames |
| Land / lock | Squash and stretch of the whole connected group | 12 frames |
| Pop | The group glows, swells 8%, then bursts into droplets and a ring | Pop duration (engine) |
| Cascade | Eased fall, squash on landing | Fall duration (engine) |
| Chain | Big numeral beside the board, scale-in with overshoot, coloured by chain size | 45 frames |
| Garbage | Falls with a heavier ease and a dust puff | Engine |
| Danger | Board rim and death ring pulse | Continuous |

Rules: motion never delays input or the simulation; it only decorates it.
Screen shake is capped and scaled by the player's setting. **Reduced motion**
(from the OS setting or the game's) turns shake and large-scale effects off
and keeps essential state changes (pops, landings) as short fades.

## Backgrounds

Stock photographs are replaced by an **ambient field**: a few large, soft,
slowly drifting light blobs in the theme's hues over the base colour, drawn on
the canvas. It weighs nothing to download and never competes with the board.
It responds gently to play (a brief brightening on big chains).

## Themes

The token set supports multiple themes without new art:

- **Midnight** (default): the dark palette above.
- **Daybreak**: a light variant for bright rooms (defined, not yet offered).
- **High contrast**: pure black board and bright edges.

Themes colour the board and menus; piece colours belong to the skin. Players
who chose the high-contrast theme before skins existed start on the Contrast
skin.

## What this does not change

Board size, rules, piece colours' *identities* (red is still red), timings and
input. The redesign is presentation only: the engine, replays and the
[animation catalogue](/reference/animation-catalogue/) scenarios are identical
before and after, which is how the before-and-after comparison is fair.
