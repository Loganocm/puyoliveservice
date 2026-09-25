# Puyo Live

A competitive falling-puyo puzzle game for the browser: real-time 1v1 matches
with ratings and replays, a free-for-all mode (Puyo Mines), solo modes with
personal bests, play on phones, custom skins, and a community hub with forums.

**Play:** [puyo.live](https://puyo.live) · **Handbook:** `website/` (run
`npm run docs:dev`) · **Changes:** [CHANGELOG.md](CHANGELOG.md)

## Documentation is maintained with every change

This repository's documentation is kept current **automatically, as part of
every change, by the people and AI agents who make it**, and CI enforces it:

- The handbook in `website/` (Astro Starlight) is the manual: architecture,
  exact game rules, frame timing, replay format, wire protocol, REST API,
  configuration, the animation catalogue, testing, CI/CD, the 2026 review with
  its findings register, the roadmap and every decision record.
- [AGENTS.md](AGENTS.md) is the contract for AI agents (Claude Code reads it
  through [CLAUDE.md](CLAUDE.md), Gemini CLI through [GEMINI.md](GEMINI.md),
  Codex, Cursor and others natively). A change is not done until the pages
  that describe it, [CHANGELOG.md](CHANGELOG.md), the findings register and,
  where needed, a decision record in [docs/adr/](docs/adr/) are updated in the
  same pull request.
- The **Docs governance** check (`npm run docs:check`) fails a pull request
  that changes code without its documentation, changelog entry or, for engine
  behaviour, its `ENGINE_VERSION` bump and ADR. The site build fails on any
  broken link.
- **Release notes are the changelog**: tagging `vX.Y.Z` publishes that
  version's section of [CHANGELOG.md](CHANGELOG.md) as the GitHub release.

The design is [ADR 0007](docs/adr/0007-documentation-system.md); how to work
with it is [How documentation works](website/src/content/docs/start/documentation-system.md).

## Quick start

Requires Node.js 22.12+ (see `.nvmrc`) and Docker for PostgreSQL.

```bash
npm install                        # client, engine and game server (one workspace)
npm install --prefix api           # REST API
docker compose up -d db            # needs DB_PASSWORD in .env
npm run db:migrate --prefix api

npm run dev                        # client       http://localhost:5173
npm run server                     # game server  :3000
npm run api                        # REST API     :8080
```

Everything runs unconfigured in development; production refuses to start
without its secrets. Details: [Getting started](website/src/content/docs/start/getting-started.md)
and [Configuration](website/src/content/docs/reference/configuration.md).

## Commands

```bash
npm test                  # client, engine, server and tooling tests
npm run typecheck         # client and tests
npm --prefix api test     # API tests (needs DATABASE_URL)
npm run build             # engine and client production build
npm run docs:check        # documentation contract, against origin/main
npm run docs:dev          # the handbook at http://localhost:4321
npm run docs:build        # build the handbook; fails on broken links
```

## How it fits together

```
   Browser client ──── WebSocket ────▶ Game server ──┐
   (React, PixiJS)                     (Socket.IO)    │ X-Internal-Key
          │                                           ▼
          └────────── HTTPS + JWT ───────────▶  REST API ──▶ PostgreSQL
                                               (Express, Prisma)
```

| Directory | What |
|---|---|
| `packages/engine/` | The simulation: deterministic, pure, shared by the client and the game server |
| `src/` | The client: rendering (`render/`), skins (`skins/`), input (`input/`), scenes, React screens, the community hub, the animation lab |
| `server/` | The game server: matchmaking, rooms, input relay, replay recording, Puyo Mines |
| `api/` | The REST API: accounts, matches and replays, ratings, leaderboard, forums, administration |
| `website/` | The handbook |
| `docs/adr/` | Architecture decision records |
| `tests/` | Engine, client, server and tooling tests, and the browser recorders |

A tour with the invariants that keep this working is
[Project tour](website/src/content/docs/start/project-tour.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) (people) or [AGENTS.md](AGENTS.md)
(AI agents); the rules are the same. Report security problems as described in
[SECURITY.md](SECURITY.md). Known problems and the plan for them are in the
findings register and the roadmap in the handbook.

## Licence

No licence has been chosen yet, so the code is not open for reuse; see
finding LEG-02 in the [findings register](website/src/content/docs/review/findings.md).
"Puyo Puyo" is a trademark of SEGA; this project is not affiliated with SEGA.
