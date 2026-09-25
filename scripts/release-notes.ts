#!/usr/bin/env -S npx tsx
/**
 * Print the release notes for a version: its section of CHANGELOG.md.
 *
 *   npx tsx scripts/release-notes.ts 0.3.0 > notes.md
 *
 * Fails if the version has no section, or if it does not match package.json,
 * so a tag can only be released once its changelog entry and version bump are
 * committed. Used by .github/workflows/release.yml.
 */

import { readFileSync } from 'node:fs';
import { changelogSection } from './lib/changelog.ts';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error('usage: release-notes <version>, for example 0.3.0 or v0.3.0');
    process.exit(2);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
if (pkg.version !== version) {
    console.error(`package.json is at ${pkg.version}, not ${version}. Bump it in the release commit.`);
    process.exit(1);
}

const notes = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
if (!notes) {
    console.error(`CHANGELOG.md has no "## [${version}]" section. Move the Unreleased entries under it first.`);
    process.exit(1);
}
process.stdout.write(notes + '\n');
