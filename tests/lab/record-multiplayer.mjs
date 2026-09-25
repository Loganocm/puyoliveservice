#!/usr/bin/env node
// Record a real 1v1 match between two browser clients, for the multiplayer part
// of the animation catalogue: matchmaking, the VS screen, the simulated
// opponent board, incoming-garbage warnings, attack and offset text, the
// opponent's garbage icons, and the win and lose screens.
//
// Needs the client, the game server and the API running, the game server with
// a fixed dev seed so the match is reproducible:
//
//   DEV_FIXED_SEED=4242 npm run server
//   npm run build:engine   # the bot plans with the built engine
//   node tests/lab/record-multiplayer.mjs --label baseline
//
// Output: artifacts/multiplayer/<label>/{alice,bob}.webm, screenshots, index.json.
//
// Player "alice" plays to attack; "bob" plays to survive. Both are the bot in
// tests/lab/bot.mjs pressing real keys, so everything goes through the real
// input layer, network and opponent simulation.

import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { plan, keysFor } from './bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
}, []));
const base = (args.base || 'http://localhost:5173').replace(/\/$/, '');
const label = args.label || 'multiplayer';
const out = resolve(args.out || join('artifacts', 'multiplayer', label));
const maxSeconds = Number(args.seconds || 240);
// Smaller than the catalogue's viewport: two software-rendered clients must
// keep up with a real-time shared clock.
const viewport = { width: 800, height: 720 };
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// One browser process per player, so software rendering uses two cores and
// neither player's frame rate starves the other's.
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const browsers = [];
const shots = [];
const events = [];
const log = (who, what) => { const e = { t: +((Date.now() - t0) / 1000).toFixed(1), who, what }; events.push(e); console.log(`${String(e.t).padStart(6)}s ${who.padEnd(5)} ${what}`); };
const t0 = Date.now();

async function player(name) {
    const browser = await launch();
    browsers.push(browser);
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, recordVideo: { dir: out, size: viewport } });
    const page = await context.newPage();
    page.on('pageerror', e => log(name, `pageerror: ${e.message}`));
    await page.goto(`${base}/?e2e=1`);
    return { name, context, page };
}
const shot = async (p, tag) => {
    const file = `${p.name}-${String(shots.length).padStart(2, '0')}-${tag}.png`;
    await p.page.screenshot({ path: join(out, file) });
    shots.push({ who: p.name, tag, file, t: +((Date.now() - t0) / 1000).toFixed(1) });
};
const press = async (page, key, hold = 220) => { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); await page.waitForTimeout(160); };

const alice = await player('alice');
const bob = await player('bob');

// Onboarding -> menu -> multiplayer -> unranked queue.
for (const p of [alice, bob]) {
    await p.page.getByText(/Play as Guest/i).first().click();
}
await alice.page.waitForTimeout(3500);
for (const p of [alice, bob]) {
    await p.page.getByText(/^Multiplayer$/).first().click();
    await p.page.waitForTimeout(1200);
}
await shot(alice, 'lobby');
for (const p of [alice, bob]) {
    await p.page.getByText(/^UNRANKED$/).first().click();
    await p.page.waitForTimeout(500);
}
log('both', 'queued');
await shot(alice, 'searching');
await alice.page.waitForTimeout(1500);
await shot(alice, 'vs-screen');
await shot(bob, 'vs-screen');

// Wait for both games to start.
for (const p of [alice, bob]) {
    await p.page.waitForFunction(() => window.__puyoGame?.roomId && window.__puyoGame.engine.currentFrame > 0, null, { timeout: 30_000 });
}
log('both', 'match started');
await shot(alice, 'start');

const state = page => page.evaluate(() => {
    const g = window.__puyoGame; if (!g) return null;
    const e = g.engine;
    return {
        state: e.state, frame: e.currentFrame,
        piece: e.activePiece && { mainColor: e.activePiece.mainColor, subColor: e.activePiece.subColor, x: e.activePiece.x, y: e.activePiece.y },
        next: e.nextPieces[0] && { mainColor: e.nextPieces[0].mainColor, subColor: e.nextPieces[0].subColor },
        spawns: g.spawns,
        grid: e.board.grid.map(c => [...c]), sent: e.stats.garbageSent, received: e.stats.garbageReceived,
        maxChain: e.stats.maxChain, message: g.message, opponentGarbage: g.opponentGarbage,
    };
});

const milestones = { alice: new Set(), bob: new Set() };
async function play(p, objective) {
    let actedOn = 0;
    while ((Date.now() - t0) / 1000 < maxSeconds) {
        const s = await state(p.page);
        if (!s) { await p.page.waitForTimeout(200); continue; }
        // "RECONNECTING..." is the desync warning, not an ending; only a top-out
        // or a result message ends the match.
        if (s.state === 6 || /WIN|LOST|LEFT|ABORT|EXPIRED|DISCONNECTED/i.test(s.message)) {
            log(p.name, `game over: ${s.message || 'top-out'}`);
            return s;
        }
        if (s.message && !milestones[p.name].has('desync')) { milestones[p.name].add('desync'); log(p.name, `message: ${s.message}`); await shot(p, 'desync-warning'); }
        const m = milestones[p.name];
        if (s.sent > 0 && !m.has('sent')) { m.add('sent'); log(p.name, `first attack (${s.sent} garbage)`); await shot(p, 'first-attack'); }
        if (s.received > 0 && !m.has('received')) { m.add('received'); log(p.name, `first garbage received (${s.received})`); await shot(p, 'garbage-incoming'); }
        if (s.opponentGarbage > 0 && !m.has('icons')) { m.add('icons'); log(p.name, `opponent garbage icons (${s.opponentGarbage})`); await shot(p, 'opponent-garbage-icons'); }
        if (s.maxChain >= 2 && !m.has('chain')) { m.add('chain'); log(p.name, `chain ${s.maxChain}`); await shot(p, `chain-${s.maxChain}`); }
        // Act once per piece, identified by the spawn counter: after a hard drop
        // the next piece appears within a few frames, too fast to poll for.
        if (s.piece && s.spawns > actedOn) {
            actedOn = s.spawns;
            const choice = plan(s.grid, { mainColor: s.piece.mainColor, subColor: s.piece.subColor }, s.next, objective);
            if (choice) for (const key of keysFor(choice)) await press(p.page, key);
        }
        await p.page.waitForTimeout(120);
    }
    log(p.name, 'time limit reached');
    return state(p.page);
}

const [aEnd, bEnd] = await Promise.all([play(alice, 'attack'), play(bob, 'survive')]);
await alice.page.waitForTimeout(2500);
await shot(alice, 'end'); await shot(bob, 'end');
await alice.page.waitForTimeout(1500);

const videos = {};
for (const p of [alice, bob]) {
    const v = p.page.video();
    await p.context.close();
    if (v) { renameSync(await v.path(), join(out, `${p.name}.webm`)); videos[p.name] = `${p.name}.webm`; }
}
for (const b of browsers) await b.close();

writeFileSync(join(out, 'index.json'), JSON.stringify({
    label, recordedAt: new Date().toISOString(), seconds: +((Date.now() - t0) / 1000).toFixed(1),
    alice: aEnd && { sent: aEnd.sent, received: aEnd.received, maxChain: aEnd.maxChain, message: aEnd.message },
    bob: bEnd && { sent: bEnd.sent, received: bEnd.received, maxChain: bEnd.maxChain, message: bEnd.message },
    videos, shots, events,
}, null, 2));
console.log(`\nrecorded -> ${out}`);
