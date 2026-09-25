#!/usr/bin/env node
// Record every screen and menu flow as a video with a screenshot per step, for
// the UI part of the animation catalogue (transitions, hovers, overlays).
//
//   node tests/lab/record-screens.mjs --label baseline [--phone] [--only menu,settings]
//
// Needs the client and the API running (menus call the API). Output:
// artifacts/screens/<label>/<flow>.webm, <flow>/NN-step.png, index.json.

import { chromium, devices } from 'playwright';
import { mkdirSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
}, []));
const base = (args.base || 'http://localhost:5173').replace(/\/$/, '');
const phone = args.phone === 'true';
const label = args.label || 'screens';
const only = args.only ? new Set(args.only.split(',')) : null;
const out = resolve(args.out || join('artifacts', 'screens', label + (phone ? '-phone' : '')));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const device = phone ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** Each flow: a name and steps. A step is [label, async page => void]. */
const click = re => async page => { await page.getByText(re).first().click({ timeout: 5000 }); };
const hover = re => async page => { await page.getByText(re).first().hover({ timeout: 5000 }); };
const key = k => async page => { await page.keyboard.down(k); await page.waitForTimeout(150); await page.keyboard.up(k); };
const wait = ms => async page => { await page.waitForTimeout(ms); };
const toMenu = [['guest', click(/Play as Guest/i)], ['transition', wait(900)], ['menu', wait(2600)]];
const back = async page => {
    const b = page.getByText(/^back$/i).first();
    if (await b.isVisible().catch(() => false)) await b.click(); else await key('Escape')(page);
};

const FLOWS = [
    ['onboarding', [
        ['load', wait(800)],
        ['focus-username', async p => { await p.getByPlaceholder(/Username/i).click(); }],
        ['type-username', async p => { await p.keyboard.type('lab_tester', { delay: 60 }); }],
        ['clear-username', async p => { await p.getByPlaceholder(/Username/i).fill(''); }],
        ['hover-guest', hover(/Play as Guest/i)],
        ...toMenu,
    ]],
    ['menu', [
        ...toMenu,
        ['hover-single', hover(/^Single Player$/)],
        ['hover-multi', hover(/^Multiplayer$/)],
        ['hover-leaderboard', hover(/^Leaderboard$/)],
        ['hover-settings', hover(/^Settings$/)],
        ['hover-community', hover(/COMMUNITY/)],
        ['keyboard-down', key('ArrowDown')],
        ['keyboard-down-2', key('ArrowDown')],
    ]],
    ['single-player', [
        ...toMenu,
        ['open', click(/^Single Player$/)],
        ['hover-3min', hover(/3 MINUTES/)],
        ['start-practice', click(/PRACTICE/)],
        ['playing', wait(2500)],
        ['drop', key('Space')], ['drop-2', key('Space')], ['drop-3', key('Space')],
        ['pause', key('Escape')],
        ['hover-restart', hover(/^RESTART$/)],
        ['restart', click(/^RESTART$/)],
        ['after-restart', wait(1500)],
        ['pause-again', key('Escape')],
        ['exit', click(/^EXIT$/)],
        ['back-at-menu', wait(1500)],
    ]],
    ['game-over-single', [
        ...toMenu,
        ['open', click(/^Single Player$/)],
        ['start-practice', click(/PRACTICE/)],
        ['stack-to-top', async p => { for (let i = 0; i < 9; i++) { await key('Space')(p); await p.waitForTimeout(450); } }],
        ['game-over', wait(2500)],
    ]],
    ['settings', [
        ...toMenu,
        ['open', click(/^Settings$/)],
        ['drag-das', async p => {
            const slider = p.locator('input[type=range]').first();
            if (await slider.count()) { await slider.focus(); for (let i = 0; i < 5; i++) await key('ArrowLeft')(p); }
        }],
        ['effects-tab', click(/^(EFFECTS|AUDIO & FX)$/)],
        // Added in 0.3.0; absent from earlier builds (the step then warns).
        ['display-tab', click(/^DISPLAY$/)],
        ['controls', click(/^CONTROLS$/)],
        ['controls-back', back],
        ['settings-back', back],
    ]],
    ['leaderboard', [...toMenu, ['open', click(/^Leaderboard$/)], ['loaded', wait(1200)], ['back', back]]],
    ['community', [
        ...toMenu,
        ['open', click(/COMMUNITY/)],
        ['rankings', click(/^Rankings$/)],
        ['players', click(/^Players$/)],
        ['activity', click(/^Activity$/)],
        ['close', key('Escape')],
    ]],
    ['multiplayer-lobby', [
        ...toMenu,
        ['open', click(/^Multiplayer$/)],
        ['hover-unranked', hover(/^UNRANKED$/)],
        ['custom-game', click(/^CUSTOM GAME$/)],
        ['custom-game-open', wait(1000)],
        ['close', key('Escape')],
        ['back', back],
    ]],
    ['profile', [
        ...toMenu,
        ['open-menu', async p => {
            // 0.3.0 made the avatar a labelled button; before it was an unlabelled div (CLI-04).
            const labelled = p.getByRole('button', { name: 'Account menu' });
            if (await labelled.count()) await labelled.click({ timeout: 5000 });
            else await p.locator('div.cursor-pointer:has(svg.lucide-user)').first().click({ timeout: 5000 });
        }],
        ['open-profile', click(/^My Profile$/)],
        ['loaded', wait(1200)],
        ['close', key('Escape')],
    ]],
];

const index = [];
for (const [name, steps] of FLOWS.filter(([name]) => !only || only.has(name))) {
    const dir = join(out, name);
    mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ ...device, ignoreHTTPSErrors: true, recordVideo: { dir: out, size: device.viewport } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const shots = [];
    for (const [i, [stepName, fn]] of steps.entries()) {
        try { await fn(page); } catch (e) { problems.push(`${stepName}: ${e.message.split('\n')[0]}`); }
        await page.waitForTimeout(700);
        const file = `${String(i).padStart(2, '0')}-${stepName}.png`;
        await page.screenshot({ path: join(dir, file) });
        shots.push(`${name}/${file}`);
    }
    const v = page.video();
    await context.close();
    if (v) renameSync(await v.path(), join(out, `${name}.webm`));
    index.push({ flow: name, video: `${name}.webm`, shots, problems });
    console.log(`${problems.length ? 'WARN' : 'ok  '} ${name.padEnd(20)} ${shots.length} steps${problems.length ? '  ' + problems.join(' | ') : ''}`);
}
await browser.close();
writeFileSync(join(out, 'index.json'), JSON.stringify({ label, phone, recordedAt: new Date().toISOString(), flows: index }, null, 2));
console.log(`\nrecorded -> ${out}`);
