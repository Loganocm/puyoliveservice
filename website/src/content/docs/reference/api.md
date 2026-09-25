---
title: REST API
description: Every HTTP endpoint of the Puyo Live API — accounts, players, matches and replays, the leaderboard, forums and administration — with authentication, limits and the server-to-server calls.
sidebar:
  order: 5
---

The API (`api/`) is an Express app over PostgreSQL through Prisma. Routes live
in `api/src/routes/`, logic in `api/src/services/`, the schema in
`api/prisma/schema.prisma`. The client calls it through `src/api/client.ts`.

## Conventions

| | |
|---|---|
| Base URL | `https://api.puyo.live` in production; `http://localhost:8080` in development (`VITE_API_URL` overrides it in the client) |
| Format | JSON in and out, bodies up to 1 MB; responses are compressed (gzip or Brotli) when the client accepts it |
| Authentication | `Authorization: Bearer <JWT>`, from login or register. HS512, seven days (`JWT_EXPIRES_IN`); a ban revokes tokens issued before it |
| Errors | `{ "error": "message" }` with 400, 401, 403, 404, 409 or 429 |
| Global limit | 100 requests a minute per address on `/api`, except requests carrying the internal key (API-09) |
| Health | `GET /health` → `{ status, timestamp, database }`, 503 when the database is unreachable |

Auth column: **—** public, **user** needs a token, **optional** reads a token if
present, **admin** needs an admin's token, **internal** needs `X-Internal-Key`.

## Accounts — `/api/auth`

| Method | Path | Auth | Limit | Does |
|---|---|---|---|---|
| POST | `/register` | — | 5 a day per address | `{ username, password, email? }` → `{ user, token }` |
| POST | `/login` | — | 10 per 15 min per address | `{ username, password }` → `{ user, token }`; logged with the address in `login_logs` |
| GET | `/me` | user | | The signed-in profile |
| POST | `/change-password` | user | 10 per 15 min | `{ currentPassword, newPassword }` |
| POST | `/verify` | — | 60 per 15 min per address, none with the internal key | `{ token }` → `{ valid, user? }`. The game server calls it for every socket sign-in |
| POST | `/check` | — | 10 per 15 min | Whether a username exists (API-04) |

## Players — `/api/users`

| Method | Path | Auth | Does |
|---|---|---|---|
| GET | `/search?q=&limit=` | — | Up to 25 players by name prefix |
| GET | `/all?limit=&offset=` | — | Players page by page (≤ 50) |
| GET | `/:identifier` | optional | A profile by id or username |
| GET | `/:id/avatar?v=` | — | The avatar image. With `v` (the version in avatar URLs) it is cached for a year as immutable; `ETag` and 304 otherwise |
| POST | `/:id/avatar` | user (self) | `{ avatar }` as a PNG, JPEG or WebP data URL, ≤ ~100 KB |
| PATCH | `/:id` | user (self) | `{ username?, email? }` → `{ user, token }`; a `password` field is refused (use `/auth/change-password`) |

Lists and profiles return `avatar_url` — a versioned URL to the endpoint above,
or `null` — never the image itself (API-02).

## Matches and replays — `/api/matches`

| Method | Path | Auth | Does |
|---|---|---|---|
| POST | `/` | internal | Record a ranked result (below) |
| GET | `/:id` | — | One match, with each player's stats |
| GET | `/:id/replay` | — | The [replay file](/reference/replay-format/); 404 if none was stored |
| GET | `/user/:userId?limit=&offset=` | — | A player's matches (≤ 100), each with `has_valid_replay` |
| GET | `/recent/all?limit=` | — | The latest matches (≤ 50) |

### Server to server

`POST /api/matches` with `X-Internal-Key` is how the game server reports a
ranked result:

```json
{
  "player1_id": 12, "player2_id": 34, "winner_id": 12,
  "room_id": "…", "duration_seconds": 184, "started_at": "…",
  "player1_max_chain": 9, "player2_max_chain": 6,
  "player1_garbage_sent": 81, "player2_garbage_sent": 40,
  "replay_data": { "version": 3, "…": "…" }
}
```

In one transaction the API stores the match and replay, updates both ratings
(Elo, K 32, floor 100: API-03), both players' XP and levels and their totals,
and returns the match with `player1_stats` and `player2_stats`
(`{ elo_change, new_elo, xp_gained, xp, level }`), which the game server passes
to the players as `match_result` ([Wire protocol](/reference/wire-protocol/)).
The key is compared in constant time; a missing key is 401, a wrong one 403.

## Leaderboard — `/api/leaderboard`

| Method | Path | Auth | Does |
|---|---|---|---|
| GET | `/?limit=&offset=` | — | Players by rating (≤ 100 a page) |
| GET | `/around/:userId?range=` | — | The players around one player (±10 at most) |
| GET | `/rank/:userId` | — | One player's rank |
| GET | `/stats` | — | `{ total_players, total_matches, matches_today, average_elo }` |
| GET | `/me?range=` | user | Your rank and neighbours; 401 without a token |
| GET | `/percentiles/:userId` | — | Where a player stands, per statistic |

Rank is computed per request with a count over the users table (API-03).

## Forums — `/api/forums`

| Method | Path | Auth | Does |
|---|---|---|---|
| GET | `/` | — | Categories with thread and post counts and the latest thread |
| GET | `/news` | — | The latest announcements, for the community home page |
| GET | `/:slug/threads?page=` | — | A category's threads, pinned first, 20 a page |
| POST | `/:slug/threads` | user | `{ title, body }`; `announcements` is staff-only |
| GET | `/threads/:id?page=` | — | A thread with its posts, 20 a page |
| POST | `/threads/:id/posts` | user | `{ body }`; not in locked threads |
| PATCH | `/threads/:id` | user (admin) | `{ pinned?, locked? }` |
| PATCH | `/posts/:id` | user | `{ body }`; the author within 30 minutes, or an admin |
| DELETE | `/posts/:id` | user | The author or an admin; deleting a thread's first post deletes the thread |

Titles are 3–120 characters and bodies 1–10 000. Writes are limited to six a
minute per account. Banned accounts cannot write. Bodies are stored as written
and rendered by the client as a safe Markdown subset, never as HTML
([Community](/architecture/community/)).

## Administration — `/api/admin`

Every route needs an admin's token, 60 requests a minute. Actions that change
something are written to `audit_logs`.

| Method | Path | Does |
|---|---|---|
| GET | `/users?page=&limit=&search=` | Users, 25 a page (≤ 100) |
| GET | `/users/:id` | One user's full record |
| PATCH | `/users/:id` | Whitelisted fields only (rating, stats, level, XP, admin flag…), type-checked |
| DELETE | `/users/:id` | Delete a user |
| GET | `/bans` · POST `/bans` · DELETE `/bans/:id` | Bans by user or address: `{ user_id?, ip_address?, reason, duration_hours? }`; no duration is permanent |
| GET | `/audit-logs`, `/login-logs` | Paged logs |
| GET | `/stats` | Totals for the dashboard |

## Known problems

The [findings register](/review/findings/) lists them with evidence; for this
API mainly API-03 to API-08 (ratings, login timing, token lifetime, validation,
account lockout, in-memory limits).
