/**
 * MatchClock — a shared timeline for both players in a match.
 *
 * WHY THIS EXISTS
 *
 * Each client used to derive its frame number from a free-running accumulator
 * started when its own `game_start` packet arrived. Two consequences:
 *
 *   - Player A's frame 1000 and player B's frame 1000 were different wall-clock
 *     moments, differing by network jitter, rAF phase and any tab stall.
 *   - Replays advance both engines in lockstep by frame index, so playback
 *     asserted an alignment the live match never had. The replay was faithfully
 *     reproducing a timeline that did not exist.
 *
 * Deriving frame numbers from a clock both clients agree on fixes both at once:
 * frame N becomes the same instant on both machines, so cross-player alignment
 * is real live, and lockstep replay becomes correct by construction. The replay
 * file format is unchanged — this is a timing fix, not a storage change.
 *
 * See website/src/content/docs/reference/frame-timing.md and docs/adr/0003-shared-match-clock.md.
 */

/** Logical simulation rate. One engine frame is 1/60th of a second. */
export const FRAME_MS = 1000 / 60;

/**
 * Never advance more than this many engine frames in a single rendered frame.
 *
 * A stalled or backgrounded tab can fall arbitrarily far behind the shared
 * clock. Catching up without a bound causes a visible fast-forward and, worse,
 * a spiral where each catch-up takes longer than the frame it is trying to
 * reclaim. Clamping means a stalled client recovers gradually or trips the
 * desync threshold below — both preferable to freezing the tab.
 */
export const MAX_CATCHUP_FRAMES = 5;

/**
 * Falling this far behind the shared clock means the client can no longer
 * present an honest view of the match. The server's board-state heartbeat
 * aborts at 7s; this fires earlier so the client can surface it first.
 */
export const DESYNC_FRAME_THRESHOLD = 180; // 3 seconds

export class MatchClock {
    /** serverNow() - Date.now(), in milliseconds. */
    private static offsetMs = 0;
    private static synced = false;
    private static bestRttMs = Number.POSITIVE_INFINITY;

    /** Server epoch (ms) at which frame 0 occurs. Null until a match starts. */
    private static startAtMs: number | null = null;

    /** True once at least one clock sample has been accepted. */
    static get isSynced(): boolean { return this.synced; }

    /** Round-trip time of the best sample, for diagnostics and the jitter buffer. */
    static get rttMs(): number { return Number.isFinite(this.bestRttMs) ? this.bestRttMs : 0; }

    /** Current time on the server's clock, estimated. */
    static serverNow(): number {
        return Date.now() + this.offsetMs;
    }

    /**
     * Fold in one clock sample.
     *
     * Uses the lowest-RTT sample rather than an average: the minimum round trip
     * is the one least polluted by queueing delay, so its midpoint is the best
     * estimate of the server's clock. Averaging would let one slow sample bias
     * the offset permanently.
     *
     * @param clientSentAt   Date.now() when the ping left
     * @param serverTime     server timestamp echoed back
     * @param clientRecvAt   Date.now() when the reply arrived
     */
    static addSample(clientSentAt: number, serverTime: number, clientRecvAt: number): void {
        const rtt = clientRecvAt - clientSentAt;
        if (rtt < 0 || rtt > 5000) return; // implausible; ignore
        if (rtt >= this.bestRttMs) return; // keep only the best sample

        this.bestRttMs = rtt;
        // Assume symmetric latency: the server's timestamp corresponds to the
        // midpoint of the round trip.
        const clientMidpoint = clientSentAt + rtt / 2;
        this.offsetMs = serverTime - clientMidpoint;
        this.synced = true;
    }

    /**
     * Begin a match. `startAtMs` is on the SERVER clock and is normally a few
     * seconds in the future, giving every client time to receive it and count
     * down to the same instant.
     */
    static startMatch(startAtServerMs: number): void {
        this.startAtMs = startAtServerMs;
    }

    static endMatch(): void {
        this.startAtMs = null;
    }

    static get hasMatch(): boolean { return this.startAtMs !== null; }

    /** Milliseconds until the match begins; negative once it has. */
    static msUntilStart(): number {
        if (this.startAtMs === null) return 0;
        return this.startAtMs - this.serverNow();
    }

    /**
     * The frame the shared clock says we should be on right now.
     * Negative before the match starts (i.e. during the countdown).
     */
    static targetFrame(): number {
        if (this.startAtMs === null) return 0;
        return Math.floor((this.serverNow() - this.startAtMs) / FRAME_MS);
    }

    /**
     * How many engine frames to advance this rendered frame, given where the
     * engine currently is. Clamped, and never negative — a client that is ahead
     * of the shared clock waits rather than running backwards.
     */
    static framesToAdvance(currentFrame: number): number {
        const behind = this.targetFrame() - currentFrame;
        if (behind <= 0) return 0;
        return Math.min(behind, MAX_CATCHUP_FRAMES);
    }

    /** True when the client has fallen far enough behind to be untrustworthy. */
    static isDesynced(currentFrame: number): boolean {
        return this.targetFrame() - currentFrame > DESYNC_FRAME_THRESHOLD;
    }

    /** Reset everything. Called when leaving a match. */
    static reset(): void {
        this.startAtMs = null;
        // Deliberately keep offset and RTT: they stay valid for the connection
        // and re-syncing from scratch each match would waste the samples.
    }
}
