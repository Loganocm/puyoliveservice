---
title: Skins
description: The skin format, version 1 — the folder, skin.json, every element file and its layout, the neighbour bits, classic community sheets, fallback rules, limits, and how skins are imported, exported and stored.
sidebar:
  order: 12
---

A skin changes how the pieces look. It is a **folder** (or a .zip of one)
holding a `skin.json` and any of the element files below. Every file is
optional: whatever a skin leaves out is drawn by its **style** in its colours,
the way an osu! skin falls back to the default for missing elements. So a
skin can be anything from a recolour (`skin.json` alone) to hand-drawn art
for every piece.

Skins are cosmetic. They never affect the simulation, replays or the other
player's view, and imported skins stay in the player's browser. The design
decision is [ADR 0008](/decisions/0008-skins-are-data/); a walkthrough is
[Make a skin](/guides/make-a-skin/).

## Folder

```
my-skin/
  skin.json            required: name, colours, style
  puyo-red.png         optional: one colour's pieces, 16 frames
  puyo-green.svg       …any image format below, per file
  garbage.png
  ghost.png            or ghost-red.png, ghost-green.png, …
  junction-red.png
  tray-small.png … tray-crown.png
  marker.png
  particle.png
  ring.png
  README.txt           anything else is ignored
```

Names are case-insensitive. Images may be PNG, WebP, JPEG or SVG; SVG is
drawn at the size it is shown, so it stays sharp on every screen.

## skin.json

```json
{
  "format": 1,
  "name": "Neon",
  "author": "you",
  "version": "1.0.0",
  "description": "Bright pieces on a dark rail.",
  "style": "circuit",
  "shape": "tile",
  "colors": {
    "red": "#FF2E88",
    "blue": { "base": "#3AA0FF", "light": "#B8DCFF", "dark": "#0E4C99" }
  },
  "symbols": { "red": "diamond", "yellow": "circle" },
  "symbolsInArt": false
}
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `format` | `1` | 1 (with a warning) | The format version. Other versions are refused |
| `name` | text, ≤ 60 | required | Shown in the picker |
| `author`, `version` | text, ≤ 60 / 20 | empty | Shown in the picker |
| `description` | text, ≤ 280 | empty | |
| `style` | `circuit` or `gel` | `circuit` | The painter for everything the skin does not supply as a file |
| `shape` | `round` or `tile` | `round` | Circuit's outline: puyos or rounded squares |
| `colors` | object | Puyo Live's palette | Per colour (`red`, `green`, `blue`, `yellow`, `purple`, `garbage`): a `#RRGGBB` base, or `{ base, light?, dark? }`. Missing shades are derived from the base |
| `symbols` | object | circle, triangle, square, diamond, plus | The colour-blind symbol per colour: `circle`, `triangle`, `square`, `diamond`, `plus` |
| `symbolsInArt` | boolean | `false` | The art already shows symbols, so the game never draws them over it |
| `classic` | object | see below | Where a classic `puyo.png` sheet keeps its extra elements |

Colours matter even for skins made entirely of art: pop bursts, glows and
chain callouts use them. When a skin supplies a colour's pieces as art but no
colour for it, the game samples the art's average colour.

Unknown fields and values the game does not understand are reported as
warnings and replaced by defaults; only a missing `name`, an unsupported
`format` or unreadable JSON stops an import.

## Elements

| File | Size | Content |
|---|---|---|
| `puyo-<colour>.<ext>` | 16 square frames in a row, or one square | One colour's piece in all 16 neighbour combinations (below). A single square is used for every combination: no visible joins |
| `pieces.<ext>` | 16 columns × 6 rows of square frames | Every piece: rows red, green, blue, yellow, purple, garbage; columns by neighbour bits |
| `puyo.<ext>` | 16 × 16 grid | A classic community sheet (below) |
| `garbage.<ext>` | one square | The garbage piece. Garbage never joins |
| `ghost-<colour>.<ext>` | one square | Where a pair will land |
| `ghost.<ext>` | one square, white or grey | One ghost for every colour, tinted with the colour |
| `junction-<colour>.<ext>` | one square | Drawn centred on the corner shared by a 2×2 block of one colour, to fill a gap your joins leave there. Leave it out if they leave none |
| `tray-<icon>.<ext>` | one square | Pending-garbage icons: `small` (1), `big` (6), `rock` (30), `star` (180), `moon` (360), `crown` (720) |
| `marker.<ext>` | one square, or frames in a row | The death-cell marker. One frame is made to breathe; several are played as a loop |
| `particle.<ext>`, `ring.<ext>` | one square, white | Pop droplets and burst rings; the game tints them |

