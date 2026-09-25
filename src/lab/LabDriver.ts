/**
 * The browser side of the lab: plays one catalogue scenario inside the real
 * GameScene, so what is recorded is exactly what players see.
 *
 * Open /?lab=<scenario-id>. The page skips onboarding and menus, builds a
 * single-player GameScene with this driver attached, and:
 *
 *   - steps the engine exactly one logical frame per rendered frame, so a
 *     video shows every frame and frame numbers mean the same as in the tests;
 *   - applies the scenario's inputs at their frames (engine scenarios), or
 *     dispatches real keyboard events through the real input layer (keyboard
 *     scenarios);
 *   - pauses on each keyframe until the recorder has taken its screenshot;
 *   - publishes its state on `window.__puyoLab` for the recorder.
 *
 * Nothing here runs unless the URL asks for it, and the module is loaded on
 * demand, so it costs normal players nothing.
 *
 * See website/src/content/docs/reference/animation-catalogue.md.
 */

import { GameState } from '@puyolive/engine';
import type { GameEngine } from '@puyolive/engine';
import { SCENARIO_BY_ID } from './scenarios';
import type { Scenario } from './scenarios';
import { LabSession, witnessed } from './session';
import type { TraceEvent } from './session';
import { runScenario, usesKeyboard } from './run';
import { ControlsManager } from '../core/ControlsManager';
import { SettingsManager } from '../core/SettingsManager';

/** What GameScene needs from a lab driver. */
export interface LabController {
    readonly drivesKeyboard: boolean;
    readonly timeLimit: number;
    attach(engine: GameEngine): void;
    /**
     * Called at the very top of GameScene.update. Delivers queued keyboard
     * events, the way real key events arrive between frames.
     */
    beginFrame(): void;
    /** Step one logical frame if not paused. Returns whether it stepped. */
    stepFrame(engine: GameEngine): boolean;
    /** Frames advance only while this is true. */
    readonly running: boolean;
    note(what: 'timeUp' | 'pauseOpen' | 'pauseClose'): void;
}

/** Events that exist only in the browser; everything else must match the headless run. */
const CLIENT_ONLY = new Set<TraceEvent['t']>(['client', 'clientMove', 'key', 'tap']);

export interface LabStatus {
    id: string;
    frame: number;
    frames: number;
    waitingAtKeyframe: number | null;
    keyframes: number[];
    finished: boolean;
}

export class LabDriver implements LabController {
    readonly drivesKeyboard: boolean;
    readonly timeLimit: number;
    readonly keyframes: number[];
    private session: LabSession;
    private engine: GameEngine | null = null;
    private waitingAt: number | null = null;
    private queuedKeys: { action: string; down: boolean }[] = [];
    /** Burned into recordings so every video frame says what and when it is. */
    private label: HTMLDivElement | null = null;
    private headlessTrace: TraceEvent[] | null;

    constructor(scenario: Scenario) {
        this.session = new LabSession(scenario);
        this.drivesKeyboard = usesKeyboard(scenario);
        this.timeLimit = scenario.timeLimit ?? 0;

        // The headless run of the same scenario gives the keyframes and the
        // trace the browser run must reproduce.
        if (this.drivesKeyboard) {
            this.headlessTrace = null;
            this.keyframes = [...(scenario.keyframes ?? [])].sort((a, b) => a - b);
        } else {
            const headless = runScenario(scenario);
            this.headlessTrace = headless.trace;
            this.keyframes = headless.keyframes;
        }

        // Handling the scene reads every frame. Set in memory only: never saved.
        SettingsManager.sdf = scenario.config?.sdf ?? 10;
        SettingsManager.softDropProtection = scenario.config?.softDropProtection ?? true;
        if (scenario.handling?.das !== undefined) SettingsManager.das = scenario.handling.das;
        if (scenario.handling?.arr !== undefined) SettingsManager.arr = scenario.handling.arr;
    }

    get scenario(): Scenario { return this.session.scenario; }
    get running(): boolean { return this.waitingAt === null && !this.session.finished; }

    attach(engine: GameEngine): void {
        this.engine = engine;
        this.session.attach(engine);
        this.session.note('xMarker');
        if (this.timeLimit > 0) this.session.note('timer');
    }

    beginFrame(): void {
        // Only on frames that will step: a key pressed while the recorder holds
        // a keyframe would be snapshotted as "already down" and its press lost.
        if (!this.running) return;
        for (const k of this.queuedKeys.splice(0)) {
            window.dispatchEvent(new KeyboardEvent(k.down ? 'keydown' : 'keyup', {
                code: ControlsManager.getKey(k.action as Parameters<typeof ControlsManager.getKey>[0]),
                bubbles: true,
            }));
        }
    }

