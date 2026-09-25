import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../db/prisma.js';
import { AuthService } from '../services/auth.service.js';
import { ForumService, FORUM_LIMITS } from '../services/forum.service.js';
import type { User } from '../types/user.js';

/**
 * The community forums, end to end against a real database.
 * Rules under test: website/src/content/docs/architecture/community.md.
 */

const stamp = Date.now();
const prefix = `forumtest_${stamp}`;
let alice: User, bob: User, admin: User;
let aliceToken: string, bobToken: string, adminToken: string;

async function makeUser(name: string, isAdmin = false): Promise<User> {
  return prisma.user.create({ data: { username: `${prefix}_${name}`, password_hash: 'x', is_admin: isAdmin } });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  [alice, bob, admin] = await Promise.all([makeUser('alice'), makeUser('bob'), makeUser('admin', true)]);
  aliceToken = AuthService.generateToken(alice);
  bobToken = AuthService.generateToken(bob);
  adminToken = AuthService.generateToken(admin);
});

afterAll(async () => {
  const users = { author: { username: { startsWith: prefix } } };
  const threads = await prisma.forumThread.findMany({ where: users, select: { id: true } });
  await prisma.forumPost.deleteMany({ where: { OR: [users, { thread_id: { in: threads.map(t => t.id) } }] } });
  await prisma.forumThread.deleteMany({ where: users });
  await prisma.auditLog.deleteMany({ where: { admin: { username: { startsWith: prefix } } } });
  await prisma.ban.deleteMany({ where: { user: { username: { startsWith: prefix } } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
});

describe('Forums', () => {
  it('lists the seeded categories in order, announcements first', async () => {
    const res = await request(app).get('/api/forums').expect(200);
    const slugs = res.body.categories.map((c: { slug: string }) => c.slug);
    expect(slugs.slice(0, 6)).toEqual(['announcements', 'general', 'strategy', 'help', 'ideas', 'off-topic']);
    expect(res.body.categories[0].staff_only).toBe(true);
  });

  it('404s for an unknown forum', async () => {
    await request(app).get('/api/forums/nope/threads').expect(404);
    await request(app).get('/api/forums/Bad%20Slug/threads').expect(404);
  });

  let threadId: number;

  it('lets a signed-in player start a thread, and nobody else', async () => {
    await request(app).post('/api/forums/general/threads').send({ title: 'Hello', body: 'Hi' }).expect(401);
    const res = await request(app)
      .post('/api/forums/general/threads')
      .set(auth(aliceToken))
      .send({ title: '  My   first\\nthread ', body: 'Line one\r\nLine two  ' })
      .expect(201);
    threadId = res.body.thread.id;
    expect(res.body.thread.title).toBe('My first\\nthread');
    expect(res.body.post.body).toBe('Line one\nLine two');
  });

  it('validates titles and bodies', async () => {
    await request(app).post('/api/forums/general/threads').set(auth(aliceToken)).send({ title: 'ab', body: 'x' }).expect(400);
    await request(app).post('/api/forums/general/threads').set(auth(aliceToken)).send({ title: 'x'.repeat(121), body: 'x' }).expect(400);
    await request(app).post(`/api/forums/threads/${threadId}/posts`).set(auth(bobToken)).send({ body: '   ' }).expect(400);
    await request(app).post(`/api/forums/threads/${threadId}/posts`).set(auth(bobToken)).send({ body: 'y'.repeat(FORUM_LIMITS.bodyMax + 1) }).expect(400);
    await request(app).post(`/api/forums/threads/${threadId}/posts`).set(auth(bobToken)).send({}).expect(400);
  });

  it('keeps announcements to staff', async () => {
    await request(app).post('/api/forums/announcements/threads').set(auth(aliceToken)).send({ title: 'Fake news', body: 'x' }).expect(403);
    const res = await request(app).post('/api/forums/announcements/threads').set(auth(adminToken)).send({ title: 'Season one', body: 'It starts **now**.' }).expect(201);
    const news = await request(app).get('/api/forums/news').expect(200);
    expect(news.body.news[0]).toMatchObject({ id: res.body.thread.id, title: 'Season one', excerpt: 'It starts **now**.' });
  });

  it('shows a thread with its posts, and counts replies', async () => {
    await request(app).post(`/api/forums/threads/${threadId}/posts`).set(auth(bobToken)).send({ body: 'Welcome!' }).expect(201);
    const res = await request(app).get(`/api/forums/threads/${threadId}`).expect(200);
    expect(res.body.thread.post_count).toBe(2);
    expect(res.body.category).toEqual({ slug: 'general', name: 'General' });
    expect(res.body.posts.map((p: { body: string }) => p.body)).toEqual(['Line one\nLine two', 'Welcome!']);
    expect(res.body.posts[1].author.username).toBe(`${prefix}_bob`);
    expect(res.body.posts[0].author).not.toHaveProperty('password_hash');
  });

  it('lists threads pinned first, then by latest activity', async () => {
    const older = await ForumService.createThread(bob, 'general', 'An older thread', 'x');
    await ForumService.createThread(bob, 'general', 'A newer thread', 'x');
    await request(app).patch(`/api/forums/threads/${older.thread.id}`).set(auth(adminToken)).send({ pinned: true }).expect(200);
    const res = await request(app).get('/api/forums/general/threads').expect(200);
    const titles = res.body.threads.map((t: { title: string }) => t.title);
    expect(titles[0]).toBe('An older thread');
    expect(titles.indexOf('A newer thread')).toBeLessThan(titles.indexOf('My first\\nthread'));
  });

  it('lets only the author (for 30 minutes) or an admin edit a post', async () => {
    const thread = await request(app).get(`/api/forums/threads/${threadId}`).expect(200);
    const [first, reply] = thread.body.posts;
    await request(app).patch(`/api/forums/posts/${first.id}`).set(auth(bobToken)).send({ body: 'hijack' }).expect(403);
    const edited = await request(app).patch(`/api/forums/posts/${first.id}`).set(auth(aliceToken)).send({ body: 'Edited' }).expect(200);
    expect(edited.body.post.edited_at).toBeTruthy();
    await expect(ForumService.editPost(bob, reply.id, 'late', new Date(Date.now() + FORUM_LIMITS.editWindowMs + 60_000)))
      .rejects.toMatchObject({ statusCode: 403 });
    await request(app).patch(`/api/forums/posts/${reply.id}`).set(auth(adminToken)).send({ body: 'Moderated' }).expect(200);
    const log = await prisma.auditLog.findFirst({ where: { admin_id: admin.id, action: 'forum.post.edit', target_id: reply.id } });
    expect(log).not.toBeNull();
  });

  it('refuses replies to a locked thread, except from admins', async () => {
    await request(app).patch(`/api/forums/threads/${threadId}`).set(auth(aliceToken)).send({ locked: true }).expect(403);
    await request(app).patch(`/api/forums/threads/${threadId}`).set(auth(adminToken)).send({ locked: 'yes' }).expect(400);
    await request(app).patch(`/api/forums/threads/${threadId}`).set(auth(adminToken)).send({ locked: true }).expect(200);
    await request(app).post(`/api/forums/threads/${threadId}/posts`).set(auth(bobToken)).send({ body: 'Too late' }).expect(403);
    await request(app).post(`/api/forums/threads/${threadId}/posts`).set(auth(adminToken)).send({ body: 'Closing note' }).expect(201);
  });

  it('soft-deletes posts, keeping their place; deleting the first post removes the thread', async () => {
    const { thread } = await ForumService.createThread(alice, 'help', 'Short-lived', 'first');
    const reply = await ForumService.reply(bob, thread.id, 'second');
    await request(app).delete(`/api/forums/posts/${reply.id}`).set(auth(aliceToken)).expect(403);
    await request(app).delete(`/api/forums/posts/${reply.id}`).set(auth(bobToken)).expect(200);
    const view = await request(app).get(`/api/forums/threads/${thread.id}`).expect(200);
    expect(view.body.thread.post_count).toBe(1);
    expect(view.body.posts[1]).toMatchObject({ deleted: true, body: '' });

    const first = view.body.posts[0].id;
    const res = await request(app).delete(`/api/forums/posts/${first}`).set(auth(aliceToken)).expect(200);
    expect(res.body.deleted).toBe('thread');
    await request(app).get(`/api/forums/threads/${thread.id}`).expect(404);
  });

  it('refuses writes from a suspended account', async () => {
    await prisma.ban.create({ data: { user_id: bob.id, reason: 'test' } });
    // A token minted after the ban, so the refusal comes from the forum's own check.
    const fresh = AuthService.generateToken(bob);
    const res = await request(app).post(`/api/forums/general/threads`).set(auth(fresh)).send({ title: 'Banned', body: 'x' });
    expect([401, 403]).toContain(res.status);
    await expect(ForumService.createThread(bob, 'general', 'Banned', 'x')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rate-limits writes per account', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(app).post(`/api/forums/general/threads`).set(auth(adminToken)).send({ title: `Flood ${i}`, body: 'x' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter(s => s === 201).length).toBeLessThanOrEqual(6);
  });
});
