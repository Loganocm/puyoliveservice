# Contributing to Puyo Live

Thanks for helping. This file is the short version; the full guide is the
documentation site (`website/`, published at the address in the README).

## Set up

You need Node 22 (see `.nvmrc`) and, for the API, PostgreSQL 16.

```sh
npm install
npm --prefix api install
npm --prefix website install      # only if you will work on the docs
npm run dev                       # client, http://localhost:5173
npm run server                    # game server, :3000
npm run api                       # REST API, :8080 (DATABASE_URL must point at PostgreSQL)
```

Step by step, including the database: `website/src/content/docs/start/getting-started.md`.

## The definition of done

Every pull request carries its own documentation. A change is done when it has:

1. **Tests.** New behaviour is tested; a bug fix has a test that fails without it.
2. **Docs.** The pages describing what changed are updated. `docs/doc-map.json`
   lists which pages cover which code.
3. **A changelog entry** under `## [Unreleased]` in `CHANGELOG.md`.
4. **An ADR** in `docs/adr/` if it makes or reverses an architectural decision.
5. **An `ENGINE_VERSION` bump and an ADR** if engine behaviour changed.
6. **Findings updated** if it resolves or discovers a problem in the review.

CI checks this on every pull request (`npm run docs:check` runs the same check
locally). If a rule really does not apply, say so and why, in the pull request
description or a commit message:

```text
Docs-Impact: none - renames a private helper, no behaviour change
Changelog: skip - test-only refactor
```

The pull request template has the checklist. The reasoning behind all this is
ADR 0007 (`docs/adr/0007-documentation-system.md`).

## Before you open a pull request

```sh
npm test && npm run typecheck && npx tsc -p server --noEmit && npx tsc -p scripts
npm run build
npm run docs:check
```

Plus `npm --prefix api test` if you changed the API, and `npm run docs:build` if
you changed the site.

## Style

- Match the file you are in: naming, comment density, formatting.
- Comments say why, not what. Cite the decision or finding that explains an
  unusual choice (`ADR 0003`, `NET-06`).
- User-facing text: plain, short, British spelling as in the rest of the game.
- Colours come from the theme tokens (`src/theme/tokens.ts`); timings are in
  frames at 60 fps.

## AI assistants

Most changes here are made with AI tools. They follow `AGENTS.md`, which holds
the same contract plus the invariants they must not break. If you change the
rules, change them there.

## Reporting problems

Bugs and ideas: GitHub issues (there are forms). Security issues: see
`SECURITY.md`, not a public issue.