    stepFrame(engine: GameEngine): boolean {
        if (!this.running) return false;
        this.session.beforeStep(engine);
        engine.update();
        // Keyboard steps due on this frame are delivered at the start of the
        // next one, before the scene reads input: a script's key step at frame
        // N is read by the input layer on frame N + 1.
        this.queuedKeys.push(...this.session.afterStep(engine));
        if (this.keyframes.includes(this.session.frame)) this.waitingAt = this.session.frame;
        this.updateLabel();
        return true;
    }

    private updateLabel(): void {
        if (!this.label) {
            this.label = document.createElement('div');
            this.label.setAttribute('data-lab-label', '');
            Object.assign(this.label.style, {
                position: 'fixed', left: '8px', top: '8px', zIndex: '1000', pointerEvents: 'none',
                font: '600 13px/1.4 ui-monospace, monospace', color: '#fff',
                background: 'rgba(0,0,0,0.65)', padding: '4px 8px', borderRadius: '4px',
            });
            document.body.appendChild(this.label);
        }
        this.label.textContent = `${this.scenario.id}  ·  frame ${this.session.frame} / ${this.scenario.frames}`;
    }

    note(what: 'timeUp' | 'pauseOpen' | 'pauseClose'): void {
        this.session.note(what);
    }

    /** Called by the recorder after it has captured the current keyframe. */
    resume(): void { this.waitingAt = null; }

    status(): LabStatus {
        return {
            id: this.scenario.id,
            frame: this.session.frame,
            frames: this.scenario.frames,
            waitingAtKeyframe: this.waitingAt,
            keyframes: this.keyframes,
            finished: this.session.finished || this.engine?.state === GameState.GAMEOVER,
        };
    }

    /** The outcome, including whether the rendered run matched the headless one. */
    result() {
        const engine = this.engine!;
        // A client rule (a timed mode running out) ends the game in the
        // browser, which the headless run cannot know about. What it causes,
        // such as the GAMEOVER transition, is the client's doing, so the
        // comparison stops there. Engine events of that frame come before it
        // in the trace, because the timer is checked after the engine steps.
        const trace = this.session.trace;
        const timeUp = trace.findIndex(e => e.t === 'client' && e.what === 'timeUp');
        const compared = timeUp >= 0 ? trace.slice(0, timeUp) : trace;
        const browserEngineTrace = compared.filter(e => !CLIENT_ONLY.has(e.t));
        let firstMismatch: number | null = null;
        if (this.headlessTrace) {
            // Compare only up to where the browser run stopped.
            const lastFrame = timeUp >= 0 ? trace[timeUp].f : this.session.frame;
            const headless = this.headlessTrace.filter(e => e.f <= lastFrame);
            const n = Math.max(headless.length, browserEngineTrace.length);
            for (let i = 0; i < n; i++) {
                if (JSON.stringify(headless[i]) !== JSON.stringify(browserEngineTrace[i])) { firstMismatch = i; break; }
            }
        }
        const claimedMissing = this.scenario.covers.filter(c => !witnessed(this.session.trace, engine).includes(c));
        return {
            id: this.scenario.id,
            frames: this.session.frame,
            witnessed: witnessed(this.session.trace, engine),
            claimedMissing,
            matchesHeadless: this.headlessTrace ? firstMismatch === null : null,
            firstMismatch: firstMismatch === null ? null : {
                index: firstMismatch,
                headless: this.headlessTrace?.[firstMismatch] ?? null,
                browser: browserEngineTrace[firstMismatch] ?? null,
            },
            score: engine.stats.score,
            maxChain: engine.stats.maxChain,
            trace: this.session.trace,
        };
    }
}

declare global {
    interface Window {
        __puyoLab?: {
            status(): LabStatus;
            resume(): void;
            result(): ReturnType<LabDriver['result']>;
            scenario: Scenario;
            ids: string[];
        };
    }
}

/** The scenario named in the URL, if any. */
export function labScenarioFromUrl(): Scenario | null {
    const id = new URLSearchParams(window.location.search).get('lab');
    if (!id) return null;
    return SCENARIO_BY_ID.get(id) ?? null;
}

/** Build the driver and publish it for the recorder. */
export function createLabDriver(scenario: Scenario): LabDriver {
    const driver = new LabDriver(scenario);
    window.__puyoLab = {
        status: () => driver.status(),
        resume: () => driver.resume(),
        result: () => driver.result(),
        scenario,
        ids: [...SCENARIO_BY_ID.keys()],
    };
    return driver;
}
