import { describe, it, expect } from 'vitest';
import { PersonalBests, modeForTimeLimit } from '../../src/core/PersonalBests';

class MemoryStore {
    data = new Map<string, string>();
    getItem(k: string) { return this.data.get(k) ?? null; }
    setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('PersonalBests', () => {
    it('maps time limits to modes', () => {
        expect([0, 180, 300, 600, 42].map(modeForTimeLimit)).toEqual(['practice', '3min', '5min', '10min', 'practice']);
    });

    it('treats the first game in a mode as a best', () => {
        const pb = new PersonalBests(new MemoryStore());
        const s = pb.submit('3min', { score: 1200, maxChain: 3, puyosCleared: 40 });
        expect(s.previous).toBeNull();
        expect(s.newBestScore).toBe(true);
        expect(s.newBestChain).toBe(true);
        expect(pb.get('3min')?.score).toBe(1200);
    });

    it('keeps the best score and the best chain independently', () => {
        const pb = new PersonalBests(new MemoryStore());
        pb.submit('practice', { score: 5000, maxChain: 2, puyosCleared: 80 });
        const s = pb.submit('practice', { score: 900, maxChain: 7, puyosCleared: 30 });
        expect(s.newBestScore).toBe(false);
        expect(s.newBestChain).toBe(true);
        expect(s.best).toMatchObject({ score: 5000, maxChain: 7, puyosCleared: 80 });
    });

    it('does not celebrate an empty game', () => {
        const s = new PersonalBests(new MemoryStore()).submit('5min', { score: 0, maxChain: 0, puyosCleared: 0 });
        expect(s.newBestScore).toBe(false);
        expect(s.newBestChain).toBe(false);
    });

    it('keeps modes apart and remembers the last one', () => {
        const store = new MemoryStore();
        const pb = new PersonalBests(store);
        pb.submit('3min', { score: 10, maxChain: 1, puyosCleared: 4 });
        expect(pb.get('10min')).toBeNull();
        pb.lastMode = '10min';
        expect(new PersonalBests(store).lastMode).toBe('10min');
    });

    it('survives corrupt or missing storage', () => {
        const store = new MemoryStore();
        store.setItem('puyolive_solo_bests', '{not json');
        expect(new PersonalBests(store).all()).toEqual({});
        const none = new PersonalBests(null);
        expect(none.submit('practice', { score: 5, maxChain: 1, puyosCleared: 4 }).newBestScore).toBe(true);
        expect(none.lastMode).toBeNull();
    });
});
