import { describe, it, expect } from 'vitest';
import { GameRoom } from '../../server/GameRoom';

/**
 * Player identity across a reconnect.
 *
 * GameRoom derives a player's index from Map insertion order, and that index
 * stamps every recorded input, decides who is host and attributes stats. A
 * reconnect swaps the socket id; it must not move the player.
 *
 * Regression for NET-07 (website/src/content/docs/review/findings.md): the
 * swap used to delete and re-insert, so player 0 became player 1 mid-match.
 */

function twoPlayerRoom(): GameRoom {
    const room = new GameRoom('ROOM01');
    room.addPlayer({ id: 'sock-a', name: 'alice', ready: true, userId: 1 });
    room.addPlayer({ id: 'sock-b', name: 'bob', ready: true, userId: 2 });
    return room;
}

describe('GameRoom.reconnectPlayer', () => {
    it('keeps a reconnecting player 0 at index 0', () => {
        const room = twoPlayerRoom();

        const old = room.reconnectPlayer(1, 'sock-a2');

        expect(old).toBe('sock-a');
        expect(room.getPlayerIndex('sock-a2')).toBe(0);
        expect(room.getPlayerIndex('sock-b')).toBe(1);
        expect(room.getPlayerIndex('sock-a')).toBe(-1);
        expect(room.players.get('sock-a2')?.id).toBe('sock-a2');
    });

    it('keeps host, stat attribution and user-id order stable', () => {
        const room = twoPlayerRoom();
        room.startMatch();
        room.reconnectPlayer(1, 'sock-a2');

        expect(room.getPlayersForClient().map(p => [p.username, p.isHost])).toEqual([
            ['alice', true],
            ['bob', false],
        ]);

        // recordGarbage attributes by position; alice must still be player 1.
        room.recordGarbage('sock-a2', 7);
        expect(room.matchStats?.player1GarbageSent).toBe(7);
        expect(room.matchStats?.player2GarbageSent).toBe(0);

        expect(room.getPlayerUserIds()).toEqual({ player1Id: 1, player2Id: 2 });
    });

    it('carries socket-keyed state (settings, simulator) to the new socket', () => {
        const room = twoPlayerRoom();
        room.startMatch();
        room.recordPlayerSettings('sock-a', 25, false);
        const sim = { marker: 'alice-sim' };
        room.simulators.set('sock-a', sim);

        room.reconnectPlayer(1, 'sock-a2');

        expect(room.simulators.get('sock-a2')).toBe(sim);
        expect(room.simulators.has('sock-a')).toBe(false);

        // The replay must keep alice's recorded handling, not fall back to defaults.
        const replay = room.buildReplayFile(0);
        expect(replay.playerSettings[0]).toEqual({ sdf: 25, softDropProtection: false });
    });

    it('returns null and changes nothing for an unknown user', () => {
        const room = twoPlayerRoom();
        expect(room.reconnectPlayer(99, 'sock-x')).toBeNull();
        expect(Array.from(room.players.keys())).toEqual(['sock-a', 'sock-b']);
    });
});
