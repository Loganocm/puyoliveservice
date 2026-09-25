---
title: Risk register
description: The risks to Puyo Live as a product and a codebase, their likelihood and impact, and the mitigation for each.
sidebar:
  order: 2
---

Reviewed at every release. Likelihood and impact are High, Medium or Low.

| Risk | L | I | Mitigation | Owner action |
|---|---|---|---|---|
| **IP claim** over the name or art | M | H | Original art shipped in 0.3.0; `ASSETS.md` provenance; rebrand before monetising (LEG-01) | Decide the name |
| **Cheating** in ranked while results are client-decided | H | H | Server authority (P1.4); until then, flag ranked results with anomalies for review | |
| **Key-person dependency**: one developer, and assistants with no memory | H | H | Enforced documentation, ADRs, `AGENTS.md`, tests that explain intent; everything needed to continue is in the repository | |
| **AI-introduced regressions**: plausible code that breaks invariants | M | H | Characterization goldens, animation catalogue coverage, docs governance CI, invariants written in `AGENTS.md` | |
| **Data loss** (single host, 10-day backups) | M | H | Daily off-host backups, WAL archiving, monthly restore test (P0.5) | |
| **Home-server outage** (power, ISP) | M | M | Uptime alerts; documented restore to a cheap VPS within an hour; the client stays up on Vercel | |
| **Deploys breaking live matches** | H | M | Drain before swap, staging, pinned releases (P2.6) | |
| **Security breach** (token theft, injection) | L | H | Cookie sessions, CSP, schema validation, dependency scanning (P2.4) | |
| **Moderation load** once forums exist | M | M | Rate limits, reports queue, bans (now working), audit log | Appoint moderators as the community grows |
| **Toxicity** hurting retention | M | M | Community guidelines, reporting, mute and block | Publish guidelines |
| **Dependency churn** (majors behind) | H | L | Dependabot weekly grouped updates; upgrade window each phase (P2.7) | |
| **Scaling cliff** from a viral moment | L | M | Headroom on one process is large; the scale-out design is ready (P4.1); cap the matchmaking queue gracefully | |
| **Cost growth** | L | L | Self-hosted observability, R2 without egress fees, static client | |
