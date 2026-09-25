#!/usr/bin/env node
// Record the animation catalogue: one video and a set of exact keyframes per
// scenario, played in the real game at /?lab=<id>.
//
//   node tests/lab/record-catalogue.mjs --base http://localhost:5173 --label baseline
//   node tests/lab/record-catalogue.mjs --only chain-2,pop-single --label after
//
// Needs a running client (`npm run build && npx vite preview --port 5173`, or
// `npm run dev`). The lab makes no network calls, so no API or game server is
// needed.
//
// Output: artifacts/catalogue/<label>/
//   <id>.webm            the scenario, every logical frame rendered once
//   <id>/kf-<frame>.png  exact keyframes (the game is frozen while captured)
//   <id>/end.png         the final screen, overlays included
//   <id>/result.json     trace, witnessed animations, headless agreement
//   index.json           summary of every scenario
//   index.html           a browsable contact sheet
//
// The recorder FAILS (exit 1) if a scenario does not witness what it claims,
// or if the rendered run diverges from the headless run of the same scenario.
//
// See website/src/content/docs/reference/animation-catalogue.md.

import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
}, []));
const base = (args.base || 'http://localhost:5173').replace(/\/$/, '');
const label = args.label || 'catalogue';
const out = resolve(args.out || join('artifacts', 'catalogue', label));
const only = args.only ? new Set(args.only.split(',')) : null;
const viewport = { width: 1000, height: 900 };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

// Discover the catalogue from the page itself, so the recorder never drifts
// from src/lab/scenarios.ts.
const probe = await browser.newPage({ viewport });
await probe.goto(`${base}/?lab=spawn-fall-lock`);
await probe.waitForFunction(() => !!window.__puyoLab, null, { timeout: 30_000 });
const ids = (await probe.evaluate(() => window.__puyoLab.ids)).filter(id => !only || only.has(id));
await probe.close();

const summary = [];
let failures = 0;

