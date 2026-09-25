// @ts-check
//
// The Puyo Live documentation site.
//
// Content lives in src/content/docs/. Two sections are GENERATED at build time
// from their canonical homes elsewhere in the repository, so they can never
// drift from the source:
//
//   docs/adr/*.md   -> src/content/docs/decisions/   (scripts/sync-content.mjs)
//   CHANGELOG.md    -> src/content/docs/releases/changelog.md
//
// Internal links are validated on every build (starlight-links-validator), so
// a renamed page breaks CI rather than a reader's click. /llms.txt is generated
// for AI tools (starlight-llms-txt).
//
// See docs/adr/0007-documentation-system.md.

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import mermaid from 'astro-mermaid';

// Deployed at the root of its own host (see .github/workflows/docs.yml), so no
// `base` path is needed and every internal link is an absolute /path/.
const site = process.env.DOCS_SITE_URL || 'https://docs.puyo.live';

export default defineConfig({
  site,
  integrations: [
    // Must come before Starlight so it sees ```mermaid blocks first.
    mermaid({ autoTheme: true }),
    starlight({
      title: 'Puyo Live',
      description:
        'Engineering handbook for Puyo Live: architecture, game rules, the 2026 review, the modernization roadmap and every decision record.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Loganocm/puyoliveservice' },
      ],
      editLink: {
        baseUrl: 'https://github.com/Loganocm/puyoliveservice/edit/main/website/',
      },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      plugins: [
        starlightLinksValidator({
          // Generated ADR pages link to repository files (../../src/...), which
          // are not site pages. Everything else must resolve.
          exclude: ['https://github.com/**'],
        }),
        starlightLlmsTxt({
          projectName: 'Puyo Live',
          details:
            'Puyo Live is a competitive browser Puyo game: a deterministic TypeScript engine shared by client and server, a Socket.IO game server and an Express/Prisma API. Start with /start/project-tour/ for orientation, /reference/ for exact behaviour, /review/ for known problems and /roadmap/ for planned work.',
        }),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { slug: 'start/getting-started' },
            { slug: 'start/project-tour' },
            { slug: 'start/documentation-system' },
          ],
        },
        {
          label: '2026 Review',
          items: [
            { slug: 'review' },
            { slug: 'review/findings' },
            { slug: 'review/rules-fidelity' },
            { slug: 'review/engine' },
            { slug: 'review/netcode-and-integrity' },
            { slug: 'review/client' },
            { slug: 'review/backend-and-security' },
            { slug: 'review/operations' },
            { slug: 'review/quality-and-testing' },
            { slug: 'review/legal-and-ip' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { slug: 'architecture/current' },
            { slug: 'architecture/target' },
            { slug: 'architecture/engine-v2' },
            { slug: 'architecture/netcode' },
            { slug: 'architecture/rating-and-matchmaking' },
            { slug: 'architecture/client-platform' },
            { slug: 'architecture/platform' },
          ],
        },
        {
          label: 'Roadmap',
          items: [
            { slug: 'roadmap' },
            { slug: 'roadmap/business' },
            { slug: 'roadmap/risks' },
          ],
        },
        {
          label: 'How-to guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'Decisions (ADRs)',
          collapsed: true,
          autogenerate: { directory: 'decisions' },
        },
        {
          label: 'Releases',
          items: [{ slug: 'releases/changelog' }],
        },
      ],
    }),
  ],
});
