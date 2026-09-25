---
title: How documentation works
description: Where each kind of documentation lives, the definition of done every change is held to, how CI enforces it, and how AI agents are instructed to keep it current.
sidebar:
  order: 3
---

Documentation here is part of the product, not an afterthought. It is updated in
the **same pull request** as the code it describes, by whoever makes the change,
human or AI agent. CI checks this on every pull request. The design is recorded
in [ADR 0007](/decisions/0007-documentation-system/).

## Where things go

The site follows the [Diátaxis](https://diataxis.fr/) framework: four kinds of
documentation, each with one job. Put new material where its job is.

| Kind | Section | Answers | Example |
|---|---|---|---|
| Tutorial / orientation | [Start here](/start/getting-started/) | "How do I get going?" | Getting started |
| How-to guide | [How-to guides](/guides/change-the-engine/) | "How do I do X safely?" | Add an input symbol |
| Reference | [Reference](/reference/rules/) | "Exactly what does it do?" | Frame timing, wire protocol |
| Explanation | [Architecture](/architecture/current/), [Review](/review/) | "Why is it like this?" | Shared match clock |

Plus three special sections:

| Section | Canonical source | Notes |
|---|---|---|
| [Decisions](/decisions/) | `docs/adr/NNNN-*.md` | Generated into the site at build time. Edit the files in `docs/adr/` |
| [Changelog](/releases/changelog/) | `CHANGELOG.md` | Generated at build time. Edit the root file |
| [Roadmap](/roadmap/) and [Review](/review/) | this site | Living documents: statuses change as work lands |

**One home per fact.** If a fact is already written somewhere, link to it; do
not restate it. Duplicated facts drift, and drift is the failure this system
exists to prevent.

## Definition of done

A change is done when **all** of these are in the same pull request:

1. **Code and tests.** Behaviour changes have tests; bug fixes have a
   regression test that fails without the fix.
2. **Docs.** Every page describing the changed behaviour is updated. The
   [code-to-docs map](#the-code-to-docs-map) says which pages those are.
3. **Changelog.** An entry under `## [Unreleased]` in `CHANGELOG.md`, in the
   right group (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
   `Security`), written for a reader who did not see the pull request. Cite the
   finding ID if the change resolves one (`**NET-04** …`).
4. **ADR**, if the change makes or reverses an architectural decision
   ([Write an ADR](/guides/write-an-adr/)).
5. **`ENGINE_VERSION` bump and ADR**, if engine behaviour changed (a
   characterization golden changed) ([Change the engine](/guides/change-the-engine/)).
6. **Findings register**, if the change resolves or discovers a finding:
   update its status in the [register](/review/findings/) and its roadmap item.

## What CI enforces

`scripts/docs-check.ts` runs on every pull request (the `Docs governance` job)
and against `origin/main` locally with `npm run docs:check`.

| Rule | Fails when | Waivable |
|---|---|---|
| Mapped docs | A changed file matches a rule in `docs/doc-map.json` and none of that rule's pages changed | Yes: `Docs-Impact: none - <reason>` |
| Changelog | Any non-documentation file changed and `CHANGELOG.md` did not | Yes: `Changelog: skip - <reason>` |
| Behaviour change | A snapshot golden has modified or deleted lines, and the change lacks an `ENGINE_VERSION` change in `packages/engine/src/replay.ts` or a new ADR | No |
| ADR format | An ADR lacks `# N. Title`, `**Status:**` or `**Date:**`, or numbers are duplicated or skipped | No |
| Unmapped code | A new top-level source directory has no rule in the map | No (add a rule) |

Waivers go in the pull request description or any commit message in the
branch, on their own line, and **must give a reason**:

```text
Docs-Impact: none - renames a private helper, no behaviour change
Changelog: skip - test-only refactor
```

The site build (`Docs site` job) also fails on any broken internal link or
missing page, so renaming a page means updating its links in the same change.

## The code-to-docs map

`docs/doc-map.json` maps source paths to the pages that describe them. For
example, a change under `packages/engine/src/` must touch at least one of the
rules, frame timing, engine or replay-format pages. Keep it current: when you
add a new area of code, add a rule, and when you add a page that documents an
area, add it to that area's rule.

## Instructions for AI agents

Agents read their instructions from the repository root:

| File | Read by |
|---|---|
| `AGENTS.md` | The canonical instructions. Read natively by Codex, Cursor, Jules, Aider and others |
| `CLAUDE.md` | Claude Code; imports `AGENTS.md` |
| `GEMINI.md` | Gemini CLI; imports `AGENTS.md` |

`AGENTS.md` carries the definition of done above, the invariants that must
never be broken (single engine advance per frame, engine purity, replay
ordering, goldens), and the exact files to touch for common changes. Change
the rules there, once; the other two files only import it.

## Writing conventions

- **Frontmatter.** Every page needs `title` and `description`. The description
  is used for search, link previews and `/llms.txt`.
- **Links.** Use absolute site paths (`/reference/rules/`), never relative
  ones; the build rejects relative links. In `docs/adr/` and `CHANGELOG.md`,
  which are also read on GitHub, link to the page's source file
  (`website/src/content/docs/reference/rules.md`); the sync step rewrites it.
- **Code references.** Name the file and the symbol
  (`GameEngine.handleCheckMatch`). Line numbers go stale; use them only in the
  [findings register](/review/findings/), which is pinned to a commit.
- **Units.** Timings are in frames at 60 logical fps, with wall time in
  parentheses. Garbage is in *rocks* or *points*; say which.
- **Tone.** State what the code does, including when it is wrong. A known
  limitation belongs on the page, not in someone's memory.
- **Diagrams.** Use fenced `mermaid` blocks. They are text, so they are diffed
  and edited like everything else.

## Releases and release notes

Release notes are not written separately: they are the `CHANGELOG.md` section
for the version. Pushing a `vX.Y.Z` tag runs the release workflow, which
publishes that section as the GitHub release. See
[Cut a release](/guides/release/) and [Versioning](/reference/versioning/).
