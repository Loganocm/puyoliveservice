/**
 * Notices when this device cannot keep the game at a playable frame rate.
 *
 * Below about 12 rendered frames a second the single-player loop can no
 * longer catch up (it runs at most five logical frames per render), so the
 * game slows down rather than stutters; above that it only looks rough. The
 * scene reacts by dropping heavy effects and saying so, instead of leaving
 * the player to wonder why the game feels wrong (CLI-20).
 *
 * Fed with Pixi's ticker delta (1 = one 60 Hz frame). Reports once.
 */
export class FrameRateMonitor {
    private average = 1;
    private slowFrames = 0;
    private reported = false;
    private readonly threshold: number;
    private readonly sustain: number;

    /**
     * @param minFps  frame rate below which the device counts as struggling
     * @param sustainSeconds  how long it must stay below before reporting
     */
    constructor(minFps = 40, sustainSeconds = 4) {
        this.threshold = 60 / minFps;
        this.sustain = sustainSeconds * 60;
    }

    /** Add one rendered frame. True exactly once, when slowness has persisted. */
    sample(delta: number): boolean {
        if (this.reported || !(delta > 0)) return false;
        // Smooth over single hitches (tab switches, GC pauses).
        this.average += (Math.min(delta, 10) - this.average) * 0.1;
        if (this.average > this.threshold) {
            this.slowFrames += delta;
            if (this.slowFrames >= this.sustain) {
                this.reported = true;
                return true;
            }
        } else {
            this.slowFrames = 0;
        }
        return false;
    }

    /** Smoothed frames per second. */
    get fps(): number {
        return Math.round(60 / this.average);
    }
}
