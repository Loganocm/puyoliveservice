---
title: 2026 technical review
description: Executive summary of the top-to-bottom review of Puyo Live — scorecard by area, what is already strong, the critical problems, and what to do first.
sidebar:
  label: Executive summary
  order: 0
---

**Baseline:** commit `2dc077e` (2026-08-25). **Reviewed:** 2026-09-25.
**Scope:** every service, the engine, the client, CI/CD, deployment, data,
security, documentation, and legal and business readiness. Game rules were
checked against Puyo Puyo Tsu reference data (see
[Rules fidelity](/review/rules-fidelity/) for sources).

Every claim below is backed by an entry in the
[findings register](/review/findings/), with file and line evidence and a
roadmap item. Findings resolved by later work are marked there, so this page
stays a true description of the baseline.

## Verdict

Puyo Live has a **better core than most hobby projects and a weaker perimeter
than it needs**. The simulation is deterministic, shared by client and server,
and pinned by characterization tests. That is the hardest part of a competitive
game to retrofit, and it is already done. But ranked results cannot currently
be trusted, the rules differ from the genre standard in ways that change how
the game is played, and there is no operational safety net. None of this is a
rewrite. It is a sequence of well-understood projects, set out in the
[roadmap](/roadmap/).

## Scorecard

| Area | Grade | One-line reason |
|---|---|---|
| Engine design and determinism | **B+** | Pure, fixed-step, shared by client and server, replay-verified. No snapshot/restore and no ruleset abstraction yet |
| Rules fidelity (vs Puyo Puyo Tsu) | **D** | Chain power, chain timing, piece generation, top-out and garbage caps all differ. Three room settings do nothing |
| Netcode and competitive integrity | **D** | Shared clock and input-simulated opponent view are excellent. But garbage and top-out are decided by the client, so a modified client cannot lose |
| Client and UX | **C−** | Plays well on a 60 Hz desktop. Handling speed depends on monitor refresh rate, the bundle is 91 MB, and there is no accessibility or localization |
| Backend and data | **C** | Transactional match recording is solid. Moderation tables were never migrated, avatars are stored as base64 rows, and Elo uses a fixed K |
| Security | **C** | Good fundamentals (bcrypt, helmet, rate limits, secrets enforced in production, constant-time key compare). Tokens sit in `localStorage` with no revocation |
| Operations and delivery | **C** | A real CI gate and a full-stack smoke test. But `:latest` auto-deploys with no staging, rollback, metrics or alerting, and backups run every 10 days |
| Code quality and testing | **C+** | The engine suite is excellent. The client, the game server's socket layer and the UI have almost no tests, and there is no lint standard |
| Documentation | **B → A** | Honest README and six good ADRs. Now a maintained site with enforced updates ([ADR 0007](/decisions/0007-documentation-system/)) |
| Legal and business readiness | **F** | Trademarked name and art of unverified provenance block any monetization, and there is no LICENSE file |

## What is already strong

Credit where it is due. These are decisions that professional studios get wrong,
and this codebase gets them right:

- **Determinism by construction.** Fixed-step engine, no wall clock, one PRNG,
  injected configuration, no host globals (enforced by the compiler), and an
  engine version stamped into every replay
  ([ADR 0005](/decisions/0005-fixed-step-engine/),
  [ADR 0006](/decisions/0006-shared-engine-package/)).
- **One engine for client and server.** The class of bug where the server's
  copy of the rules disagrees with the client's is gone, not merely tested for.
- **Replays as event sourcing.** Seed plus input log, verified against periodic
  state hashes, kilobytes per match ([ADR 0002](/decisions/0002-replay-determinism/)).
- **A shared match clock** so frame N is the same instant on both machines, and
  an **opponent view simulated from the input stream** instead of relayed
  snapshots ([ADR 0003](/decisions/0003-shared-match-clock/),
  [ADR 0004](/decisions/0004-opponent-simulation/)). Together these are most of
  the way to rollback netcode.
