---
title: Configuration
description: Every environment variable the API, the game server, the client and the documentation site read, with defaults and production rules, plus the settings the browser keeps.
sidebar:
  order: 6
---

Production refuses to start without its secrets rather than falling back to
defaults. Development generates throwaway secrets per process, so the stack
runs locally with no configuration at all.

## REST API (`api/`)

Read in `api/src/config/index.ts` and `api/src/index.ts`. The API also loads
`api/.env` (copy `api/.env.example`).

| Variable | Default | Production | Purpose |
|---|---|---|---|
| `DATABASE_URL` | none | required | PostgreSQL connection string, read by Prisma |
| `JWT_SECRET` | random per process | required, ≥ 64 characters | Signs session tokens (HS512). A random secret means tokens do not survive a restart |
| `JWT_EXPIRES_IN` | `7d` | | Token lifetime (API-05) |
| `INTERNAL_API_KEY` | random per process | required, ≥ 32 characters | Shared with the game server; `X-Internal-Key` on server-to-server calls |
| `PORT` | `8080` | | |
| `NODE_ENV` | `development` | `production` | Turns on the secret checks above and ignores `EXTRA_CORS_ORIGINS` |
| `CORS_ORIGIN` | `http://localhost:5173` | | The main allowed browser origin |
| `EXTRA_CORS_ORIGINS` | none | ignored | Comma-separated extra origins, e.g. a LAN address |
| `VERCEL_PREVIEW_PREFIX` | `puyolive` | | Allows `https://<prefix>…vercel.app` preview deployments |
| `API_PUBLIC_URL` | `https://api.puyo.live` in production, `http://localhost:<PORT>` otherwise | set it on any other host | Base of URLs the API hands out, such as avatar images |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | | | Read into `config.db` but **unused**: Prisma reads only `DATABASE_URL` (OPS-12) |

Generate secrets with
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Game server (`server/`)

Read in `server/index.ts` and `server/ApiClient.ts`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | |
| `API_URL` | `http://localhost:8080` | Where the API is, for sign-in checks and recording results |
| `INTERNAL_API_KEY` | empty | Must match the API's; without it results cannot be recorded |
| `NODE_ENV` | unset | `production` in the Docker image; disables every variable below |
| `EXTRA_CORS_ORIGINS` | none | Extra allowed origins, development only |
| `SIMULATED_LATENCY_MS` | `0` | Delays every outbound gameplay event (0–2000), development only |
| `DEV_FIXED_SEED` | none | Every match uses this seed, for reproducible recordings and tests, development only |
| `HEARTBEAT_TIMEOUT_MS` | `7000` | How long a silent player is tolerated, for slow test browsers, development only |

The allowed origins for Socket.IO are a fixed list in `server/index.ts`;
`CORS_ORIGIN` affects only the server's plain HTTP routes (OPS-08).

## Client (build time)

Vite inlines these when the client is built (`import.meta.env`).

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8080/api` on localhost, `https://api.puyo.live/api` elsewhere | The REST API, including the `/api` prefix |
| `VITE_SOCKET_URL` (or `VITE_SERVER_URL`) | `http://localhost:3000` on localhost, `https://game.puyo.live` elsewhere | The game server |

`__APP_VERSION__` is injected from `package.json` by `vite.config.ts` and shown
in the footer.

## Documentation site

| Variable | Default | Purpose |
|---|---|---|
| `DOCS_SITE_URL` | `https://docs.puyo.live` | Canonical URL, used in `sitemap` and `llms.txt` |
| `vars.DOCS_DEPLOY_ENABLED` (repository variable) | unset | Set to `true` to publish the site to GitHub Pages ([CI/CD](/reference/ci-cd/)) |

## Docker Compose

`docker-compose.yml` runs the production stack and reads its secrets from the
environment or a `.env` file beside it. It stops with an error if a required
one is missing.

| Variable | Required | Used by |
|---|---|---|
| `DB_PASSWORD` | yes | PostgreSQL, the API's `DATABASE_URL`, backups |
| `DB_USER`, `DB_NAME` | no (`postgres`, `puyio_db`) | The same |
| `JWT_SECRET`, `INTERNAL_API_KEY` | yes | API and game server |
| `CLOUDFLARE_TUNNEL_TOKEN` | yes | The tunnel that is the only way in |
| `GITHUB_USER`, `GITHUB_PAT` | for Watchtower | Pulling images from GHCR |

## In the browser

The client keeps per-device state in `localStorage`, and imported skins in
IndexedDB (database `puyolive`, store `skins`). None of it is sent to the
server except the session token.

| Key | Holds |
|---|---|
| `puyolive_token` | The session token (CLI-06) |
| `puyolive_settings` | Handling (DAS, ARR, SDF, soft drop protection), volumes and screen shake, with a version for migrations |
| `puyolive_controls`, `puyolive_controller_bindings` | Keyboard and controller bindings |
| `puyolive_theme`, `puyolive_glyphs`, `puyolive_reduced_motion` | Theme, colour-blind symbols on puyos, reduced motion |
| `puyolive_skin` | The chosen skin's id ([Skins](/reference/skins/)) |
| `puyolive_touch_controls` | Forces on-screen controls on or off |
| `puyolive_solo_bests`, `puyolive_last_solo_mode` | Personal bests per solo mode, and the last mode played |
| `puyolive_debug` | `1` restores verbose console logging in a production build |

## Logging

Production builds silence `console.log`, `info`, `debug`, `dir` and `trace`;
`warn` and `error` always remain. To see everything in a production build, run
`localStorage.setItem('puyolive_debug', '1')` in the console and reload. This
is noise control, not security.
