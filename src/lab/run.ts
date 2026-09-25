/**
 * Run a scenario headlessly: the engine alone, no renderer.
 *
 * Used by the catalogue tests, and by the browser lab to pick keyframes before
 * it plays the same scenario in the real scene.
 */

import { GameEngine, GameState } from '@puyolive/engine';
import { formatBoard } from './board';
import { LabSession, stateName, transitions, witnessed } from './session';
import type { TraceEvent } from './session';
import type { Scenario } from './scenarios';

export interface ScenarioResult {
    scenario: Scenario;
    engine: GameEngine;
    trace: TraceEvent[];
    finalState: string;
    board: string[];
    witnessed: string[];
    transitions: string[];
    /** Frames worth a still: mid-pop, mid-fall, landings, the end. */
    keyframes: number[];
}

/** True when a scenario is driven through the keyboard (browser only). */
export const usesKeyboard = (s: Scenario) => s.script.some(step => 'key' in step || 'tap' in step);

export function runScenario(scenario: Scenario): ScenarioResult {
    const engine = new GameEngine(scenario.seed);
    const session = new LabSession(scenario);
    session.attach(engine);
    while (!session.finished) {
        session.beforeStep(engine);
        engine.update();
        session.afterStep(engine);
        if (engine.state === GameState.GAMEOVER && session.frame > 0) {
            // Nothing moves after a top-out; stop early rather than spin.
            break;
        }
    }
    return {
        scenario,
        engine,
        trace: session.trace,
        finalState: stateName(engine.state),
        board: formatBoard(engine.board.grid),
        witnessed: witnessed(session.trace, engine),
        transitions: transitions(session.trace),
        keyframes: pickKeyframes(session.trace, scenario),
    };
}

/**
 * Choose up to 12 frames that show what a scenario is about: shortly after the
 * first spawn, each lock, the middle of each pop, each garbage drop, an all
 * clear, a top-out, and the scenario's own requests.
 */
export function pickKeyframes(trace: TraceEvent[], scenario: Scenario): number[] {
    const frames = new Set<number>(scenario.keyframes ?? []);
    for (const e of trace) {
        if (e.t === 'spawn' && e.piece === 1) frames.add(e.f + 3);
        else if (e.t === 'lock') frames.add(e.f + 1);
        else if (e.t === 'chainStep') frames.add(e.f + Math.max(2, Math.floor(e.duration / 2)));
        else if (e.t === 'garbageDrop') frames.add(e.f + 4);
        else if (e.t === 'split') frames.add(e.f + 2);
        else if (e.t === 'allClear') frames.add(e.f + 12);
        else if (e.t === 'state' && e.to === 'GAMEOVER') frames.add(e.f + 2);
        else if (e.t === 'input' && (e.effect === 'wallKick' || e.effect === 'floorKick' || e.effect === 'diagonalKick' || e.effect === 'rotateBlocked')) frames.add(e.f + 1);
    }
    return [...frames].filter(f => f > 0 && f <= scenario.frames).sort((a, b) => a - b).slice(0, 12);
}
