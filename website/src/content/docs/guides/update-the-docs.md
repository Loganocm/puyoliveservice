---
title: Update the documentation
description: The step-by-step for keeping these pages in step with a change — for people and for AI agents — and how to check it before pushing.
sidebar:
  order: 6
---

Documentation is part of the change, in the same commit or pull request. This
is the procedure; the contract it follows and why it exists are on
[Documentation system](/start/documentation-system/). AI agents get the same
rules from `AGENTS.md` at the repository root.

## 1. Find the pages

```bash
npm run docs:check
```

It compares your branch with `origin/main` (committed and uncommitted work)
and names, for each area of code you touched, the pages that describe it
(from `docs/doc-map.json`). Updating any one of them satisfies the check, but
update **every** page that is now wrong: the check is a floor.

## 2. Change them

- Say what the code does now, including what is still wrong with it.
- One home per fact: if another page already explains it, link to it.
- Timings in frames at 60 fps, with wall time in brackets.
- Link between pages with absolute site paths (`/reference/rules/`).
- A new page needs `title` and `description` frontmatter, and a sidebar entry
  in `website/astro.config.mjs` unless its section is generated.
- A new area of code needs a rule in `docs/doc-map.json`, or the check fails
  with `unmapped-code`.

## 3. Record the change

- **Changelog:** an entry under `## [Unreleased]` in `CHANGELOG.md`, in the
  right group, written for someone who did not see the change, citing any
  finding it resolves (`**NET-17**: ...`).
- **Findings:** mark a resolved finding *Fixed* with the version in the
  [register](/review/findings/); add a newly found problem with the next free
  number in its area. Never renumber or delete.
- **Roadmap:** update the item's status if the change completes or starts it.
- **Decision:** an ADR if the change makes or reverses a decision
  ([Write an ADR](/guides/write-an-adr/)).

## 4. Check

```bash
npm run docs:check    # the contract
npm run docs:build    # the site builds and every internal link resolves
npm run docs:dev      # read it at http://localhost:4321
```

## Waivers

If a rule really does not apply, say why on its own line in the pull request
description or a commit message:

```
Docs-Impact: none - renames a private helper
Changelog: skip - CI configuration only
```

A waiver without a reason is not accepted, and the behaviour-change and ADR
rules cannot be waived.
