import { describe, it, expect } from 'vitest';
import { communityPath, parseCommunityPath } from '../../src/community/route';
import type { CommunityRoute } from '../../src/community/route';

describe('community routes', () => {
    it('round-trips every page through its URL', () => {
        const routes: CommunityRoute[] = [
            { page: 'home' }, { page: 'forums' }, { page: 'rankings' }, { page: 'players' },
            { page: 'forum', slug: 'strategy', p: 1 }, { page: 'forum', slug: 'strategy', p: 3 },
            { page: 'thread', slug: 'help', id: 42, p: 1 }, { page: 'thread', slug: 'help', id: 42, p: 2 },
            { page: 'compose', slug: 'general' },
        ];
        for (const r of routes) {
            const url = new URL(communityPath(r), 'https://puyo.live');
            expect(parseCommunityPath(url.pathname, url.search)).toEqual(r);
        }
    });

    it('ignores paths outside the hub and falls back safely inside it', () => {
        expect(parseCommunityPath('/')).toBeNull();
        expect(parseCommunityPath('/about')).toBeNull();
        expect(parseCommunityPath('/community/')).toEqual({ page: 'home' });
        expect(parseCommunityPath('/community/forums/<script>')).toEqual({ page: 'forums' });
        expect(parseCommunityPath('/community/forums/general/-1')).toEqual({ page: 'forum', slug: 'general', p: 1 });
        expect(parseCommunityPath('/community/nowhere')).toEqual({ page: 'home' });
    });
});
