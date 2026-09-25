#!/usr/bin/env node
// Generate the site's Decisions and Changelog pages from their canonical
// sources, so there is exactly one copy of each to maintain.
//
//   docs/adr/NNNN-*.md  ->  src/content/docs/decisions/NNNN-*.md  (+ index.md)
//   CHANGELOG.md        ->  src/content/docs/releases/changelog.md
//
// The outputs are gitignored. Never edit them; edit the sources.
//
// Links are rewritten so the same Markdown reads correctly on GitHub AND on the
// site:
//   ../../website/src/content/docs/<page>.md  -> /<page>/
//   website/src/content/docs/<page>.md        -> /<page>/
//   NNNN-slug.md / docs/adr/NNNN-slug.md      -> /decisions/NNNN-slug/
//   any other relative link                   -> the file on GitHub
//
// See docs/adr/0007-documentation-system.md.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const contentRoot = resolve(here, '..', 'src', 'content', 'docs');
const GITHUB_BLOB = 'https://github.com/Loganocm/puyoliveservice/blob/main/';

const ADR_FILE = /^(\d{4})-[a-z0-9-]+\.md$/;

/** YAML-safe double-quoted scalar. */
const yamlString = (s) => JSON.stringify(s);

/**
 * Rewrite one Markdown link target. `fromDir` is the source file's directory
 * relative to the repo root (posix), used to resolve relative targets.
 */
function rewriteTarget(target, fromDir) {
  if (/^[a-z]+:/i.test(target) || target.startsWith('#') || target.startsWith('/')) return target;
  const [pathPart, hash = ''] = target.split('#');
  const anchor = hash ? `#${hash}` : '';
  const repoPath = posix.normalize(posix.join(fromDir, pathPart));

  const sitePage = repoPath.match(/^website\/src\/content\/docs\/(.+?)(?:\/index)?\.mdx?$/);
  if (sitePage) return `/${sitePage[1]}/${anchor}`;

  const adr = repoPath.match(/^docs\/adr\/(\d{4}-[a-z0-9-]+)\.md$/);
  if (adr) return `/decisions/${adr[1]}/${anchor}`;

  return `${GITHUB_BLOB}${repoPath}${anchor}`;
}

function rewriteLinks(markdown, fromDir) {
  // Inline links: [text](target) -- leaves images and code spans alone well
  // enough for this repository's docs, which do not nest brackets in links.
  return markdown.replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text, target) => `[${text}](${rewriteTarget(target, fromDir)})`);
}

function syncAdrs() {
  const srcDir = join(repoRoot, 'docs', 'adr');
  const outDir = join(contentRoot, 'decisions');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const rows = [];
  for (const file of readdirSync(srcDir).sort()) {
    const m = file.match(ADR_FILE);
    if (!m) continue;
    const number = m[1];
    const raw = readFileSync(join(srcDir, file), 'utf8');

    const h1 = raw.match(/^#\s+(?:\d+\.\s*)?(.+)$/m);
    if (!h1) throw new Error(`${file}: missing "# N. Title" heading`);
    const title = h1[1].trim();
    const status = raw.match(/^\*\*Status:\*\*\s*(.+)$/m)?.[1].trim() ?? 'Unknown';
    const date = raw.match(/^\*\*Date:\*\*\s*(.+)$/m)?.[1].trim() ?? '';

    const body = rewriteLinks(raw.replace(h1[0], '').trimStart(), 'docs/adr');
    const front = [
      '---',
      `title: ${yamlString(`ADR ${number}: ${title}`)}`,
      `description: ${yamlString(`Architecture decision record ${number} (${status}).`)}`,
      'sidebar:',
      `  label: ${yamlString(`${number} ${title}`)}`,
      `  order: ${Number(number)}`,
      'editUrl: ' + yamlString(`https://github.com/Loganocm/puyoliveservice/edit/main/docs/adr/${file}`),
      '---',
      '',
      ':::note[Generated page]',
      `This page is generated from [\`docs/adr/${file}\`](${GITHUB_BLOB}docs/adr/${file}). Edit the source, not this copy.`,
      ':::',
      '',
    ].join('\n');
    writeFileSync(join(outDir, file), front + body);
    rows.push({ number, title, status, date, slug: file.replace(/\.md$/, '') });
  }

  const table = rows
    .map((r) => `| [${r.number}](/decisions/${r.slug}/) | ${r.title} | ${r.status} | ${r.date} |`)
    .join('\n');
  writeFileSync(join(outDir, 'index.md'), [
    '---',
    'title: Decision records',
    'description: Every architecture decision record, generated from docs/adr/.',
    'sidebar:',
    '  label: All decisions',
    '  order: 0',
    '---',
    '',
    'An **architecture decision record** (ADR) captures one significant decision: the context that forced it, what was decided, and the consequences accepted. ADRs are immutable once accepted; a later ADR *supersedes* an earlier one rather than editing it. The format follows Michael Nygard\'s original proposal (2011).',
    '',
    'The canonical files live in [`docs/adr/`](' + GITHUB_BLOB + 'docs/adr/). This index is regenerated on every build, so it cannot drift. To write one, follow [Write an ADR](/guides/write-an-adr/).',
    '',
    '| ADR | Decision | Status | Date |',
    '|---|---|---|---|',
    table,
    '',
  ].join('\n'));
  return rows.length;
}

function syncChangelog() {
  const raw = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
  const body = rewriteLinks(raw.replace(/^#\s+.+$/m, '').trimStart(), '');
  const outDir = join(contentRoot, 'releases');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'changelog.md'), [
    '---',
    'title: Changelog',
    'description: Every notable change to Puyo Live, generated from CHANGELOG.md.',
    'editUrl: ' + yamlString('https://github.com/Loganocm/puyoliveservice/edit/main/CHANGELOG.md'),
    'tableOfContents:',
    '  maxHeadingLevel: 2',
    '---',
    '',
    ':::note[Generated page]',
    `This page is generated from [\`CHANGELOG.md\`](${GITHUB_BLOB}CHANGELOG.md). Edit the source, not this copy. Tagged releases publish the matching section as GitHub release notes.`,
    ':::',
    '',
    body,
  ].join('\n'));
}

const count = syncAdrs();
syncChangelog();
console.log(`[sync-content] ${count} ADRs and CHANGELOG.md synced into src/content/docs/`);