- **Characterization goldens that CI refuses to launder**, and coverage floors
  that prove the test drivers actually reach chains.
- **An ADR culture** and a README that states limitations honestly.

## The problems that matter most

In priority order. Severity S1 means ranked integrity, security or legal
exposure now; S2 means incorrect behaviour players will hit, or a blocker for
the roadmap.

1. <span class="sev s1">S1</span> **Ranked results are decided by the client.**
   The server relays whatever garbage a client claims (up to 3,000 per second)
   and ends a match only when the loser reports its own loss (NET-01, NET-02).
   The server already runs the same engine; it is simply not trusted, because
   it is not frame-aligned (NET-04) and garbage timing is set by packet arrival
   (NET-05). Fix: [authoritative rollback netcode](/architecture/netcode/).
2. <span class="sev s1">S1</span> **The name and artwork are not cleared.**
   "Puyo Puyo" is a SEGA trademark and the sprite sheet follows the layout of
   community skins derived from official art (LEG-01). Nothing commercial can
   happen until this is resolved.
3. <span class="sev s2">S2</span> **Players on the same seed stop getting the
   same pieces.** Garbage placement and piece generation share one random
   stream, so receiving garbage changes your future pieces. Verified: the
   sequences diverge at piece 107 (RUL-04). In Puyo both players always see the
   same sequence; here the fairer player can be dealt worse pieces.
4. <span class="sev s2">S2</span> **A piece can be held off the ground
   forever.** Every move or rotation resets the lock timer without limit, and
   holding a direction pauses it entirely (RUL-05). Because garbage only drops
   after a piece locks, a losing player can stall indefinitely.
5. <span class="sev s2">S2</span> **Scoring and chain timing are not the genre's.**
   Chain power doubles every link after the fifth instead of rising by 32, so a
   10-chain sends 4.4× the garbage it would in Tsu, and chain animation slows
   exponentially (a 19th link takes 5.2 seconds to pop). Both change strategy
   fundamentally (RUL-01, RUL-03). These may be deliberate; they need a
   [ruleset decision](/architecture/engine-v2/#rulesets).
6. <span class="sev s2">S2</span> **Handling depends on the monitor.** DAS and
   ARR count rendered frames, so a 144 Hz player's DAS is 2.4× faster than a
   60 Hz player's with identical settings (CLI-01).
7. <span class="sev s2">S2</span> **No safety net in production.** No staging,
   no rollback, no metrics, no alerting, and a restart drops every live match
   (OPS-01, OPS-02, NET-10).

## Fixed during this review

Small, verified fixes that did not need a design decision were made
immediately, each with a regression test where one could be written:

| Finding | Fix |
|---|---|
| NET-06 | Spawn-frame moves are now recorded; replays, the opponent view and the server no longer miss them |
| NET-07 | Reconnecting keeps the player's index, simulator and recorded settings (4 tests) |
| API-01 | Moderation tables finally have a migration (verified idempotent on fresh and `db push` databases); banned users can no longer log in (3 tests) |
| OPS-06 | The API suite had rotted outside CI; fixed and now runs in CI against PostgreSQL (66 tests green) |
| OPS-07 | Game server's default API port corrected |
| DOC-01 | Documentation site, changelog, release notes and CI enforcement |

## What to do first

The [roadmap](/roadmap/) has the full plan. The first moves, in order:

1. **Decide the rulesets** (a one-hour decision, not a project): keep
   "Puyo Live" rules for casual play, adopt Tsu rules for ranked, or unify. It
   determines the scope of engine v2.
2. **Resolve the legal questions** (LEG-01, LEG-02) before investing in art,
   audio or marketing.
3. **Engine v2 foundations**: snapshot and restore, a full-state hash, separate
   random streams, a lock-reset cap and a ruleset object. Each is small; they
   unlock everything in phase 1.
4. **Frame-align the server simulation** and schedule garbage deterministically.
   Then turn server authority on.
5. **Add the operational floor**: error tracking, uptime checks, daily tested
   backups, image tags pinned to commit SHAs.
