---
title: Versioning
description: The three version numbers in the repository — the product version, ENGINE_VERSION and the replay format — what changes each one, and how the changelog and releases follow from them.
sidebar:
  order: 10
---

Three numbers, each with one job.

| Number | Where | Changes when | Current |
|---|---|---|---|
| Product version | `package.json` `version` (shown in the footer) | Every release | 0.3.0 |
| `ENGINE_VERSION` | `packages/engine/src/replay.ts` | Engine behaviour changes: any change that makes the same seed and inputs play out differently | 1.0.0 |
| Replay format | `version` field of the replay file | The file's shape changes | 3 |

## Product version

[Semantic versioning](https://semver.org/). While the product is below 1.0,
a **minor** release (0.3 → 0.4) may change behaviour players notice or break
compatibility with old clients; a **patch** release (0.3.0 → 0.3.1) only fixes.
1.0 will mean the ranked ruleset and the API are stable.

The API (`api/package.json`) and the game server (`server/package.json`)
deploy continuously from `main` and keep their own package versions; the
product version is the one players and release notes refer to.

## `ENGINE_VERSION`

Stamped into every replay. It is not about code, it is about **outcomes**: a
refactor that leaves every characterization golden unchanged does not bump it;
anything that changes a golden does.

- **Major** (1.x → 2.0): the rules change, for example a new chain power
  table, lock-delay limit or piece generator. Old replays can no longer be
  played by the new engine.
- **Minor**: new behaviour that old replays cannot contain, for example a new
  input symbol.
- **Patch**: a fix to behaviour so rare that no recorded replay is expected to
  hit it; still recorded in an ADR.

A bump always comes with an ADR and updated goldens in the same change
([Change the engine](/guides/change-the-engine/)); `npm run docs:check`
enforces it. Today a bump makes older replays unplayable because only one
engine ships (NET-12; a registry of rulesets is planned in
[engine v2](/architecture/engine-v2/)).

## Replay format version

Changes only when the file's structure changes. Version 2 files are
recognised so the interface can say they are too old; only version 3 plays
([Replay format](/reference/replay-format/)).

## Changelog and releases

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Every change adds its entry under `## [Unreleased]` as it is made, in the
group that fits (Added, Changed, Deprecated, Removed, Fixed, Security), citing
the finding it resolves. A release renames that section to the version and
date and tags the commit; the GitHub release notes are that section, extracted
by `scripts/release-notes.ts` ([Release](/guides/release/)). The changelog is
also the [Changelog](/releases/changelog/) page of this site, generated at
build time, so it is written once and read in three places.
