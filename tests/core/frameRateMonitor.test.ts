import { describe, it, expect } from 'vitest';
import { FrameRateMonitor } from '../../src/core/FrameRateMonitor';

describe('FrameRateMonitor', () => {
    it('stays quiet at 60 fps', () => {
        const m = new FrameRateMonitor();
        for (let i = 0; i < 1000; i++) expect(m.sample(1)).toBe(false);
    });

    it('ignores a single long hitch', () => {
        const m = new FrameRateMonitor();
        m.sample(1);
        expect(m.sample(30)).toBe(false);
        for (let i = 0; i < 600; i++) expect(m.sample(1)).toBe(false);
    });

    it('reports sustained slowness once, after the sustain time', () => {
        const m = new FrameRateMonitor(40, 4);
        const reports: number[] = [];
        let elapsed = 0;
        for (let i = 0; i < 400; i++) {
            elapsed += 3; // 20 fps
            if (m.sample(3)) reports.push(elapsed);
        }
        expect(reports).toHaveLength(1);
        expect(reports[0]).toBeGreaterThanOrEqual(240);
        expect(reports[0]).toBeLessThan(300);
        expect(m.fps).toBe(20);
    });

    it('restarts the count when the frame rate recovers', () => {
        const m = new FrameRateMonitor(40, 4);
        for (let i = 0; i < 60; i++) m.sample(3);   // 3 s slow
        for (let i = 0; i < 120; i++) m.sample(1);  // recovers
        let reported = false;
        for (let i = 0; i < 60; i++) reported ||= m.sample(3); // 3 s slow again
        expect(reported).toBe(false);
    });
});
