---
title: Backend and security
description: Review of the REST API, data model and security posture — what is solid, what was broken, and what to change.
sidebar:
  order: 6
---

Findings: `API-01` to `API-08`, `CLI-06`, `LEG-03` in the
[register](/review/findings/).

## What is solid

- **Match recording is one transaction**: result, both rating snapshots, both
  XP changes and the replay commit together or not at all.
- **Secrets are enforced in production**: the API refuses to start without a
  64-character JWT secret and a 32-character internal key, and generates
  throwaway ones in development.
- **Server-to-server calls use a shared key compared in constant time.**
- **Sensible defaults**: bcrypt with 12 rounds, helmet, per-route and global
  rate limits, request body size limits, a production error handler that hides
  internals, and a narrowly-scoped CORS rule for Vercel previews.

## What was broken

**Moderation did not exist in production** (API-01, fixed). The `bans`,
`audit_logs` and `login_logs` tables were in the Prisma schema but never in a
migration. Production builds its schema with `prisma migrate deploy`, so those
tables did not exist, every moderation query failed, and the failures were
swallowed by catch-alls written "in case the ban model is not migrated yet".
One of those catch-alls also swallowed the "Account suspended" error it was
meant to raise. The lesson generalises: **a catch-all that hides a missing
dependency turns a loud, one-line fix into a silent, months-long outage.**
Typed Prisma access (instead of `(prisma as any)`) would have made the missing
model a compile-time question.

## What to change

### Avatars

Avatars are base64 strings in the `users` row (API-02), so any query that
selects the row drags up to 150 KB per user along with it, and list endpoints
return them inline: 2.9 MB for a page of 20 players, 3.65 MB for a
search-as-you-type request. Recommended:

1. Serve each avatar from `GET /api/users/:id/avatar` as a real image with an
   `ETag` and long `Cache-Control`, and return only its URL in lists.
2. Decode and re-encode uploads server-side (validates the content, strips
   metadata, bounds dimensions to 256 × 256 WebP).
3. Move the bytes to object storage (Cloudflare R2 or S3) behind a CDN when
   there is a CDN to put them behind.
4. Compress JSON responses (`compression` middleware; Brotli where supported).

### Sessions

A seven-day bearer token in `localStorage` (CLI-06), accepted with HS256 or
HS512 and never revocable except by ban (API-05). Recommended: a short-lived
access token (15 minutes) plus a rotating refresh token in an `httpOnly`,
`Secure`, `SameSite=Lax` cookie, with a `sessions` table so logout, password
change and "sign out everywhere" work. Drop HS256.

### Validation

Bodies are validated by hand in each route, and `express-validator` is
installed but unused (API-06). Recommended: **one schema per payload, shared
by client and server**, using Zod, for REST bodies and Socket.IO events alike.
A shared `packages/protocol` package gives the wire the same single-source
treatment the replay format already has.

### Abuse controls

- Lockout keyed only by username lets anyone lock anyone out (API-07). Key it by
  username *and* source address, and prefer slowing down (progressive delay)
  over locking.
- Rate limits and lockouts reset on every deploy (API-08). Fine at one
  instance; move them to Redis when there are two.
- Unknown usernames return before bcrypt runs, so login timing reveals which
  usernames exist (API-04). Compare against a dummy hash.

### Ratings

Elo with a fixed K of 32 and a floor at 100 (API-03). See
[rating and matchmaking](/architecture/rating-and-matchmaking/) for the move to
Glicko-2. Leaderboard rank is computed with a `COUNT(*)` per profile view;
at scale it becomes a materialised column updated when ratings change.

### Privacy

Login logs store IP addresses with no retention job, and there is no way for a
player to export or delete their own data (LEG-03). Add a nightly job that
prunes login logs older than 90 days, and account deletion and export
endpoints before accounts become a meaningful population.