Frames are drawn to fill one board cell. Joins should run to the edge of the
frame so neighbouring frames meet; the game draws joined pieces a hair
oversize to hide the seam.

When several files could supply a piece, the most specific wins:
`puyo-red.png`, then `pieces.png`, then `puyo.png`, then the style's painter.

### Neighbour bits

A frame's number (its column) is the sum of the directions in which the piece
touches a piece of the same colour:

| Up | Right | Down | Left |
|---|---|---|---|
| 1 | 2 | 4 | 8 |

Frame 0 is a lone piece, 5 (up + down) the middle of a column, 15 a piece
surrounded on all sides. So a 16-frame strip runs:

```
 0 lone      4 down         8 left          12 left+down
 1 up        5 up+down      9 left+up       13 left+up+down
 2 right     6 right+down  10 left+right    14 left+right+down
 3 up+right  7 up+right+down 11 left+up+right 15 all four
```

### Classic community sheets

Puyo fan games share a sprite-sheet layout: a square image of 16 × 16 cells
(often 512 × 512, 32 pixels a cell). Puyo Live reads it directly, as
`puyo.png` in a skin folder, or dropped in on its own under any name:

| Where | What |
|---|---|
| Rows 0–4 | Red, green, blue, yellow, purple pieces |
| Column | Neighbour bits in the classic order: **1 down, 2 up, 4 right, 8 left** (converted automatically) |
| Row 9, column 10 | Garbage (`classic.garbage`) |
| Row 11, columns 1–6 | Tray icons small to crown (`classic.tray` is the first) |
| Row 12, columns 7–11 | The death marker's frames, played forward then back mirrored (`classic.marker`, `classic.markerFrames`) |

Sheets that put these elsewhere say so in `skin.json`:
`"classic": { "garbage": [9, 10], "tray": [11, 1], "marker": [12, 7], "markerFrames": 5 }`
(`[row, column]`, counting from 0). Ghosts and junctions are drawn by the
style. Many community sheets are derived from official art; that is between
their authors and the rights holders, and such sheets are for personal use.

## Styles

A style draws everything a skin leaves out, in the skin's colours:

| Style | Pieces | Joins |
|---|---|---|
| `circuit` | Keycap on a rail: crisp outline, flat rail, bevelled cap, hard gloss band, engraved symbol. `shape` picks round or tile | Full width, with junction fillers |
| `gel` | Soft glossy orbs with radial shading | Narrow bridges (beads) |

Specified in [Visual identity](/design/visual-identity/#pieces-circuit).
Painters live in `src/skins/painters/`.

## Symbols over art

With the player's symbol setting on **Bold**, the game draws each colour's
symbol over pieces that come from art, unless `symbolsInArt` is true. On
**Subtle** only painted pieces show symbols; **Off** shows none.

## Limits

An import is refused, before anything is decoded, if it has more than 64
files, a file larger than 4 MB, more than 16 MB in all, or a `skin.json`
larger than 64 KB. Images larger than 4096 pixels a side are skipped (the
style draws that element instead) and reported.

## Import, export and storage

- **Settings → Display → Skin**: a card per skin with a preview drawn by the
  skin itself.
- **Import skin** takes a .zip, a set of files, or one image (a classic
  sheet); **Import folder** takes a folder. Warnings are shown; the skin is
  selected on success.
- **Export template** downloads the selected skin as a .zip: every element as
  a 128-pixel PNG, a `skin.json` and a README. Edit and import it back.
- Imported skins are stored in the browser's IndexedDB (database `puyolive`,
  store `skins`); the choice in `localStorage` (`puyolive_skin`). Nothing is
  uploaded. See [Configuration](/reference/configuration/#in-the-browser).
- The animation lab always uses the default skin, so catalogue recordings
  compare across machines.

## Code

| Concern | File |
|---|---|
| The format: manifest, element names, bit conversion, the plan of sources | `src/skins/format.ts` (tested) |
| Reading a .zip or folder | `src/skins/archive.ts` (tested) |
| Composing the atlas the board draws from | `src/skins/compose.ts`, layout in `src/skins/atlas.ts` |
| Styles | `src/skins/painters/` |
| Built-in skins | `src/skins/builtin/<id>/skin.json`: add a folder to add one |
| Choice, import, removal | `src/skins/registry.ts`, `src/skins/store.ts` |
| Template export | `src/skins/export.ts` |
| The picker | `src/components/SkinPicker.tsx` |
