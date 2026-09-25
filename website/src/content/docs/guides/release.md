---
title: Release
description: How to cut a release — version bump, changelog section, tag — and how the GitHub release notes are produced from CHANGELOG.md.
sidebar:
  order: 3
---

A release is a commit on `main` that names a version, plus a tag. The release
notes are that version's section of `CHANGELOG.md`, published by
`.github/workflows/release.yml`; they are never written anywhere else.

## Steps

1. Make sure `main` is green and `## [Unreleased]` in `CHANGELOG.md` lists
   everything since the last release. Read it as a player would: every entry
   should make sense to someone who did not see the change.
2. Choose the version ([Versioning](/reference/versioning/)).
3. In one commit on a branch:
   - rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a new, empty
     `## [Unreleased]` above it;
   - update the comparison links at the bottom of the file;
   - set `"version": "X.Y.Z"` in the root `package.json` (and run `npm install`
     so the lockfile agrees).
4. Check the notes: `npx tsx scripts/release-notes.ts X.Y.Z` prints exactly what
   the release will say, and fails if the version and the changelog disagree.
5. Merge, then tag the merge commit and push the tag:

   ```bash
   git tag -a vX.Y.Z -m "Puyo Live X.Y.Z"
   git push origin vX.Y.Z
   ```

6. The Release workflow runs the full verification, extracts the notes and
   creates the GitHub release. If it fails, fix the cause on `main`, delete the
   tag (`git push origin :vX.Y.Z`) and tag again.

The services themselves deploy from `main` continuously
([CI/CD](/reference/ci-cd/)); the tag marks what a version contains and
publishes its notes.

## If the engine changed

A release whose changelog has an `ENGINE_VERSION` bump invalidates stored
replays from the previous engine (NET-12). Say so at the top of the release's
changelog section.
