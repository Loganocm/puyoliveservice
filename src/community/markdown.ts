/**
 * The Markdown subset forum posts are written in, parsed to a tree.
 *
 * Supported: paragraphs, line breaks, > quotes, **bold**, *italic* or
 * _italic_, `code`, [text](https://...) and bare http(s) links, and
 * backslash escapes. Nothing else: no HTML, no images, no headings.
 *
 * The parser returns data, never HTML. The renderer (Markdown.tsx) turns it
 * into React elements, so user text is always a text node and can never
 * become markup. Only http and https URLs become links.
 * Specified in website/src/content/docs/architecture/community.md.
 */

export type Inline =
    | { t: 'text'; v: string }
    | { t: 'strong'; c: Inline[] }
    | { t: 'em'; c: Inline[] }
    | { t: 'code'; v: string }
    | { t: 'link'; href: string; c: Inline[] }
    | { t: 'br' };

export type Block =
    | { t: 'p'; c: Inline[] }
    | { t: 'quote'; c: Block[] };

const MAX_DEPTH = 4;
const ESCAPABLE = '\\`*_[]()>';

/** An http(s) URL the browser will treat as that, or null. */
export function safeUrl(raw: string): string | null {
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** The index of the delimiter closing an emphasis opened just before `from`, or -1. */
function closing(src: string, from: number, ch: '*' | '_'): number {
    for (let k = from + 1; k < src.length; k++) {
        if (src[k] === '\\') { k++; continue; }
        if (src[k] === '`') {
            const end = src.indexOf('`', k + 1);
            if (end > k) { k = end; continue; }
        }
        if (src[k] !== ch || src[k - 1] === ' ') continue;
        if (ch === '*' && (src[k + 1] === '*' || src[k - 1] === '*')) continue;
        if (ch === '_' && isWord(src[k + 1])) continue;
        return k;
    }
    return -1;
}

export function parseInline(src: string, depth = 0): Inline[] {
    const out: Inline[] = [];
    let text = '';
    const flush = () => { if (text) { out.push({ t: 'text', v: text }); text = ''; } };
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
            text += src[i + 1];
            i += 2;
            continue;
        }
        if (ch === '`') {
            const end = src.indexOf('`', i + 1);
            if (end > i + 1) {
                flush();
                out.push({ t: 'code', v: src.slice(i + 1, end) });
                i = end + 1;
                continue;
            }
        }
        if (depth < MAX_DEPTH && src.startsWith('**', i) && src[i + 2] && src[i + 2] !== ' ') {
            const end = src.indexOf('**', i + 3);
            if (end > i + 2 && src[end - 1] !== ' ') {
                flush();
                out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), depth + 1) });
                i = end + 2;
                continue;
            }
        }
        if (depth < MAX_DEPTH && (ch === '*' || ch === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== ch
            && (ch === '*' || !isWord(src[i - 1]))) {
            const end = closing(src, i, ch);
            if (end > i + 1) {
                flush();
                out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), depth + 1) });
                i = end + 1;
                continue;
            }
        }
        if (ch === '[') {
            const m = /^\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/.exec(src.slice(i));
            const href = m && safeUrl(m[2]);
            if (m && href) {
                flush();
                out.push({ t: 'link', href, c: parseInline(m[1], MAX_DEPTH) });
                i += m[0].length;
                continue;
            }
        }
        if (ch === 'h' && (i === 0 || /[\s(]/.test(src[i - 1]))) {
            const m = /^https?:\/\/[^\s<>()[\]]+/.exec(src.slice(i));
            if (m) {
                const raw = m[0].replace(/[.,;:!?'"]+$/, '');
                const href = safeUrl(raw);
                if (href) {
                    flush();
                    out.push({ t: 'link', href, c: [{ t: 'text', v: raw }] });
                    i += raw.length;
                    continue;
                }
            }
        }
        text += ch;
        i++;
    }
    flush();
    return out;
}

function paragraph(lines: string[]): Block {
    const c: Inline[] = [];
    lines.forEach((line, n) => {
        if (n > 0) c.push({ t: 'br' });
        c.push(...parseInline(line));
    });
    return { t: 'p', c };
}

export function parseMarkdown(src: string, depth = 0): Block[] {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let para: string[] = [];
    let quote: string[] = [];
    const endPara = () => { if (para.length) { blocks.push(paragraph(para)); para = []; } };
    const endQuote = () => {
        if (quote.length) {
            blocks.push(depth < 3 ? { t: 'quote', c: parseMarkdown(quote.join('\n'), depth + 1) } : paragraph(quote));
            quote = [];
        }
    };
    for (const line of lines) {
        const q = /^ {0,3}>\s?(.*)$/.exec(line);
        if (q) {
            endPara();
            quote.push(q[1]);
        } else if (line.trim() === '') {
            endPara();
            endQuote();
        } else {
            endQuote();
            para.push(line);
        }
    }
    endPara();
    endQuote();
    return blocks;
}
