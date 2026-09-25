---
title: Roadmap
description: The phased plan from today's game to a professional competitive product — items, the findings each resolves, exit criteria, and current status.
sidebar:
  label: Phased roadmap
  order: 0
---

Five phases, each with an **exit criterion** that must be true before the next
phase's headline work starts. Items name the [findings](/review/findings/) they
resolve and the design page that specifies them. Durations assume one developer
working with AI assistance, part-time; they are for sequencing, not promises.

**Keeping this current is part of the definition of done:** when an item
changes status, update it here in the same pull request.

| Status | Meaning |
|---|---|
| **Done** | Shipped; the version is named |
| **In progress** | Partly shipped; what remains is stated |
| **Planned** | Designed, not started |

## Phase 0: Stabilise and standardise (weeks 0–2)

*Exit: every change is documented, tested and released through the pipeline;
the legal questions have owner decisions.*

| Item | Resolves | Status |
|---|---|---|
| P0.1 Documentation site, governance, changelog, release notes, CI enforcement | DOC-01 | **Done** (0.3.0) |
| P0.2 Verified quick fixes: spawn-frame recording, reconnect order, moderation migration and bans, API port, API tests in CI; then the bugs found by browser testing: match results, the Mines target board, replay animation speed, the opponent's tray, the CI database version | NET-06, NET-07, NET-14, NET-15, API-01, OPS-06, OPS-07, OPS-13, CLI-21, CLI-22 | **Done** (0.3.0) |
| P0.3 Tooling baseline: Biome lint and format (report mode, then enforce on changed lines), remove dead code | QA-02, ENG-05, CLI-32, OPS-12 | **In progress** (0.3.0: the dead settings panel and unused listeners removed; lint not started) |
| P0.4 Legal triage: name decision, `ASSETS.md` provenance, LICENSE choice | LEG-01, LEG-02 | In progress: recycled sprites replaced (0.3.0); name, music provenance and licence need the owner |
| P0.5 Operational quick wins: daily off-host backups with a restore test, uptime checks, error tracking, images pinned by SHA, delete the stale Dockerfile, assets out of git history | OPS-03, OPS-04, OPS-10 | Planned |

## Phase 1: Integrity and feel (weeks 2–10)

*Exit: ranked results are decided by the server; handling is identical on
every device; the ruleset for ranked is chosen and implemented.*

