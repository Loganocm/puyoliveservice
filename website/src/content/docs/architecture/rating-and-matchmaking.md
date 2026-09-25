---
title: Rating and matchmaking
description: Moving from fixed-K Elo to Glicko-2, pairing by skill with a widening window, seasons, and a leaderboard that scales.
sidebar:
  order: 5
---

Resolves `API-03`, `NET-09`. Roadmap item P3.1.

## Why not Elo

Elo gives every result the same weight: a new player's first game moves their
rating exactly as much as a veteran's thousandth. New players take dozens of
games to find their level, meeting mismatched opponents the whole way. The
current floor at 100 also creates rating out of nothing when it binds.

## Glicko-2

Glicko-2 (Glickman, 2012) gives each player a rating *r*, a **rating
deviation** *RD* (how uncertain the rating is) and a **volatility** σ (how
erratic their results are). Results against well-known opponents move
uncertain players a lot and certain players a little; *RD* grows during
inactivity, so a returning player re-calibrates quickly. It is the system used
by Lichess and many competitive games, it is simple to implement, and it is
well understood.

- Update after every match (the continuous variant rather than rating periods),
  τ = 0.5.
- New players start at r = 1500, RD = 350, σ = 0.06.
- **Provisional** until RD < 110 (typically 10–15 games); provisional players
  are marked and excluded from the public leaderboard.
- **Leaderboard value** is the conservative estimate r − 2·RD, so a lucky new
  player cannot top the board.
- Ratings are **per ruleset** (a Tsu rating and a Live rating), because they
  measure different skills.
- **Seasons** (quarterly): RD rises toward 150 at the start of each season,
  history is kept, and season results feed profile badges.

Existing Elo ratings migrate as r = 1500 + (elo − 1000) × 1.2, RD = 200, so
known players keep their order but settle quickly.

Implementation lives in `packages/rating`, a pure module with tests against
the worked example in Glickman's paper.

## Matchmaking

Pair two queued players when the gap between their ratings is inside a
**window that widens with waiting time**:

```text
window(t) = min(100 + 25 × seconds_waited, 600) + (RD₁ + RD₂) / 2
```

- Check every 500 ms; pair the closest eligible couple first.
- Avoid rematching the same two players twice in a row unless nobody else is
  queued.
- Keep the same-IP ranked demotion.
- Later, when there are regions: prefer opponents with a round trip under
  120 ms, relaxing that with waiting time too.

The matchmaker becomes one function (`findPairs(queue, now)`), pure and unit
tested, replacing the two copied pairing blocks in `server/index.ts`.

## Leaderboard at scale

Rank is currently a `COUNT(*)` of better players on every profile view. Store
the leaderboard value in an indexed column updated with the rating, compute
rank with a window query in a materialised view refreshed every minute, and
cache the top 100.
