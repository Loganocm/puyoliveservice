/**
 * Personal bests for single player, per mode, kept on this device.
 *
 * Shown on the results screen ("new best") and on the mode picker, and the
 * last mode played is remembered so it can be offered first. Plain local
 * storage: single-player scores are not submitted to the server.
 */

export type SoloMode = 'practice' | '3min' | '5min' | '10min';

export interface SoloRecord {
    score: number;
    maxChain: number;
    puyosCleared: number;
    /** ISO date of the game that set the score. */
    at: string;
}

export interface SoloResult {
    score: number;
    maxChain: number;
    puyosCleared: number;
}

export interface Submission {
    /** The record after this game. */
    best: SoloRecord;
    /** The record before it, or null for the first game in this mode. */
    previous: SoloRecord | null;
    newBestScore: boolean;
    newBestChain: boolean;
}

interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const KEY = 'puyolive_solo_bests';
const LAST_KEY = 'puyolive_last_solo_mode';
const MODES: readonly SoloMode[] = ['practice', '3min', '5min', '10min'];

/** The mode for a time limit in seconds (0 is practice). */
export function modeForTimeLimit(seconds: number): SoloMode {
    if (seconds === 180) return '3min';
    if (seconds === 300) return '5min';
    if (seconds === 600) return '10min';
    return 'practice';
}

function defaultStore(): KeyValueStore | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

export class PersonalBests {
    private readonly store: KeyValueStore | null;

    constructor(store: KeyValueStore | null = defaultStore()) {
        this.store = store;
    }

    all(): Partial<Record<SoloMode, SoloRecord>> {
        try {
            const parsed = JSON.parse(this.store?.getItem(KEY) ?? '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    get(mode: SoloMode): SoloRecord | null {
        return this.all()[mode] ?? null;
    }

    /** Record a finished game. Best score and best chain are kept independently. */
    submit(mode: SoloMode, result: SoloResult, now: Date = new Date()): Submission {
        const records = this.all();
        const previous = records[mode] ?? null;
        const newBestScore = !previous || result.score > previous.score;
        const newBestChain = !previous || result.maxChain > previous.maxChain;
        const best: SoloRecord = {
            score: newBestScore ? result.score : previous!.score,
            puyosCleared: newBestScore ? result.puyosCleared : previous!.puyosCleared,
            at: newBestScore ? now.toISOString() : previous!.at,
            maxChain: Math.max(result.maxChain, previous?.maxChain ?? 0),
        };
        records[mode] = best;
        try { this.store?.setItem(KEY, JSON.stringify(records)); } catch { /* not persisted */ }
        return { best, previous, newBestScore: newBestScore && result.score > 0, newBestChain: newBestChain && result.maxChain > 1 };
    }

    get lastMode(): SoloMode | null {
        const mode = this.store?.getItem(LAST_KEY);
        return MODES.includes(mode as SoloMode) ? (mode as SoloMode) : null;
    }

    set lastMode(mode: SoloMode | null) {
        if (!mode) return;
        try { this.store?.setItem(LAST_KEY, mode); } catch { /* not persisted */ }
    }
}
