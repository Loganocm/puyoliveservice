#!/usr/bin/env -S npx tsx
/**
 * docs-check: does this change keep its documentation in step?
 *
 *   npm run docs:check                   # against origin/main, including uncommitted work
 *   npx tsx scripts/docs-check.ts --base origin/develop
 *   PR_BODY="$(cat body.txt)" npm run docs:check
 *
 * Gathers what changed since the merge base with --base (git diff against the
 * working tree, plus untracked files), the waivers written in the pull
 * request body (PR_BODY) and the branch's commit messages, and the ADRs and
 * source directories as they are now; then applies the rules in
 * scripts/lib/docs-check-core.ts. Exits 1 on any violation.
 *
 * The contract: docs/adr/0007-documentation-system.md.
 * For contributors: website/src/content/docs/start/documentation-system.md.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkDocs, findWaiver } from './lib/docs-check-core.ts';
import type { ChangedFile, DocMap } from './lib/docs-check-core.ts';

const args = process.argv.slice(2);
const baseFlag = args.indexOf('--base');
const baseRef = baseFlag >= 0 && args[baseFlag + 1] ? args[baseFlag + 1] : (process.env.DOCS_CHECK_BASE || 'origin/main');

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

let base: string;
try {
    base = git('merge-base', baseRef, 'HEAD');
} catch {
    console.error(`docs-check: cannot find the merge base with "${baseRef}". Fetch it first (git fetch origin main) or pass --base <ref>.`);
    process.exit(2);
}

// What changed: tracked changes against the merge base (committed or not),
// plus untracked files. Renames are split into a delete and an add so paths
// stay plain.
const numstat = new Map<string, number>();
for (const line of git('diff', '--numstat', '--no-renames', base).split('\n').filter(Boolean)) {
    const [, deleted, path] = line.split('\t');
    numstat.set(path, deleted === '-' ? 0 : Number(deleted));
}
const changed: ChangedFile[] = git('diff', '--name-status', '--no-renames', base).split('\n').filter(Boolean).map(line => {
    const [status, path] = line.split('\t');
    return { path, status: status[0], deletedLines: numstat.get(path) ?? 0 };
});
for (const path of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    changed.push({ path, status: 'A', deletedLines: 0 });
}

const messages = [process.env.PR_BODY ?? '', git('log', '--format=%B', `${base}..HEAD`)].join('\n');
const engineVersionChanged = /^[-+]\s*export const ENGINE_VERSION\b/m.test(git('diff', base, '--', 'packages/engine/src/replay.ts'));

const map = JSON.parse(readFileSync('docs/doc-map.json', 'utf8')) as DocMap;

const adrs = readdirSync('docs/adr')
    .filter(name => name.endsWith('.md'))
    .map(name => ({ name, content: readFileSync(join('docs/adr', name), 'utf8') }));

/** Files under a directory, recursively, as repository paths. */
function filesIn(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) out.push(...filesIn(path));
        else out.push(path);
    }
    return out;
}

/** `src/*` lists the directories directly under src; a plain path is that directory. */
function expandRoot(root: string): string[] {
    if (!root.includes('*')) return existsSync(root) ? [root] : [];
    const [prefix, suffix = ''] = root.split('*');
    const parent = prefix.replace(/\/$/, '');
    if (!existsSync(parent)) return [];
    return readdirSync(parent)
        .map(entry => join(parent, entry) + suffix)
        .filter(path => existsSync(path) && statSync(path).isDirectory());
}

const sourceDirs = map.sourceRoots.flatMap(expandRoot).map(dir => ({ dir, files: filesIn(dir) }));

const violations = checkDocs({ changed, map, messages, adrs, engineVersionChanged, sourceDirs });

console.log(`docs-check: ${changed.length} changed file(s) since ${baseRef} (${base.slice(0, 8)})`);
const docsWaiver = findWaiver(messages, 'docs');
const changelogWaiver = findWaiver(messages, 'changelog');
if (docsWaiver) console.log(`  waiver: Docs-Impact: none - ${docsWaiver}`);
if (changelogWaiver) console.log(`  waiver: Changelog: skip - ${changelogWaiver}`);

if (violations.length === 0) {
    console.log('docs-check: documentation is in step with the code.');
    process.exit(0);
}

for (const v of violations) {
    console.log(`\n✗ [${v.rule}] ${v.message}`);
    if (v.waivable) {
        const trailer = v.rule === 'changelog' ? 'Changelog: skip - <reason>' : 'Docs-Impact: none - <reason>';
        console.log(`  If this change really needs no update, say why in the PR body or a commit message:\n    ${trailer}`);
    }
}
console.log(`\ndocs-check: ${violations.length} problem(s). See website/src/content/docs/start/documentation-system.md.`);
process.exit(1);
