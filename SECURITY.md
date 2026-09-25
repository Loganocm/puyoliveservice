# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting instead: the **Security** tab of the repository, then
**Report a vulnerability**. Include what you found, how to reproduce it, and
what an attacker could do with it.

You will get an acknowledgement within a few days. Please give us a reasonable
time to fix the problem before disclosing it.

## Scope

In scope: the game client, the game server (Socket.IO), the REST API, and the
deployment configuration in this repository. Examples: authentication or
authorisation bypass, a way to record results or rating changes you did not
earn, cross-site scripting (for example through forum posts or usernames), and
denial of service against a single match from an ordinary client.

Out of scope: attacks needing a compromised machine, social engineering, and
volumetric denial of service.

## What is in place

- Match results and ratings are recorded only by the game server, with an
  internal key; players cannot submit their own.
- Passwords are hashed with bcrypt; sessions are signed JWTs, invalidated by bans.
- The API uses Helmet, CORS with an explicit allowlist, rate limits, and body
  size limits. Forum posts are stored as plain text and rendered without HTML.
- Dependencies are watched by Dependabot.

Known weaknesses and their status are tracked openly in the review:
`website/src/content/docs/review/backend-and-security.md` and the findings
register (`website/src/content/docs/review/findings.md`).