for (const id of ids) {
    const dir = join(out, id);
    mkdirSync(dir, { recursive: true });
    // ignoreHTTPSErrors: sandboxed CI and dev containers often sit behind a
    // TLS-inspecting proxy that Chromium does not trust for third-party
    // requests (the web font). It has no effect on the game itself.
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, recordVideo: { dir: out, size: viewport } });
    const page = await context.newPage();
    const errors = [];
    const warnings = [];
    page.on('pageerror', e => errors.push(e.message));
    // Resource failures are attributed by URL: the game's own files must load,
    // but a third-party request failing (a web font behind a sandbox proxy) is
    // not the game's fault. The generic console line carries no URL, so it is
    // skipped here in favour of requestfailed.
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
    page.on('requestfailed', r => (r.url().startsWith(base) ? errors : warnings).push(`${r.url()}: ${r.failure()?.errorText}`));
    page.on('response', r => { if (r.status() >= 400) (r.url().startsWith(base) ? errors : warnings).push(`${r.url()}: HTTP ${r.status()}`); });

    const started = Date.now();
    await page.goto(`${base}/?lab=${id}`);
    await page.waitForFunction(() => !!window.__puyoLab, null, { timeout: 30_000 });
    const scenario = await page.evaluate(() => window.__puyoLab.scenario);

    const keyframes = [];
    let lastFrame = -1, lastProgress = Date.now(), pauseDone = false;
    const press = async key => { await page.keyboard.down(key); await page.waitForTimeout(100); await page.keyboard.up(key); };
    const clientSeen = async what => (await page.evaluate(() => window.__puyoLab.result().trace))
        .some(e => e.t === 'client' && e.what === what);
    for (;;) {
        const st = await page.evaluate(() => window.__puyoLab.status());
        if (scenario.recorder?.pauseAt !== undefined && !pauseDone && st.frame >= scenario.recorder.pauseAt) {
            // Pause, capture the overlay, resume: real key presses, like a player.
            pauseDone = true;
            await press('Escape');
            await page.waitForTimeout(600);
            if (!(await clientSeen('pauseOpen'))) errors.push('pause overlay did not open');
            await page.screenshot({ path: join(dir, 'paused.png') });
            keyframes.push({ frame: st.frame, file: `${id}/paused.png`, label: 'paused' });
            await press('Escape');
            await page.waitForTimeout(400);
            if (!(await clientSeen('pauseClose'))) errors.push('pause overlay did not close');
            lastProgress = Date.now();
            continue;
        }
        if (st.waitingAtKeyframe !== null) {
            const file = `kf-${String(st.waitingAtKeyframe).padStart(4, '0')}.png`;
            await page.screenshot({ path: join(dir, file) });
            keyframes.push({ frame: st.waitingAtKeyframe, file: `${id}/${file}` });
            await page.evaluate(() => window.__puyoLab.resume());
            lastProgress = Date.now();
            continue;
        }
        if (st.finished) break;
        if (st.frame !== lastFrame) { lastFrame = st.frame; lastProgress = Date.now(); }
        else if (Date.now() - lastProgress > 20_000) {
            errors.push(`stalled at frame ${st.frame}`);
            break;
        }
        await page.waitForTimeout(25);
    }
    // Let end-of-game overlays and trailing effects play into the video.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(dir, 'end.png') });

    const result = await page.evaluate(() => window.__puyoLab.result());
    writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
    const video = page.video();
    await context.close();
    const videoFile = `${id}.webm`;
    if (video) renameSync(await video.path(), join(out, videoFile));

    const ok = result.claimedMissing.length === 0 && result.matchesHeadless !== false && errors.length === 0;
    if (!ok) failures++;
    summary.push({
        id, title: scenario.title, notes: scenario.notes, covers: scenario.covers,
        witnessed: result.witnessed, claimedMissing: result.claimedMissing,
        matchesHeadless: result.matchesHeadless, firstMismatch: result.firstMismatch,
        frames: result.frames, maxChain: result.maxChain, score: result.score,
        video: videoFile, keyframes, end: `${id}/end.png`, errors, warnings,
        seconds: +((Date.now() - started) / 1000).toFixed(1), ok,
    });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(26)} frames=${String(result.frames).padStart(4)} keyframes=${keyframes.length} headless=${result.matchesHeadless ?? 'n/a'}${result.claimedMissing.length ? ` missing=${result.claimedMissing}` : ''}${errors.length ? ` errors=${errors.length}` : ''}`);
}
await browser.close();

writeFileSync(join(out, 'index.json'), JSON.stringify({ label, base, recordedAt: new Date().toISOString(), scenarios: summary }, null, 2));
writeFileSync(join(out, 'index.html'), contactSheet(label, summary));
console.log(`\n${summary.length - failures}/${summary.length} scenarios ok -> ${out}`);
if (!existsSync(join(out, 'index.html'))) failures++;
process.exit(failures ? 1 : 0);

function contactSheet(title, rows) {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<!doctype html><meta charset="utf-8"><title>Animation catalogue: ${esc(title)}</title>
<style>body{font:14px system-ui;background:#0d0f14;color:#e6e6e6;margin:24px}h1{font-size:20px}
section{border-top:1px solid #2a2e38;padding:16px 0}video{width:360px;border-radius:8px;background:#000}
.kf{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.kf figure{margin:0}.kf img{width:150px;border-radius:4px}
.kf figcaption{font-size:11px;color:#9aa}.bad{color:#ff6b6b}.tags{color:#9aa;font-size:12px}</style>
<h1>Animation catalogue: ${esc(title)}</h1>
${rows.map(r => `<section id="${esc(r.id)}"><h2>${esc(r.title)} <small class="tags">${esc(r.id)}</small> ${r.ok ? '' : '<span class="bad">FAILED</span>'}</h2>
<p>${esc(r.notes)}</p><p class="tags">covers: ${r.covers.map(esc).join(', ')}</p>
<video src="${esc(r.video)}" controls muted loop preload="metadata"></video>
<div class="kf">${r.keyframes.map(k => `<figure><img src="${esc(k.file)}" loading="lazy"><figcaption>${esc(k.label || 'frame ' + k.frame)}</figcaption></figure>`).join('')}
<figure><img src="${esc(r.end)}" loading="lazy"><figcaption>end</figcaption></figure></div></section>`).join('\n')}`;
}
