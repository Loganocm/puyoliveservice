---
title: Client review
description: How the game looks, feels and loads today, measured in a real browser — visual identity, handling, input, performance, mobile and accessibility.
sidebar:
  order: 5
---

Findings: `CLI-01` to `CLI-15` and `API-02` in the
[register](/review/findings/). Designs that answer them:
[client platform](/architecture/client-platform/) and
[visual identity](/design/visual-identity/).

## How this was measured

The production build was served locally against a local API, game server and
PostgreSQL, and driven by Playwright in headless Chromium. It took screenshots
of every screen at 1280 × 800 and on a Pixel 7 profile, recorded every request,
and played single-player practice with scripted keys. The scripts are part of
the [test harness](/reference/testing/).

## Look

**There is no visual identity** (CLI-14). The pieces are a recycled sprite sheet
in the official games' style (also a legal problem, LEG-01). Behind the board
sit unrelated stock photographs, a gothic hall in single player and night skies
in the menus, which compete with the board for attention and have nothing to do
with the game. The menus are well-made but generic glass panels. A player could
not pick this game out from a screenshot.

The genre's modern successes show the alternative. TETR.IO and osu! each have
a look you can recognise from one frame. It is built from a few strong
decisions applied everywhere: a palette, a shape language, a typeface and a
motion style. Neither needs photographic backgrounds; both keep the playfield
the brightest, highest-contrast thing on screen. That direction is set out in
[visual identity](/design/visual-identity/).

## Feel

Three problems make the game feel worse than its engine deserves, and all three
are in the input layer, not the rules:

1. **Quick taps are lost** (CLI-11). A press is detected by comparing key state
   between two rendered frames, so a tap that goes down and up between frames
   never registers. Scripted play lost several of eight drops. Fast players tap
   faster than 16 ms more often than you would think, especially on
   low-travel keyboards.
2. **Default handling is slow** (CLI-12). DAS 25 and ARR 15 frames mean a
   held key takes two thirds of a second to move a pair three columns; Tsu does
   it in 8 frames. Players new to the game judge it on the defaults.
3. **Handling depends on the monitor** (CLI-01). DAS and ARR count rendered
   frames, so the same settings are 2.4× faster at 144 Hz than at 60 Hz.

The fix for all three is one design: an input layer that **latches every
key event with its timestamp** and converts them to engine inputs **per logical
frame** ([input pipeline](/architecture/client-platform/#input-pipeline)).

Chain timing (RUL-03) also shapes feel: early links pop quickly and long
chains slow down dramatically. That is a ruleset question, covered in
[rules fidelity](/review/rules-fidelity/).

## Load

| Measure (production build, local) | Value |
|---|---|
| Build output | 91 MB |
| Transferred in the first 15 s of a visit | 9.6 MB over 35 requests |
| Largest assets | 57 MB menu WAV, 8.3 MB and 4 MB background JPEGs, 1.7 MB sprite sheet, 505 KB header SVG (a PNG wrapped in SVG) |
| JavaScript (gzip) | ~410 KB, of which Pixi is 217 KB |
| `/users/all?limit=20` with realistic avatars | 2.9 MB, uncompressed |
| `/users/search` (fires as you type) | 3.65 MB, uncompressed |

The WAV is fetched progressively with `preload = 'auto'`, so a player idling on
the menu keeps downloading it (CLI-02). Audio should be Opus or AAC at a small
fraction of the size, images WebP or AVIF sized to the screen, and art that can
be drawn in code should be drawn in code. The API returns avatars inline in
every list (API-02): they belong behind their own cacheable URL, and responses
should be compressed.

## Mobile

A phone can open the game but cannot play it (CLI-13): there are no touch
controls, the canvas ignores `devicePixelRatio` (so everything is blurry on
high-density screens), the board fills about a third of the screen, and the
floating music player covers the bottom of it (CLI-15). Mobile browsers are
where most casual players arrive from shared links, so this is the largest
growth blocker in the client.

## Accessibility and reach

- No ARIA attributes anywhere in the React UI; menus are navigable by
  keyboard, but screen readers get nothing (CLI-04).
- Colour is the only way to tell puyos apart. Roughly 1 in 12 men have a
  colour vision deficiency; a distinct shape or glyph per colour fixes it at no
  cost to everyone else.
- No reduced-motion setting for the particles and screen shake.
- English only (CLI-05).

## Structure

`GameScene.ts` is 2,143 lines and owns input, networking, stepping, rendering,
audio and UI (CLI-03). Two of the bugs found in this review (NET-06, CLI-11)
lived in code no test reaches. The target is a set of small systems, input,
simulation driver, renderer and HUD, each testable on its own; see
[client platform](/architecture/client-platform/).
