import { describe, it, expect } from 'vitest';
import { checkDocs, globToRegExp, matches, findWaiver, adrProblems } from '../../scripts/lib/docs-check-core';
import type { CheckInput, ChangedFile, DocMap } from '../../scripts/lib/docs-check-core';

/** The documentation contract (docs/adr/0007-documentation-system.md), rule by rule. */

const map: DocMap = {
    docOnly: ['website/**', 'docs/**', '**/*.md'],
    goldens: ['tests/**/__snapshots__/**'],
    sourceRoots: ['src/*'],
    unmapped: [{ path: 'tests/*', reason: 'self-documenting' }],
    rules: [
        { name: 'Engine', paths: ['packages/engine/src/**'], docs: ['website/src/content/docs/reference/rules.md', 'website/src/content/docs/reference/frame-timing.md'] },
        { name: 'Menus', paths: ['src/screens/**', '!src/screens/Community.tsx'], docs: ['website/src/content/docs/architecture/client-platform.md'] },
    ],
};

const adr = (n: number, extra = '') => ({
    name: `${String(n).padStart(4, '0')}-a-decision.md`,
    content: `# ${n}. A decision\n\n**Status:** Accepted\n**Date:** 2026-09-25\n${extra}`,
});

function input(changed: Partial<ChangedFile>[], over: Partial<CheckInput> = {}): CheckInput {
    return {
        changed: changed.map(c => ({ status: 'M', deletedLines: 0, path: '', ...c })),
        map,
        messages: '',
        adrs: [adr(1), adr(2)],
        engineVersionChanged: false,
        sourceDirs: [],
        ...over,
    };
}

const rulesOf = (i: CheckInput) => checkDocs(i).map(v => v.rule);

describe('globs', () => {
    it('match within and across directories', () => {
        expect(globToRegExp('src/*.ts').test('src/a.ts')).toBe(true);
        expect(globToRegExp('src/*.ts').test('src/x/a.ts')).toBe(false);
        expect(globToRegExp('src/**').test('src/x/y/a.ts')).toBe(true);
        expect(globToRegExp('src/**').test('src')).toBe(true);
        expect(globToRegExp('**/*.md').test('README.md')).toBe(true);
        expect(globToRegExp('**/*.md').test('api/docs/a.md')).toBe(true);
        expect(globToRegExp('**/Dockerfile').test('server/Dockerfile')).toBe(true);
        expect(globToRegExp('a.b').test('axb')).toBe(false);
    });

    it('honour exclusions', () => {
        expect(matches('src/screens/Settings.tsx', map.rules[1].paths)).toBe(true);
        expect(matches('src/screens/Community.tsx', map.rules[1].paths)).toBe(false);
    });
});

describe('mapped docs', () => {
    it('fail when mapped code changes without any of its pages', () => {
        const v = checkDocs(input([{ path: 'packages/engine/src/GameEngine.ts' }, { path: 'CHANGELOG.md' }]));
        expect(v.map(x => x.rule)).toEqual(['mapped-docs']);
        expect(v[0].message).toContain('reference/rules.md');
        expect(v[0].waivable).toBe(true);
    });

    it('pass when one of the pages changed', () => {
        expect(rulesOf(input([
            { path: 'packages/engine/src/GameEngine.ts' },
            { path: 'website/src/content/docs/reference/frame-timing.md' },
            { path: 'CHANGELOG.md' },
        ]))).toEqual([]);
    });

    it('accept a waiver with a reason, and only with a reason', () => {
        const changed = [{ path: 'packages/engine/src/GameEngine.ts' }, { path: 'CHANGELOG.md' }];
        expect(rulesOf(input(changed, { messages: 'Docs-Impact: none - renames a private helper' }))).toEqual([]);
        expect(rulesOf(input(changed, { messages: 'Docs-Impact: none' }))).toEqual(['mapped-docs']);
        expect(rulesOf(input(changed, { messages: 'Docs-Impact: none - ' }))).toEqual(['mapped-docs']);
    });
});

describe('changelog', () => {
    it('is required for any code change', () => {
        expect(rulesOf(input([{ path: 'server/index.ts' }]))).toEqual(['changelog']);
    });

    it('is not required for documentation-only changes', () => {
        expect(rulesOf(input([{ path: 'website/src/content/docs/index.mdx' }, { path: 'README.md' }]))).toEqual([]);
    });

    it('can be waived with a reason', () => {
        expect(findWaiver('Title\n\nChangelog: skip - test-only refactor\n', 'changelog')).toBe('test-only refactor');
        expect(rulesOf(input([{ path: 'server/index.ts' }], { messages: 'Changelog: skip - CI tweak' }))).toEqual([]);
    });
});

describe('behaviour change', () => {
    const golden = { path: 'tests/engine/__snapshots__/characterization.test.ts.snap', deletedLines: 3 };

    it('fails when goldens lose lines without an ENGINE_VERSION bump or a new ADR, and cannot be waived', () => {
        const v = checkDocs(input([golden, { path: 'CHANGELOG.md' }], { messages: 'Docs-Impact: none - x\nChangelog: skip - y' }));
        expect(v.map(x => x.rule)).toEqual(['behaviour-change']);
        expect(v[0].waivable).toBe(false);
    });

    it('passes with an ENGINE_VERSION bump', () => {
        expect(rulesOf(input([golden, { path: 'CHANGELOG.md' }], { engineVersionChanged: true }))).toEqual([]);
    });

    it('passes with a new ADR', () => {
        expect(rulesOf(input([golden, { path: 'CHANGELOG.md' }, { path: 'docs/adr/0003-a-decision.md', status: 'A' }], { adrs: [adr(1), adr(2), adr(3)] }))).toEqual([]);
    });

    it('ignores goldens that only gained lines (a new test case)', () => {
        expect(rulesOf(input([{ ...golden, deletedLines: 0 }, { path: 'CHANGELOG.md' }]))).toEqual([]);
    });
});

describe('ADR format', () => {
    it('accepts well-formed, contiguous records and ignores the template', () => {
        expect(adrProblems([adr(1), adr(2), { name: 'TEMPLATE.md', content: 'anything' }])).toEqual([]);
    });

    it('reports a missing status, a bad title, a duplicate and a gap', () => {
        const problems = adrProblems([
            adr(1),
            { name: '0002-x.md', content: '# Two\n**Status:** Accepted\n**Date:** 2026-01-01' },
            { name: '0003-y.md', content: '# 3. Y\n**Date:** 2026-01-01' },
            { ...adr(3), name: '0003-z.md' },
            adr(5),
        ]);
        expect(problems.join('\n')).toMatch(/0002-x\.md: first line/);
        expect(problems.join('\n')).toMatch(/0003-y\.md: missing "\*\*Status/);
        expect(problems.join('\n')).toMatch(/used twice/);
        expect(problems.join('\n')).toMatch(/expected 4, found 5/);
    });
});

describe('unmapped code', () => {
    it('reports a source directory no rule covers', () => {
        const v = checkDocs(input([], { sourceDirs: [{ dir: 'src/newthing', files: ['src/newthing/a.ts'] }] }));
        expect(v.map(x => x.rule)).toEqual(['unmapped-code']);
    });

    it('accepts covered and exempt directories', () => {
        expect(rulesOf(input([], {
            sourceDirs: [
                { dir: 'src/screens', files: ['src/screens/Settings.tsx'] },
                { dir: 'tests/engine', files: ['tests/engine/a.test.ts'] },
            ],
        }))).toEqual([]);
    });
});
