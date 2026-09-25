import { describe, it, expect } from 'vitest';
import { targetBoardOf } from '../../server/minesTarget';

/** NET-15: the Mines target view was always empty; the server now sends the target's board. */
describe('targetBoardOf', () => {
    const grid = [[0, 1], [2, 3]];
    const players = new Map([
        ['a', { currentTarget: 'b', board: [[9]] }],
        ['b', { currentTarget: 'a', board: grid }],
        ['c', { currentTarget: null, board: null }],
        ['d', { currentTarget: 'c', board: null }],
        ['e', { currentTarget: 'e', board: grid }],
    ]);

    it("returns the target's board and id", () => {
        expect(targetBoardOf(players, 'a')).toEqual({ socketId: 'b', grid });
    });

    it('returns nothing without a target, without a known board, or for self-targeting', () => {
        expect(targetBoardOf(players, 'c')).toBeNull();
        expect(targetBoardOf(players, 'd')).toBeNull();
        expect(targetBoardOf(players, 'e')).toBeNull();
        expect(targetBoardOf(players, 'nobody')).toBeNull();
    });
});
