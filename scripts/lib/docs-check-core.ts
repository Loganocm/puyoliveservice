/**
 * The documentation contract, as pure functions.
 *
 * Given what a change touched (and the repository's current state where a
 * rule needs it), decide whether the change keeps its documentation, its
 * changelog and its decision records in step. No git, no file system: the
 * CLI (scripts/docs-check.ts) gathers the facts and this decides, so every
 * rule is unit tested (tests/scripts/docs-check.test.ts).
 *
 * The rules are specified in docs/adr/0007-documentation-system.md and
 * explained for contributors in
 * website/src/content/docs/start/documentation-system.md.
 */

export interface DocRule {
    /** A human name for the area, shown in failures. */
    name: string;
    /** Globs of source paths this rule covers; a leading `!` excludes. */
    paths: string[];
    /** Pages that describe those paths; touching any one satisfies the rule. */
    docs: string[];
}

export interface DocMap {
    /** Paths that are documentation themselves (never trigger a rule). */
    docOnly: string[];
    /** Characterization goldens: modifying them is a behaviour change. */
    goldens: string[];
    /** Directories that must each be covered by a rule, or listed in `unmapped`. */
    sourceRoots: string[];
    /** Directories deliberately without a rule, each with its reason. */
    unmapped: { path: string; reason: string }[];
    rules: DocRule[];
}

export interface ChangedFile {
    path: string;
    /** git status letter: A added, M modified, D deleted, R renamed. */
    status: 'A' | 'M' | 'D' | 'R' | string;
    /** Lines removed, from `git diff --numstat` (a modified line counts as one removed and one added). */
    deletedLines: number;
}

export interface CheckInput {
    changed: ChangedFile[];
    map: DocMap;
    /** Pull request body and commit messages, searched for waivers. */
    messages: string;
    /** Every ADR file in docs/adr/, name and content. */
    adrs: { name: string; content: string }[];
    /** Whether the diff changed the ENGINE_VERSION line. */
    engineVersionChanged: boolean;
    /** Directories that currently exist under the source roots, with the files in them. */
    sourceDirs: { dir: string; files: string[] }[];
}

export interface Violation {
    rule: 'mapped-docs' | 'changelog' | 'behaviour-change' | 'adr-format' | 'unmapped-code';
    message: string;
    waivable: boolean;
}

const CHANGELOG = 'CHANGELOG.md';
const ADR_DIR = 'docs/adr/';
const ENGINE_VERSION_FILE = 'packages/engine/src/replay.ts';

/**
 * A glob as a regular expression. `**` matches across directories, `*`
 * within one segment, `?` one character. A trailing `/**` also matches the
 * directory itself.
 */
