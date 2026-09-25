---
title: Make a skin
description: Three ways to make a Puyo Live skin — recolour with skin.json alone, edit an exported template, or bring a classic community sheet — and how to test and share it.
sidebar:
  order: 7
---

A skin is a folder with a `skin.json` and whatever images you want to
replace. The format is specified on [Skins](/reference/skins/); this is the
short way through it.

## A recolour: skin.json alone

Make a folder with one file, `skin.json`:

```json
{
  "format": 1,
  "name": "Sunset",
  "author": "you",
  "shape": "tile",
  "colors": {
    "red": "#FF5E3A",
    "green": "#7BD389",
    "blue": "#5B7CFA",
    "yellow": "#FFC53D",
    "purple": "#C86BFA"
  }
}
```

In the game, **Settings → Display → Skin → Import folder**, and pick the
folder. Every piece is drawn in the Circuit style, in your colours. Change
`"shape"` to `"round"` for puyos, or `"style"` to `"gel"` for soft orbs.

## Your own art: start from a template

1. Choose the skin closest to what you want, then **Export template**. You get
   a .zip with every element as a 128-pixel PNG, a `skin.json` and a README.
2. Unzip it and edit the images. Keep the file names and sizes. Each
   `puyo-<colour>.png` is 16 frames in a row, one per combination of
   same-colour neighbours; the frame number is the sum of 1 (up), 2 (right),
   4 (down) and 8 (left).
3. Delete any file you do not want to change. The style draws it instead.
4. Set `name` and `author` in `skin.json`, and the `colors` your art uses:
   effects are coloured with them.
5. **Import folder** (or zip the folder and **Import skin**).

Prefer SVG? Replace a PNG with an SVG of the same name. It is drawn at the size
it is shown, so it stays sharp on every screen.

If your joins leave a gap in the middle of 2×2 blocks, keep the
`junction-<colour>.png` files; otherwise delete them.

## A classic community sheet

Puyo fan games share one sprite-sheet layout. Choose **Import skin** and pick
the sheet itself (a `.png`), whatever it is called. The game reads the pieces,
garbage, tray icons and death marker from it, and takes each colour from the
art. If the sheet keeps garbage or the icons in unusual places, put it in a
folder with a `skin.json` that says where (`"classic"`, see
[Skins](/reference/skins/#classic-community-sheets)).

## Check it

- The picker's preview shows joined groups, a 2×2 block, garbage and a ghost.
  Look for seams where frames meet and for joins that point the wrong way (a
  wrong frame order is the usual cause).
- Play a game. Set **Piece symbols** to **Bold** to check the symbols read over
  your art; set `"symbolsInArt": true` if your art already shows them.
- Import warnings list anything the game ignored or replaced.

## Share it

Zip the folder and share the .zip: whoever imports it gets exactly what you
made. Skins stay on the device that imported them.

## For contributors: a built-in skin

Add a folder under `src/skins/builtin/<id>/` with a `skin.json` (and any
images). It is found at build time; add its id to the display order in
`src/skins/registry.ts` and to the table in
[Visual identity](/design/visual-identity/#skins). `tests/skins/archive.test.ts`
checks every built-in skin parses cleanly.
