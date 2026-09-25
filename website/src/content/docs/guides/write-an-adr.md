---
title: Write an ADR
description: When a change needs an architecture decision record, how to write one, and how ADRs become pages on this site.
sidebar:
  order: 2
---

An architecture decision record (ADR) is a short, permanent note of a decision
that shapes the code: what forced it, what was decided, and what follows. They
live in `docs/adr/` and appear on this site under **Decisions**, generated at
build time.

## When one is needed

- The change makes or reverses a decision someone would otherwise have to
  rediscover: a new dependency or service, a data format, a protocol, a rule
  every contributor must follow.
- Engine behaviour changes (goldens move): always, with an `ENGINE_VERSION`
  bump ([Change the engine](/guides/change-the-engine/)).
- Not for bug fixes, refactors inside one module, or anything the changelog
  says fully.

## Writing it

1. Copy `docs/adr/TEMPLATE.md` to `docs/adr/NNNN-short-slug.md` with the next
   free number. Numbers are never reused or skipped.
2. The first line is `# N. Title`, stated as the decision in the present tense
   ("The engine is one package, shared by the client and the server").
3. `**Status:**` is *Proposed* while the change is in review and *Accepted* when
   it merges. `**Date:**` is the day it was accepted.
4. **Context**: the problem and the constraints, with numbers where you have
   them, for a reader who was not there.
5. **Decision**: what will be done, and what was rejected and why.
6. **Consequences**: what gets easier, what gets harder, what is now a rule,
   and which goldens, migrations and pages changed.
7. Link with relative paths, so the file reads correctly on GitHub too:
   another ADR as `0006-shared-engine-package.md`, a page of this site as
   `../../website/src/content/docs/reference/rules.md` (it becomes
   `/reference/rules/`), and any other file as `../../packages/engine/src/replay.ts`
   (it becomes a link to the file on GitHub). The site generator
   (`website/scripts/sync-content.mjs`) rewrites them.

An accepted ADR is not rewritten. If the decision changes, write a new ADR and
set the old one's status to `Superseded by NNNN`.

`npm run docs:check` checks the name, the title number, the status and date
lines, and that numbers run from 1 without gaps or repeats.
