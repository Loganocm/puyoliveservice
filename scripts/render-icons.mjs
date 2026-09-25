#!/usr/bin/env node
// Render every raster icon (favicons, app icons) from the one vector mark,
// src/resources/brand/mark.svg, so they can never drift from it.
//
//   node scripts/render-icons.mjs
//
// Writes public/favicon.svg, favicon-96x96.png, favicon.ico (48 px),
// apple-touch-icon.png and the web-app-manifest icons, and copies the mark to
// the documentation site. Needs Playwright's Chromium; favicon.ico also needs
// ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg).

import { chromium } from 'playwright';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARK = 'src/resources/brand/mark.svg';
const svg = readFileSync(MARK, 'utf8');
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

/** `inset`: padding as a fraction of the size (maskable icons need ~20%). */
async function render(size, file, { bg = null, inset = 0 } = {}) {
    await page.setViewportSize({ width: size, height: size });
    const inner = size - Math.round(size * inset) * 2;
    await page.setContent(`<html><body style="margin:0;background:transparent">
        <div style="width:${size}px;height:${size}px;${bg ? `background:${bg};` : ''}display:flex;align-items:center;justify-content:center">
        <img src="${uri}" style="width:${inner}px;height:${inner}px"></div></body></html>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: file, omitBackground: !bg });
}

const ico = join(tmpdir(), 'puyolive-favicon-48.png');
await render(96, 'public/favicon-96x96.png');
await render(48, ico);
await render(180, 'public/apple-touch-icon.png', { bg: '#0B0E17', inset: 0.16 });
await render(192, 'public/web-app-manifest-192x192.png', { bg: '#0B0E17', inset: 0.22 });
await render(512, 'public/web-app-manifest-512x512.png', { bg: '#0B0E17', inset: 0.22 });
await browser.close();

execFileSync(process.env.FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-y', '-i', ico, 'public/favicon.ico']);
rmSync(ico);

for (const target of ['public/favicon.svg', 'website/public/favicon.svg', 'website/src/assets/logo.svg']) {
    copyFileSync(MARK, target);
}
console.log('icons rendered from', MARK);
