import { describe, it, expect } from 'vitest';
import { GameRoom } from '../../server/GameRoom';

/**
 * Match liveness (NET-13).
 *
 * The server aborts a match when a client goes silent, which is how it
 * notices a closed laptop or a backgrounded tab. "Silent" used to mean "no
 * board state", and clients only sent one when their board changed, so a
 * player who thought for seven seconds about one piece was aborted as
 * disconnected. Inputs now count as signs of life, and clients also send a
 * board state every two seconds while their game loop runs.
 */

const TIMEOUT = 7_000;
const GRACE = 7_000;

function startedRoom(): { room: GameRoom; start: number } {
    const room = new GameRoom('ROOM01');
    room.addPlayer({ id: 'sock-a', name: 'alice', ready: true, userId: 1 });
    room.addPlayer({ id: 'sock-b', name: 'bob', ready: true, userId: 2 });
    room.startMatch();
    return { room, start: room.matchStats!.startedAt.getTime() };
}

describe('GameRoom liveness', () => {
    it('stalls nobody during the loading grace period', () => {
        const { room, start } = startedRoom();
        expect(room.findStalledPlayer(start + GRACE - 1, 1, GRACE)).toBeNull();
    });

    it('reports the player who has been silent past the timeout', () => {
        const { room, start } = startedRoom();
        const now = start + 20_000;
        room.markAlive('sock-a', now - 1_000);
        const stalled = room.findStalledPlayer(now, TIMEOUT, GRACE);
        expect(stalled?.socketId).toBe('sock-b');
        expect(stalled?.silentMs).toBe(20_000);
    });

    it('keeps a player alive on any sign of life, not only board changes', () => {
        const { room, start } = startedRoom();
        // Both clients heartbeat every 2 s for a minute without any board change.
        for (let t = 2_000; t <= 60_000; t += 2_000) {
            room.markAlive('sock-a', start + t);
            room.markAlive('sock-b', start + t);
            expect(room.findStalledPlayer(start + t + 500, TIMEOUT, GRACE)).toBeNull();
        }
    });

    it('checks nothing once the match is over', () => {
        const { room, start } = startedRoom();
        room.concludeMatch('sock-a');
        expect(room.findStalledPlayer(start + 60_000, TIMEOUT, GRACE)).toBeNull();
    });

    it('ignores signs of life from sockets not in the room', () => {
        const { room, start } = startedRoom();
        room.markAlive('stranger', start + 10_000);
        expect(room.players.has('stranger')).toBe(false);
    });
});
