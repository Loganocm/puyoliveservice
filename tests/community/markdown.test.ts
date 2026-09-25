import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown, safeUrl } from '../../src/community/markdown';
import type { Inline } from '../../src/community/markdown';

/** Flatten to a compact string so expectations stay readable. */
function show(nodes: Inline[]): string {
    return nodes.map(n => {
        switch (n.t) {
            case 'text': return n.v;
            case 'br': return '⏎';
            case 'code': return `<code>${n.v}</code>`;
            case 'strong': return `<b>${show(n.c)}</b>`;
            case 'em': return `<i>${show(n.c)}</i>`;
            case 'link': return `<a ${n.href}>${show(n.c)}</a>`;
        }
    }).join('');
}

describe('forum Markdown subset', () => {
    it('keeps markup as text: the parser never produces HTML', () => {
        const nodes = parseInline('<img src=x onerror=alert(1)> <script>alert(1)</script>');
        expect(nodes).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)> <script>alert(1)</script>' }]);
    });

    it('formats bold, italic and code', () => {
        expect(show(parseInline('a **bold** and *it* and _it_ and `x*y*z`'))).toBe('a <b>bold</b> and <i>it</i> and <i>it</i> and <code>x*y*z</code>');
        expect(show(parseInline('**bold with *italic* inside**'))).toBe('<b>bold with <i>italic</i> inside</b>');
    });

    it('leaves unclosed or spaced markers alone', () => {
        expect(show(parseInline('2 * 3 * 4'))).toBe('2 * 3 * 4');
        expect(show(parseInline('**not closed'))).toBe('**not closed');
        expect(show(parseInline('snake_case_name'))).toBe('snake_case_name');
    });

    it('honours backslash escapes', () => {
        expect(show(parseInline('\\*not italic\\*'))).toBe('*not italic*');
    });

    it('links only http and https', () => {
        expect(show(parseInline('[guide](https://example.com/a?b=1)'))).toBe('<a https://example.com/a?b=1>guide</a>');
        expect(show(parseInline('[x](javascript:alert(1))'))).toBe('[x](javascript:alert(1))');
        expect(show(parseInline('[x](data:text/html,hi)'))).toBe('[x](data:text/html,hi)');
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('HTTPS://Example.com')).toBe('https://example.com/');
    });

    it('autolinks bare URLs without swallowing trailing punctuation', () => {
        expect(show(parseInline('see https://puyo.live/community.'))).toBe('see <a https://puyo.live/community>https://puyo.live/community</a>.');
        expect(show(parseInline('(https://a.io)'))).toBe('(<a https://a.io/>https://a.io</a>)');
    });

    it('splits paragraphs on blank lines and keeps single line breaks', () => {
        const blocks = parseMarkdown('one\ntwo\n\nthree');
        expect(blocks).toHaveLength(2);
        expect(blocks[0].t === 'p' && show(blocks[0].c)).toBe('one⏎two');
    });

    it('parses quotes, nested a few levels at most', () => {
        const blocks = parseMarkdown('> quoted **text**\n> more\n\nreply');
        expect(blocks[0].t).toBe('quote');
        const deep = parseMarkdown('> > > > > deep');
        let levels = 0;
        let b = deep[0];
        while (b.t === 'quote') { levels++; b = b.c[0]; }
        expect(levels).toBeLessThanOrEqual(3);
    });

    it('bounds nesting depth, so hostile input cannot recurse without limit', () => {
        const hostile = '**'.repeat(5000) + 'x' + '**'.repeat(5000);
        expect(() => parseInline(hostile)).not.toThrow();
    });
});
