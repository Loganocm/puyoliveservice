# 8. Skins are data: a folder of named elements over a painted default

**Status:** Accepted
**Date:** 2026-09-25

## Context

In 0.3.0 the pieces were drawn in code by one function, `PieceArt.drawOrb`,
with their colours hard-wired into each theme. Changing the look meant
editing TypeScript, and players could not change it at all.

Players of the games Puyo Live wants to stand beside expect otherwise. osu!
skins are folders of named image files plus a `skin.ini`; any element a skin
leaves out falls back to the default, so a skin can change one thing or
everything, and skins are shared as archives. TETR.IO takes a piece sheet
(with a separate layout for joined pieces). The Puyo fan community already
shares hundreds of skins in one sprite-sheet layout (16 × 16 cells, neighbour
bits 1 down, 2 up, 4 right, 8 left).

The 0.3.0 gel orbs were also judged soft and dated next to modern
block-puzzle games: blurred highlights, faint symbols, beaded joins.

## Decision

Pieces come from a **skin**, and a skin is data:

- A folder (or .zip) with a `skin.json` (format 1: name, author, colours,
  symbols, `style`, `shape`) and optional element files with fixed names:
  `puyo-<colour>` (16-frame strip or one frame), `pieces` (full sheet),
  `puyo` (classic community sheet), `garbage`, `ghost[-<colour>]`,
  `junction-<colour>`, `tray-<icon>`, `marker`, `particle`, `ring`. PNG,
  WebP, JPEG or SVG.
- **Fallback, as in osu!:** whatever a skin leaves out is drawn by its
  `style` painter (`circuit` or `gel`) in its colours. The most specific file
  wins: per-colour file, then full sheet, then classic sheet, then painter.
- **Classic sheets are read as they are**, with the bit order converted and
  the colours sampled from the art, dropped in on their own under any name.
- Every skin is **composed into one atlas** with a fixed layout, so the
  renderer (`ResourceManager`, `BoardView`) does not change with the skin.
- **Built-in skins are folders too** (`src/skins/builtin/<id>/`), found at
  build time: Circuit (the new default), Tile, Contrast and Gel.
- **Piece colours move from themes to skins.** Themes colour the board and
  menus; `tokens.getPieceStyle` serves the active skin's colours to effects.
- Players **import** (.zip, folder, loose files), **export a template** of
  any skin (every element as PNG, ready to edit), and **delete** imports.
  Imported skins are stored in IndexedDB on the device; nothing is uploaded.
- The new default, **Circuit**, is built from hard shapes: a crisp outline, a
  flat rail joined at full width (with a filler for 2x2 blocks), a bevelled
  cap with a hard gloss band, and an engraved symbol.

Rejected: a skin API in code (plugins) — powerful, but unsafe to load from
strangers and out of reach of artists; one fixed sheet only (TETR.IO's way) —
simpler, but it makes a recolour cost a full drawing and cannot say "draw the
rest for me"; per-element tinting of greyscale parts, as osu! does for hit
circles — joined puyos need their joins drawn as one shape, which parts
tinted separately cannot do cleanly.

## Consequences

- A recolour is a ten-line `skin.json`; full art is a folder of PNGs or SVGs;
  existing community sheets work unchanged. Cosmetic skins become possible
  for the business plan (P4.2) without code changes.
- Imported files are untrusted. Sizes are checked before inflating or
  decoding (64 files, 4 MB each, 16 MB total, 4096 px a side); SVG is loaded
  through `<img>`, where it cannot run script; skin text is shown as text.
- Colour-blind symbols stay guaranteed: with symbols set to Bold, the game
  draws them over art that does not include its own.
- The animation lab forces the default skin, so catalogue recordings compare.
- The format is versioned (`"format": 1`); a future change adds a version
  rather than reinterpreting old skins.
- `src/core/PieceArt.ts` is gone; its drawing lives in `src/skins/painters/`.

## Related

- ADR 0007: Documentation is a site, a contract, and a CI gate
- [Skins](../../website/src/content/docs/reference/skins.md): the format
- [Make a skin](../../website/src/content/docs/guides/make-a-skin.md)
- [Visual identity](../../website/src/content/docs/design/visual-identity.md)
