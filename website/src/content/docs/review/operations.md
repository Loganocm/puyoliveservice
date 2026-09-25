---
title: Operations and delivery
description: Review of CI, deployment, backups, observability and dependency health, with the minimum operational floor for a live game.
sidebar:
  order: 7
---

Findings: `OPS-01` to `OPS-10`, `NET-10` in the [register](/review/findings/).
Target: [platform](/architecture/platform/).

## What is good

- **A real gate.** Every deploy passes type checks for all four projects, the
  engine suite, a client build and a Docker smoke test that boots the stack and
  checks that migrations ran ([CI/CD](/reference/ci-cd/)).
- **No inbound ports.** Ingress is a Cloudflare Tunnel.
- **Migrations on boot** with `set -e`, so a failed migration stops the
  container rather than starting against the wrong schema.
- **Log rotation**, added after logs filled the disk.

## The missing floor

A live multiplayer game needs, at minimum: to know it is down, to know what
version is running, to go back to the previous version in one step, and to
restore its data. Today it has none of these.

| Need | Today | Minimum |
|---|---|---|
| Know it is down | Players report it | External uptime check on `/health` for both services, alerting to Discord or email |
| Know it is broken | Read container logs | Error tracking (Sentry or self-hosted GlitchTip) on client, server and API |
| Know what is running | `:latest` | Images tagged with the commit SHA and the release version; `/health` reports both |
| Roll back | Rebuild an old commit | Redeploy the previous tag |
| Avoid breaking matches | Watchtower hot-swaps mid-match | Drain: stop matchmaking, wait for matches to end (bounded), then swap |
| Restore data | 10-day backups on the same host, never tested | Daily backups, copied off-host (R2 or S3), a monthly automated restore test |

## Observability

Beyond the floor, a competitive game should measure what players feel:

- **Service level objectives**: match start success rate, input-to-display
  latency (p95), desync rate (hash mismatches per 1,000 matches), reconnect
  success rate, API p95 latency.
- **Tools**: structured JSON logs (pino) with a request and match id,
  OpenTelemetry traces across client, game server and API, Prometheus metrics
  scraped by Grafana (self-hosted fits the home-server deployment), and a
  status page fed by the uptime checks. The footer's "All systems operational"
  indicator should be driven by that, not hard-coded.

## Supply chain

Dependencies are a major version behind in several places (OPS-05);
Dependabot now opens grouped weekly updates. Also recommended (OPS-09): pin
GitHub Actions by commit SHA, enable CodeQL and secret scanning, generate an
SBOM for each image, and sign images with Sigstore cosign. Watchtower mounts
the Docker socket, which is root on the host; replacing pull-based
auto-deploy with a deploy job that runs `docker compose pull && up -d` for a
specific tag removes that and adds an audit trail.

## Housekeeping

- The root `Dockerfile` builds the client with Node 20 (end of life) and ignores
  the engine workspace (OPS-04). Vercel builds the client, so delete it.
- 88 MB of binary assets live in git history without LFS (OPS-10). Moving
  assets to LFS or an asset bucket and compressing them (see
  [client review](/review/client/)) shrinks every clone and every CI run.
- CORS allowlists are duplicated in two services, and Socket.IO ignores
  `CORS_ORIGIN` (OPS-08). One shared configuration module.
