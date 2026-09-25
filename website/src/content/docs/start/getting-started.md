---
title: Getting started
description: Run the full Puyo Live stack locally, run every test suite, and preview the documentation site.
sidebar:
  order: 1
---

This page takes you from a fresh clone to all three services running, every
test suite green, and the docs site open in a browser.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 22.12 or newer (see `.nvmrc`) | All three services, the engine and the docs site. The docs site needs 22.12+ |
| npm | 10+ | Ships with Node |
| Docker | Any recent | PostgreSQL for the API; the full-stack smoke test |

## 1. Install

The repository holds four npm projects. The client, `packages/engine` and the
game server are **one npm workspace** with one lockfile; the API and the docs
site are deliberately separate
([ADR 0006](/decisions/0006-shared-engine-package/),
[ADR 0007](/decisions/0007-documentation-system/)).

```bash
npm install                 # client + engine + game server (one workspace)
npm install --prefix api    # REST API (own lockfile, runs prisma generate)
npm install --prefix website  # documentation site (own lockfile)
```

## 2. Start the database and migrate

```bash
docker compose up -d db
npm run db:migrate --prefix api
```

`docker-compose.yml` requires `DB_PASSWORD` to be set. For local work, create
an `.env` next to it (git-ignored) with `DB_PASSWORD=localdev` and point the
API at it through `api/.env` (copy `api/.env.example`).

## 3. Run the three services

Use three terminals:

```bash
npm run dev      # client,      http://localhost:5173
npm run server   # game server, http://localhost:3000
npm run api      # REST API,    http://localhost:8080
```

Ports match `docker-compose.yml` and every service's development fallback, so
this works with no further configuration. In development the API and the game
server generate throwaway secrets per process; production refuses to start
without real ones (see [Configuration](/reference/configuration/)).

## 4. Run the tests

```bash
npm test                    # engine + client-core + server suites: no DB, no network, ~1s
npm run typecheck           # client and tests
npm run build:engine        # compiles the engine (this is also its type check)
(cd server && npx tsc --noEmit)   # needs build:engine first
(cd api && npx tsc --noEmit)
npm test --prefix api       # API suite: needs PostgreSQL and DATABASE_URL
npm run docs:check          # documentation governance check against origin/main
```

The API suite needs a migrated database. Against the Docker database:

```bash
export DATABASE_URL=postgres://postgres:localdev@localhost:5432/puyio_db
npm run db:migrate --prefix api && npm test --prefix api
```

What each suite guarantees, and why characterization goldens must never be
updated casually, is in [Testing](/reference/testing/).

## 5. Preview the documentation

```bash
npm run docs:dev     # http://localhost:4321, live reload
npm run docs:build   # what CI runs: sync ADRs + changelog, build, validate links
```

## Testing multiplayer realistically

Two browser tabs on one machine have near-zero round-trip time, which hides the
clock-offset and jitter-buffer behaviour that matters most. Inject latency on
the game server:

```bash
SIMULATED_LATENCY_MS=80 npm run server
```

The clock-sync reply is deliberately never delayed, because skewing it would
corrupt the measurement it exists to take.

To drive a stack running on another machine from your browser, allow your LAN
origin (development only; ignored in production):

```bash
EXTRA_CORS_ORIGINS=http://192.168.1.42:5173 npm run server
```

## Next

- [Project tour](/start/project-tour/): what every directory is for.
- [How documentation works](/start/documentation-system/): the rules your
  first pull request will be checked against.
