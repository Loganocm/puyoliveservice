---
title: Client platform
description: The target client — decomposed game systems, the input pipeline, rendering and asset budgets, audio, mobile, accessibility, localisation and offline support.
sidebar:
  order: 6
---

Resolves `CLI-*`, `API-02` (client side), `QA-04`. Roadmap items P1.6 and
P2.1 to P2.3, P3.5. Visual direction: [visual identity](/design/visual-identity/);
feel targets: [game feel](/design/game-feel/).

## Decomposing the game scene

`GameScene` (2,143 lines) becomes a coordinator over small systems, each
testable alone:

| System | Owns | Tested by |
|---|---|---|
| `InputPipeline` | Key and pad events, latching, DAS/ARR in logical frames, bindings | Unit tests with synthetic events |
| `SimulationDriver` | Stepping (single player, shared clock, lab), recording inputs | Unit tests; the lab |
| `BoardRenderer` | Pooled sprites for the grid, active pair, ghost, garbage | The [animation catalogue](/reference/animation-catalogue/) |
| `EffectsRenderer` | Particles, chain numerals, shake, danger | The catalogue |
| `Hud` | Score, queue, trays, timers | The catalogue |
| `NetSession` | Socket events, opponent view, heartbeats | Integration tests against a real server |

## Input pipeline

Key events are latched as they arrive (timestamp and code) into a queue.
Each logical frame consumes the events before its instant and produces engine
inputs. Press edges are never lost, however short (CLI-11), and DAS and ARR
count logical frames, so they are identical at 60 Hz and 240 Hz (CLI-01). The
same pipeline feeds touch controls.

## Rendering

- PixiJS v8 with `preference: 'webgpu'` and automatic WebGL fallback.
- **No per-frame allocation**: every puyo sprite comes from a pool and is
  updated in place.
- **Runtime-generated textures**: the piece art is drawn once at start-up into
  a texture atlas at the device's pixel density
  ([visual identity](/design/visual-identity/)).
- The canvas resolution follows `devicePixelRatio`, capped at 2.

## Budgets

Enforced in CI; the build fails when exceeded.

| Budget | Limit |
|---|---|
| Initial JavaScript (gzip) | 450 KB |
| Initial transfer before the menu is usable | 1.5 MB |
| Any single image | 400 KB |
| Any single audio file | 3 MB |
| Build output total | 25 MB |

Music is Opus in WebM (with AAC for Safari), about 96 kbps, and streamed
without preloading. Images are WebP or AVIF sized for the screen.

## Audio

Sound effects are decoded once into `AudioBuffer`s and played through one
`AudioContext` with a master, music and effects bus (CLI-07). The chain sound's
pitch rises with each link. Music streams through a media element routed into
the same graph.

## Mobile

- Portrait layout: the board fills the width; queue and stats sit above it.
- Touch controls: on-screen buttons for left, right, both rotations, soft and
  hard drop, placed for thumbs and sized at least 48 px. Optional swipe
  gestures come later.
- The music player docks in the menu footer rather than floating (CLI-15).

## Accessibility

Labelled controls (ARIA) and visible focus rings in every menu; full keyboard
and pad navigation; colour-blind glyphs on every piece; a high-contrast theme;
a reduced-motion setting that honours the OS preference; text that scales
with the browser.

## Localisation

Strings move to message catalogues (ICU format), English and Japanese first.
Numbers and dates use `Intl`.

## Offline and install

A service worker precaches the application shell and assets, so the client
loads instantly on repeat visits and single player works offline. A web app
manifest already exists; with the worker the game becomes installable.

## Sessions

The session moves out of `localStorage` into an `httpOnly` cookie issued by the
API (CLI-06, API-05), and the client stops handling tokens.
