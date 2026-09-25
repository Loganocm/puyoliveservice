---
title: Business plan
description: Positioning, audience, business model, the metrics that define success, costs, and the launch sequence for Puyo Live as a professional product.
sidebar:
  order: 1
---

## Positioning

**The competitive falling-puzzle chain game you can play in five seconds, on
anything, fairly.** No install, no account needed to start, a fair server
deciding every ranked match, and a community site that makes it a place rather
than a page.

What sets it apart:

1. **Instant**: a browser link, desktop or phone, straight into a match.
2. **Fair by construction**: a deterministic engine, server-authoritative
   results and replays that prove what happened.
3. **Its own identity**: original art, a recognisable look, and rules that
   respect the genre's competitive heritage.
4. **A community home**: forums, news, rankings and replays in one place,
   in the way osu! and TETR.IO built theirs.

## Audience

| Segment | Why they come | What keeps them |
|---|---|---|
| Genre competitors (players of the console Puyo games and of TETR.IO) | Ranked play without buying a console game, with standard rules | Fair ranks, Tsu rules, replays, tournaments |
| Casual puzzle players arriving by shared link | Instant, pretty, playable on a phone | Short sessions, daily progression, friends |
| The Japanese scene | The genre's largest competitive community | Japanese localisation, Tsu rules, low latency |

## Business model

Monetisation starts only after the legal questions are resolved (LEG-01), and
never sells advantage.

- **Supporter subscription** (modelled on osu!supporter): profile flair,
  extended replay storage, additional themes, supporting the servers.
- **Cosmetics**: board themes and piece styles. The procedural art system makes
  new themes cheap to produce.
- **Events**: sponsored tournaments and seasonal events.
- No advertisements during play; no pay-to-win.

## Metrics

**North star: weekly active competitors**, the players who complete at least
three matches in a week. It captures both acquisition and whether the game is
worth coming back to.

| Area | Metric | Initial target |
|---|---|---|
| Activation | Time from landing to first completed match | < 60 s |
| Retention | Day-1 / Day-7 / Day-30 return rate | 35% / 15% / 7% |
| Engagement | Matches per active player per day | ≥ 4 |
| Matchmaking | Queue time p50 / p90 | < 15 s / < 45 s |
| Quality | Match completion rate (no abort or desync) | ≥ 99% |
| Quality | Crash-free sessions | ≥ 99.5% |
| Performance | Largest Contentful Paint / Interaction to Next Paint (p75) | < 2.0 s / < 150 ms |
| Community | Forum posts per week; share-link visits | Tracked from 0.3.0 |

Analytics: a privacy-friendly, self-hosted tool (Umami or Plausible) for the
website, and game events in PostgreSQL. Nothing sold, nothing shared.

## Costs

| Item | Monthly |
|---|---|
| Home server (power) and domain | ~ $10 |
| Vercel (client hosting), free tier | $0 |
| Cloudflare Tunnel, CDN and R2 (object storage, no egress fees) | ~ $0–5 at current scale |
| Self-hosted observability (GlitchTip, Prometheus, Grafana, Uptime Kuma) on the same host | $0 |
| **Total** | **under $20** |

Scaling beyond one host (phase 4) adds a small VPS per region, roughly $10–40
per month each.

## Launch sequence

1. **Closed beta** after phase 1: ranked is server-authoritative. Invite the
   existing community; gather desync and latency data.
2. **Public launch** after phase 2: own identity, mobile, fast. Announce in
   genre communities.
3. **Season 1** with phase 3: Glicko-2 ranks, forums and replays; the first
   tournament.
4. **Supporter tier** in phase 4, once there is a community to support.