export function globToRegExp(glob: string): RegExp {
    let body = glob;
    let tail = '';
    if (glob.endsWith('/**')) {
        body = glob.slice(0, -3);
        tail = '(?:/.*)?';
    }
    let re = '';
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '*') {
            if (body[i + 1] === '*') {
                const slash = body[i + 2] === '/';
                re += slash ? '(?:.*/)?' : '.*';
                i += slash ? 2 : 1;
            } else {
                re += '[^/]*';
            }
        } else if (ch === '?') {
            re += '[^/]';
        } else {
            re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${re}${tail}$`);
}

/** Whether `path` matches any glob, minus any `!glob` exclusions. */
export function matches(path: string, globs: string[]): boolean {
    const include = globs.filter(g => !g.startsWith('!'));
    const exclude = globs.filter(g => g.startsWith('!')).map(g => g.slice(1));
    return include.some(g => globToRegExp(g).test(path)) && !exclude.some(g => globToRegExp(g).test(path));
}

/** A waiver line with a non-empty reason, e.g. `Docs-Impact: none - renames a helper`. */
export function findWaiver(messages: string, kind: 'docs' | 'changelog'): string | null {
    const re = kind === 'docs'
        ? /^\s*Docs-Impact:\s*none\s*[-–—:]\s*(\S.*)$/im
        : /^\s*Changelog:\s*skip\s*[-–—:]\s*(\S.*)$/im;
    const m = re.exec(messages);
    return m ? m[1].trim() : null;
}

function mappedDocs(input: CheckInput, touched: Set<string>): Violation[] {
    const out: Violation[] = [];
    const code = input.changed.filter(f => !matches(f.path, input.map.docOnly));
    for (const rule of input.map.rules) {
        const hits = code.filter(f => matches(f.path, rule.paths));
        if (hits.length === 0) continue;
        if (rule.docs.some(d => touched.has(d))) continue;
        out.push({
            rule: 'mapped-docs',
            waivable: true,
            message: `${rule.name}: ${hits.map(h => h.path).slice(0, 5).join(', ')}${hits.length > 5 ? ` and ${hits.length - 5} more` : ''} changed, `
                + `but none of its pages did. Update one of:\n${rule.docs.map(d => `    - ${d}`).join('\n')}`,
        });
    }
    return out;
}

function changelog(input: CheckInput, touched: Set<string>): Violation[] {
    const code = input.changed.filter(f => !matches(f.path, input.map.docOnly));
    if (code.length === 0 || touched.has(CHANGELOG)) return [];
    return [{
        rule: 'changelog',
        waivable: true,
        message: `Code changed (${code.slice(0, 3).map(f => f.path).join(', ')}${code.length > 3 ? ', ...' : ''}) but ${CHANGELOG} did not. `
            + 'Add an entry under "## [Unreleased]".',
    }];
}

function behaviourChange(input: CheckInput): Violation[] {
    const changedGoldens = input.changed.filter(f =>
        matches(f.path, input.map.goldens) && (f.status === 'D' || f.deletedLines > 0));
    if (changedGoldens.length === 0) return [];
    const newAdr = input.changed.some(f => f.status === 'A' && f.path.startsWith(ADR_DIR) && /\/\d{4}-[^/]+\.md$/.test(f.path));
    if (input.engineVersionChanged || newAdr) return [];
    return [{
        rule: 'behaviour-change',
        waivable: false,
        message: `Characterization goldens changed (${changedGoldens.map(f => f.path).join(', ')}): engine behaviour changed. `
            + `Bump ENGINE_VERSION in ${ENGINE_VERSION_FILE} or add an ADR explaining the change.`,
    }];
}

export function adrProblems(adrs: { name: string; content: string }[]): string[] {
    const problems: string[] = [];
    const numbered = adrs.filter(a => a.name !== 'TEMPLATE.md');
    const numbers: number[] = [];
    for (const adr of numbered) {
        const m = /^(\d{4})-[a-z0-9-]+\.md$/.exec(adr.name);
        if (!m) {
            problems.push(`${adr.name}: name must be NNNN-short-title.md`);
            continue;
        }
        const n = Number(m[1]);
        numbers.push(n);
        const title = /^#\s+(\d+)\.\s+\S/.exec(adr.content.trimStart());
        if (!title) problems.push(`${adr.name}: first line must be "# ${n}. Title"`);
        else if (Number(title[1]) !== n) problems.push(`${adr.name}: title number ${title[1]} does not match the file number ${n}`);
        if (!/^\*\*Status:\*\*\s*\S/m.test(adr.content)) problems.push(`${adr.name}: missing "**Status:** ..."`);
        if (!/^\*\*Date:\*\*\s*\d{4}-\d{2}-\d{2}/m.test(adr.content)) problems.push(`${adr.name}: missing "**Date:** YYYY-MM-DD"`);
    }
    const seen = new Set<number>();
    for (const n of numbers) {
        if (seen.has(n)) problems.push(`ADR number ${n} is used twice`);
        seen.add(n);
    }
    const unique = [...seen].sort((a, b) => a - b);
    const gap = unique.findIndex((n, i) => n !== i + 1);
    if (gap >= 0) problems.push(`ADR numbers must be contiguous from 1: expected ${gap + 1}, found ${unique[gap]}`);
    return problems;
}

function unmappedCode(input: CheckInput): Violation[] {
    const exempt = input.map.unmapped.map(u => u.path);
    const gaps = input.sourceDirs
        .filter(({ dir, files }) => !matches(dir, exempt) && !files.some(f => input.map.rules.some(r => matches(f, r.paths))))
        .map(({ dir }) => dir);
    return gaps.map(dir => ({
        rule: 'unmapped-code' as const,
        waivable: false,
        message: `${dir} has no rule in docs/doc-map.json. Add a rule naming the pages that describe it, `
            + 'or list it under "unmapped" with a reason.',
    }));
}

/** Every violation of the contract in this change, waivers applied. */
export function checkDocs(input: CheckInput): Violation[] {
    const touched = new Set(input.changed.map(f => f.path));
    const docsWaived = findWaiver(input.messages, 'docs') !== null;
    const changelogWaived = findWaiver(input.messages, 'changelog') !== null;
    return [
        ...(docsWaived ? [] : mappedDocs(input, touched)),
        ...(changelogWaived ? [] : changelog(input, touched)),
        ...behaviourChange(input),
        ...adrProblems(input.adrs).map(message => ({ rule: 'adr-format' as const, waivable: false, message })),
        ...unmappedCode(input),
    ];
}