| Item | Resolves | Design | Status |
|---|---|---|---|
| P1.1 Engine v2 foundations: state value, snapshot/restore, full hash, independent RNG streams, lock-reset budget, typed events, version handshake | ENG-01–04, ENG-06, ENG-07 (fixed), RUL-04, RUL-05, NET-12, NET-16 | [Engine v2](/architecture/engine-v2/) | Planned |
| P1.2 Rulesets: `live-v1`, `live-v2`, `tsu`; room settings become rules | RUL-01–03, RUL-06–14 | [Engine v2](/architecture/engine-v2/#rulesets) | Planned; **needs the owner's ruleset decision** |
| P1.3 Frame-aligned server simulation; deterministic garbage schedule; desync telemetry | NET-04, NET-05, NET-11 | [Netcode](/architecture/netcode/) | Planned |
| P1.4 Server authority with client prediction and rollback; CSPRNG seeds | NET-01, NET-02, NET-08 | [Netcode](/architecture/netcode/) | Planned |
| P1.5 Match policy: reconnect window, then forfeit; real liveness | NET-03, NET-13 | [Netcode](/architecture/netcode/#connection-loss) | Liveness **done** (0.3.0); the reconnect policy needs the owner |
| P1.6 Input pipeline: latched presses, logical-frame DAS/ARR, handling presets, respected bindings | CLI-01, CLI-08, CLI-10, CLI-11, CLI-12, CLI-25 | [Game feel](/design/game-feel/) | **Done** (0.3.0) |

## Phase 2: Identity, platform and quality (weeks 6–16)

*Exit: the game has its own look, is playable and fast on a phone, and the
team is told about problems before players are.*

| Item | Resolves | Design | Status |
|---|---|---|---|
| P2.1 Original visual identity, theme system and skins | CLI-14, CLI-16, CLI-19, CLI-23, CLI-29, CLI-34, LEG-01 (art) | [Visual identity](/design/visual-identity/), [Skins](/reference/skins/) | **Done** for in-game art, text, results and theme tokens (0.3.0), and the Circuit default with player skins (after 0.3.0); menus are themed but keep their layouts |
| P2.2 Performance: asset pipeline and budgets, pooled rendering, Web Audio, API payloads | CLI-02, CLI-07, CLI-17, CLI-28, API-02 | [Client platform](/architecture/client-platform/#budgets) | **Done** for every listed finding (0.3.0); budgets in CI move to P2.5 |
| P2.3 Mobile and accessibility: touch controls, device pixel ratio, reduced motion, glyphs, ARIA, docked music player, menu quality of life | CLI-04, CLI-13, CLI-15, CLI-18, CLI-24–27, CLI-30, CLI-31, CLI-33 | [Client platform](/architecture/client-platform/#mobile) | **Done** except CLI-04 (0.3.0); a screen-reader pass remains |
| P2.4 Security and data: cookie sessions, shared Zod protocol, CSP, avatar storage, retention, account deletion and export, socket limits | CLI-06, CLI-09, API-04–07, API-09 (fixed), OPS-08, NET-17 (fixed), NET-18, LEG-03 | [Platform](/architecture/platform/#security) | Planned |
| P2.5 Test pyramid: animation catalogue, property tests, Playwright end-to-end, load tests, budgets in CI | QA-01, QA-03, QA-04 | [Quality review](/review/quality-and-testing/#strategy) | **In progress** (0.3.0: the checked animation catalogue and the browser recorders; property tests, end-to-end in CI and budgets remain) |
| P2.6 Delivery and observability: staging, pinned releases, rollback, drain, GlitchTip, Prometheus, Grafana, SLOs | OPS-01, OPS-02, OPS-09, OPS-11 (fixed), NET-10 | [Platform](/architecture/platform/) | Planned |
| P2.7 Stack upgrades: React 19, Vite 8, Vitest 5, TypeScript 7, Prisma 7, Node 24; audit advisories | OPS-05, API-10 | | Planned |

## Phase 3: Competitive product and community (weeks 12–24)

*Exit: players have ranks they trust, reasons to come back weekly, and a place
to talk.*

| Item | Resolves | Design | Status |
|---|---|---|---|
| P3.1 Glicko-2, seasons, skill-window matchmaking, scalable leaderboard | API-03, NET-09 | [Rating](/architecture/rating-and-matchmaking/) | Planned |
| P3.2 Community hub: news, forums, rankings, player pages, replay gallery | | [Community](/architecture/community/) | **In progress** (0.3.0: the hub with linkable pages, forums with moderation, news, rankings and players; replay gallery next) |
| P3.3 Spectating, tournaments, best-of sets | RUL-10 (best-of) | | Planned |
| P3.4 Practice: bot opponents, chain puzzles, training modes | | | Planned |
| P3.5 Client decomposition; localisation (English, Japanese) | CLI-03, CLI-05 | [Client platform](/architecture/client-platform/) | Planned |

## Phase 4: Scale and business (week 24 onward)

*Exit: the game sustains itself.*

| Item | Resolves | Status |
|---|---|---|
| P4.1 Horizontal scale: gateways, match workers, Redis | API-08, NET-10 | Planned; only when metrics require |
| P4.2 Brand and monetisation (cosmetic skins and themes, supporter tier) after legal clearance | LEG-01 | Planned; the skin format (ADR 0008) is the vehicle for cosmetics |
| P4.3 Desktop wrapper (Tauri) and store presence | | Planned |
| P4.4 Anti-cheat analytics (input-timing anomaly detection) | | Planned |

## Decisions the owner needs to make

These block planned work and cannot be decided by code review:

1. **Rulesets** (P1.2): Tsu for ranked, keep Live for casual? Four or five
   colours in ranked?
2. **Name and licence** (P0.4): keep "Puyo Live" or rebrand; MIT, AGPL or
   proprietary.
3. **Disconnect policy** (P1.5): reconnect window length, and forfeit
   afterwards.
4. **Music**: confirm the rights to the four tracks, or replace them.
