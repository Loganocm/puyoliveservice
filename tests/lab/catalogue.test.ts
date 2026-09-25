import { describe, it, expect } from 'vitest';
import { ANIMATIONS, ANIMATION_IDS } from '../../src/lab/animations';
import { SCENARIOS } from '../../src/lab/scenarios';
import { runScenario, usesKeyboard } from '../../src/lab/run';
import { parseBoard, formatBoard } from '../../src/lab/board';

/**
 * The animation catalogue, checked.
 *
 * Every animated action the game can perform is listed in
 * src/lab/animations.ts, and every scenario in src/lab/scenarios.ts claims the
 * actions it demonstrates. This suite proves three things:
 *
 *   1. Each engine-driven scenario really does what it claims: its trace
 *      witnesses every action in `covers`, and its expectations hold.
 *   2. Together the scenarios cover the whole inventory and every reachable
 *      transition of the engine's state machine.
 *   3. Scenarios are deterministic, so their recorded videos are reproducible.
 *
 * Keyboard-driven and client-only actions are witnessed in a real browser by
 * the recorder (tests/lab/record-catalogue.mjs); here we check they are at
 * least claimed by a browser scenario.
 *
 * See website/src/content/docs/reference/animation-catalogue.md.
 */

const engineScenarios = SCENARIOS.filter(s => !s.browserOnly && !usesKeyboard(s));
const results = new Map(engineScenarios.map(s => [s.id, runScenario(s)]));
const engineAnimationIds = new Set(ANIMATIONS.filter(a => a.layer === 'engine').map(a => a.id));

/** Every transition the engine's state machine can make. */
const REACHABLE_TRANSITIONS = [
    'SPAWN>ACTIVE', 'SPAWN>GAMEOVER',
    'ACTIVE>FALLING', 'ACTIVE>GAMEOVER',
    'FALLING>CHECK_MATCH',
    'CHECK_MATCH>POP_ANIM', 'CHECK_MATCH>GARBAGE_FALL', 'CHECK_MATCH>SPAWN',
    'POP_ANIM>FALLING',
    'GARBAGE_FALL>FALLING',
];

/**
 * Transitions the code contains but that cannot happen. Listed so that if one
 * ever DOES happen, the coverage test fails and someone looks at why.
 *
 * GARBAGE_FALL>SPAWN: handleGarbageFall spawns when `amount <= 0`, but it is
 * only entered when garbageQueue > 0, so amount = min(queue, 24) is always
 * positive (ENG-05).
 */
const UNREACHABLE_TRANSITIONS = ['GARBAGE_FALL>SPAWN'];

describe('catalogue integrity', () => {
    it('has unique scenario ids', () => {
        const ids = SCENARIOS.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('only claims animations that exist', () => {
        for (const s of SCENARIOS) {
            for (const id of s.covers) expect(ANIMATION_IDS.has(id), `${s.id} claims unknown "${id}"`).toBe(true);
        }
    });

    it('parses every board', () => {
        for (const s of SCENARIOS) if (s.board) expect(() => parseBoard(s.board!)).not.toThrow();
    });
});

describe.each(engineScenarios.map(s => [s.id, s] as const))('scenario %s', (id, scenario) => {
    const r = results.get(id)!;

    it('witnesses every engine animation it claims', () => {
        const missing = scenario.covers.filter(c => engineAnimationIds.has(c) && !r.witnessed.includes(c));
        expect(missing, `not witnessed: ${missing.join(', ')}`).toEqual([]);
    });

    it('meets its expectations', () => {
        const e = scenario.expect;
        if (!e) return;
        if (e.finalState) expect(r.finalState).toBe(e.finalState);
        if (e.maxChain !== undefined) expect(r.engine.stats.maxChain).toBe(e.maxChain);
        if (e.garbageSent !== undefined) expect(r.engine.stats.garbageSent).toBe(e.garbageSent);
        if (e.board) expect(r.board).toEqual(formatBoard(parseBoard(e.board)));
    });

    it('is deterministic', () => {
        const again = runScenario(scenario);
        expect(JSON.stringify(again.trace)).toBe(JSON.stringify(r.trace));
    });
});

describe('catalogue coverage', () => {
    it('witnesses every engine-driven animation in at least one scenario', () => {
        const witnessed = new Set([...results.values()].flatMap(r => r.witnessed));
        const missing = [...engineAnimationIds].filter(id => !witnessed.has(id));
        expect(missing, `no scenario witnesses: ${missing.join(', ')}`).toEqual([]);
    });

    it('claims every client-side animation in a browser scenario', () => {
        const claimed = new Set(SCENARIOS.filter(s => s.browserOnly).flatMap(s => s.covers));
        const missing = ANIMATIONS.filter(a => a.layer === 'client' && a.id !== 'hud.x-marker' && !claimed.has(a.id)).map(a => a.id);
        expect(missing, `no browser scenario claims: ${missing.join(', ')}`).toEqual([]);
    });

    it('reaches every reachable state-machine transition', () => {
        const seen = new Set([...results.values()].flatMap(r => r.transitions));
        const missing = REACHABLE_TRANSITIONS.filter(t => !seen.has(t));
        expect(missing, `never reached: ${missing.join(', ')}`).toEqual([]);
    });

    it('never makes a transition believed unreachable, nor an unknown one', () => {
        const seen = new Set([...results.values()].flatMap(r => r.transitions));
        const unexpected = [...seen].filter(t => !REACHABLE_TRANSITIONS.includes(t));
        expect(unexpected).toEqual([]);
        for (const t of UNREACHABLE_TRANSITIONS) expect(seen.has(t)).toBe(false);
    });

    it('reports what it covered', () => {
        const witnessed = new Set([...results.values()].flatMap(r => r.witnessed));
        console.log(
            `[catalogue] ${SCENARIOS.length} scenarios (${engineScenarios.length} engine, ${SCENARIOS.length - engineScenarios.length} browser); ` +
            `${witnessed.size}/${engineAnimationIds.size} engine animations witnessed headless; ` +
            `${REACHABLE_TRANSITIONS.length}/${REACHABLE_TRANSITIONS.length} transitions reached`,
        );
    });
});
