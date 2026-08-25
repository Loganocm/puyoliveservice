import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MatchClock,
  FRAME_MS,
  MAX_CATCHUP_FRAMES,
  DESYNC_FRAME_THRESHOLD,
} from '../../src/core/MatchClock';

/**
 * MATCH CLOCK
 *
 * The clock is what makes frame N mean the same instant on both players'
 * machines. Everything downstream depends on it: live cross-player alignment,
 * and lockstep replay being correct rather than merely assumed.
 *
 * These tests use fake timers so "two clients with different local clocks and
 * different latency" is reproducible rather than a race.
 *
 * See docs/adr/0003-shared-match-clock.md.
 */

beforeEach(() => {
  vi.useFakeTimers();
  MatchClock.reset();
  // Clear the offset/RTT that reset() deliberately preserves, so each test
  // starts from a known state.
  (MatchClock as any).offsetMs = 0;
  (MatchClock as any).synced = false;
  (MatchClock as any).bestRttMs = Number.POSITIVE_INFINITY;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('clock synchronisation', () => {
  it('recovers a clock offset from a symmetric round trip', () => {
    vi.setSystemTime(1_000_000);
    // Server clock runs 5000ms ahead of this client. A 100ms round trip means
    // the server's timestamp corresponds to the midpoint, +50ms.
    const sentAt = Date.now();
    const serverTime = sentAt + 5000 + 50;
    const recvAt = sentAt + 100;

    MatchClock.addSample(sentAt, serverTime, recvAt);

    expect(MatchClock.isSynced).toBe(true);
    expect(MatchClock.rttMs).toBe(100);
    expect(MatchClock.serverNow() - Date.now()).toBe(5000);
  });

  it('keeps the lowest-RTT sample rather than averaging', () => {
    // A single congested sample must not bias the offset permanently. The
    // minimum round trip is the least polluted by queueing delay.
    vi.setSystemTime(1_000_000);
    const t0 = Date.now();

    // Bad sample first: 800ms RTT, and asymmetric so it implies a wrong offset.
    MatchClock.addSample(t0, t0 + 5000 + 700, t0 + 800);
    const afterBad = MatchClock.serverNow() - Date.now();

    // Good sample: 40ms RTT, correctly symmetric.
    MatchClock.addSample(t0, t0 + 5000 + 20, t0 + 40);

    expect(MatchClock.rttMs).toBe(40);
    expect(MatchClock.serverNow() - Date.now()).toBe(5000);
    expect(MatchClock.serverNow() - Date.now()).not.toBe(afterBad);
  });

  it('ignores implausible samples', () => {
    vi.setSystemTime(1_000_000);
    const t0 = Date.now();
    MatchClock.addSample(t0, t0, t0 - 50);     // negative RTT
    MatchClock.addSample(t0, t0, t0 + 60_000); // absurd RTT
    expect(MatchClock.isSynced).toBe(false);
  });
});

describe('shared timeline', () => {
  it('gives two clients with different local clocks the same frame number', () => {
    // This is the property the whole design exists for.
    vi.setSystemTime(1_000_000);
    const serverEpoch = 9_000_000;
    const startAt = serverEpoch + 3000;

    // Client A: local clock 8,000,000ms behind server, 60ms RTT.
    const aLocal = 1_000_000;
    vi.setSystemTime(aLocal);
    MatchClock.addSample(aLocal, serverEpoch + 30, aLocal + 60);
    MatchClock.startMatch(startAt);
    // 2 seconds after the match begins on the server clock.
    vi.setSystemTime(aLocal + 3000 + 2000);
    const frameA = MatchClock.targetFrame();

    // Client B: completely different local clock and latency.
    (MatchClock as any).offsetMs = 0;
    (MatchClock as any).synced = false;
    (MatchClock as any).bestRttMs = Number.POSITIVE_INFINITY;
    const bLocal = 55_555_555;
    vi.setSystemTime(bLocal);
    MatchClock.addSample(bLocal, serverEpoch + 100, bLocal + 200);
    MatchClock.startMatch(startAt);
    vi.setSystemTime(bLocal + 3000 + 2000);
    const frameB = MatchClock.targetFrame();

    expect(frameA).toBe(frameB);
    expect(frameA).toBe(Math.floor(2000 / FRAME_MS)); // ~120 frames
  });

  it('reports negative frames during the pre-match countdown', () => {
    vi.setSystemTime(1_000_000);
    MatchClock.startMatch(Date.now() + 3000);
    expect(MatchClock.targetFrame()).toBeLessThan(0);
    expect(MatchClock.msUntilStart()).toBe(3000);
  });
});

describe('advance policy', () => {
  beforeEach(() => {
    vi.setSystemTime(1_000_000);
    MatchClock.startMatch(Date.now());
  });

  it('advances one frame per frame interval when keeping up', () => {
    vi.setSystemTime(Date.now() + Math.ceil(FRAME_MS));
    expect(MatchClock.framesToAdvance(0)).toBe(1);
  });

  it('never advances when the client is ahead of the shared clock', () => {
    // Running ahead would mean simulating a future the other player has not
    // reached. Waiting is correct; running backwards is not an option.
    expect(MatchClock.framesToAdvance(100)).toBe(0);
  });

  it('clamps catch-up so a stalled tab cannot spiral', () => {
    // Simulate a 2-second stall: the clock says ~120 frames behind.
    vi.setSystemTime(Date.now() + 2000);
    const behind = MatchClock.targetFrame() - 0;
    expect(behind).toBeGreaterThan(MAX_CATCHUP_FRAMES);
    expect(MatchClock.framesToAdvance(0)).toBe(MAX_CATCHUP_FRAMES);
  });

  it('flags desync only past the threshold', () => {
    vi.setSystemTime(Date.now() + Math.ceil(FRAME_MS * (DESYNC_FRAME_THRESHOLD - 10)));
    expect(MatchClock.isDesynced(0)).toBe(false);

    vi.setSystemTime(Date.now() + Math.ceil(FRAME_MS * 40));
    expect(MatchClock.isDesynced(0)).toBe(true);
  });
});

describe('lifecycle', () => {
  it('has no match before one starts and none after it ends', () => {
    expect(MatchClock.hasMatch).toBe(false);
    MatchClock.startMatch(Date.now() + 1000);
    expect(MatchClock.hasMatch).toBe(true);
    MatchClock.endMatch();
    expect(MatchClock.hasMatch).toBe(false);
  });

  it('keeps the clock offset across matches', () => {
    // Re-syncing from scratch each match would discard good samples for no
    // reason: the offset is a property of the connection, not the match.
    vi.setSystemTime(1_000_000);
    const t0 = Date.now();
    MatchClock.addSample(t0, t0 + 5000, t0 + 20);
    const offset = MatchClock.serverNow() - Date.now();

    MatchClock.startMatch(t0 + 1000);
    MatchClock.reset();

    expect(MatchClock.serverNow() - Date.now()).toBe(offset);
    expect(MatchClock.hasMatch).toBe(false);
  });
});
