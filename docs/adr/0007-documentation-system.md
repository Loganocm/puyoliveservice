# 7. Documentation is a site, a contract, and a CI gate

**Status:** Accepted
**Date:** 2026-09-25

## Context

The repository's documentation was a 630-line README plus six ADRs. The
README was good, but it was doing four jobs at once: front door, reference
manual, explanation of design, and contributor rules. Several things followed
from that:

- **Facts had two homes.** Frame constants, the vocabulary and the replay
  format were described in the README *and* in source comments, and nothing
  kept them in step.
- **Nothing required documentation to change with the code.** The contributor
  rules asked for it; no check enforced it. Most of this codebase was written
  with AI assistance, and an assistant with no memory of earlier sessions
  follows what is enforced and written down, not what was intended.
- **There was no changelog or release history**, so "what changed and when"
  could only be recovered by reading commit messages.
- **The review and roadmap had nowhere to live.** A findings register and a
  multi-phase plan do not fit in a README.

The owner's requirement is explicit: documentation must be thorough, must be
maintained automatically by the AI tools that make most changes, and that
maintenance must be mandated and visible in the README and release notes.

## Decision

### One home per fact, organised by Diátaxis

Documentation moves into a site built with **Astro Starlight** in `website/`,
organised by the Diátaxis framework (Procida): *tutorials* and orientation
under Start here, *how-to guides*, *reference* for exact behaviour, and
*explanation* for architecture and the review. Each fact is written once; other
places link to it.

Two sections are generated at build time from their canonical sources so that
they cannot drift:

| Canonical source | Generated page |
|---|---|
| `docs/adr/NNNN-*.md` | `/decisions/…` plus an index |
| `CHANGELOG.md` | `/releases/changelog/` |

ADRs stay in `docs/adr/`, where source comments already point.

Starlight was chosen over Docusaurus and VitePress because it is Markdown-first
(what AI tools edit most reliably), ships search (Pagefind) and accessible
navigation without configuration, builds static output with no client
framework, and has maintained plugins for internal link validation and
`llms.txt`.

### The site is its own package, not a workspace

`website/` has its own `package.json` and lockfile, like `api/`. The root
workspace overrides `vite` to a pinned `rolldown-vite`, and npm applies
overrides across a workspace, which would force that build onto Astro. Keeping
the site outside the workspace avoids the interaction rather than managing it.

### The contract is written for agents and humans alike

`AGENTS.md` is the single instruction file for AI coding agents; `CLAUDE.md`
and `GEMINI.md` import it so every tool reads the same rules. Its core is a
**definition of done**: a change is not finished until its documentation, its
`CHANGELOG.md` entry and, where applicable, its ADR and `ENGINE_VERSION` bump
are in the same pull request. `CONTRIBUTING.md` states the same contract for
people.

### The contract is enforced by CI, not by review

`scripts/docs-check.ts` runs on every pull request and fails it when:

1. a changed path is mapped in `docs/doc-map.json` and none of its mapped
   pages changed;
2. code changed and `CHANGELOG.md` did not;
3. a characterization golden has modified or deleted lines (a behaviour
   change) and neither `ENGINE_VERSION` nor a new ADR is in the change;
4. an ADR is malformed or ADR numbers are not unique and contiguous.

An author can waive rule 1 or 2 for a specific change with a trailer in the PR
body or a commit message (`Docs-Impact: none - <reason>`,
`Changelog: skip - <reason>`). A waiver must state its reason, so skipping is a
visible decision, never a silent omission. Rules 3 and 4 cannot be waived.

The site build validates every internal link, so renaming a page without
updating its links fails CI.

### Releases are cut from the changelog

Keep a Changelog format, Semantic Versioning for the product, and a tag-driven
workflow that publishes the tagged version's changelog section as the GitHub
release notes. `ENGINE_VERSION` remains separate: it versions replay
compatibility, not the product.

## Consequences

- Every change carries its own documentation, and the check makes a missing
  update a red build instead of a review comment that may not happen.
- The README shrinks to a front door. Code comments that cited README sections
  now cite page files under `website/src/content/docs/`, which are stable,
  greppable paths.
- The map in `docs/doc-map.json` must itself be maintained: a new top-level
  area of code needs a rule. The check reports unmapped source directories so
  gaps surface.
- The check is path-based, so it proves a doc page was *touched*, not that it
  is *correct*. Correctness still depends on review, and on the reference pages
  being specific enough that a stale sentence is visibly wrong.
- Publishing the site is opt-in (`DOCS_DEPLOY_ENABLED` repository variable),
  so a repository without Pages configured keeps a green `main`.

## Related

- ADR 0006: shared engine package (the workspace this site deliberately stays
  out of)
- `website/src/content/docs/start/documentation-system.md`: the working guide
  to this system
