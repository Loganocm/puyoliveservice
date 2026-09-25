import { prisma } from '../db/prisma.js';
import type { User } from '../types/user.js';
import { avatarUrl } from './avatar.js';
import { findActiveBan } from './auth.service.js';

/**
 * Community forums: categories, threads and posts.
 *
 * Design, rules and API: website/src/content/docs/architecture/community.md.
 * Bodies are stored as plain text and rendered on the client with a safe
 * Markdown subset; nothing here produces HTML. Deletion is soft, so moderation
 * can be reviewed and undone, and every moderation action is audit-logged.
 */

export const FORUM_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  bodyMin: 1,
  bodyMax: 10_000,
  threadsPerPage: 20,
  postsPerPage: 20,
  /** How long an author may edit their own post. Admins may always edit. */
  editWindowMs: 30 * 60 * 1000,
} as const;

/** An error with the HTTP status the API should answer with. */
export class ForumError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

type Author = Pick<User, 'id' | 'username' | 'avatar_updated_at' | 'is_admin' | 'level'>;

const AUTHOR_SELECT = { id: true, username: true, avatar_updated_at: true, is_admin: true, level: true } as const;

function author(a: Author) {
  return { id: a.id, username: a.username, avatar_url: avatarUrl(a.id, a.avatar_updated_at), is_admin: a.is_admin, level: a.level };
}

function page(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

/** Collapse runs of whitespace in titles; posts keep their line breaks. */
function cleanTitle(title: unknown): string {
  if (typeof title !== 'string') throw new ForumError(400, 'Title is required');
  const t = title.replace(/\s+/g, ' ').trim();
  if (t.length < FORUM_LIMITS.titleMin || t.length > FORUM_LIMITS.titleMax) {
    throw new ForumError(400, `Title must be ${FORUM_LIMITS.titleMin}-${FORUM_LIMITS.titleMax} characters`);
  }
  return t;
}

function cleanBody(body: unknown): string {
  if (typeof body !== 'string') throw new ForumError(400, 'Post body is required');
  // Normalise line endings and trim trailing space, but keep the writer's layout.
  const b = body.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  if (b.length < FORUM_LIMITS.bodyMin || b.length > FORUM_LIMITS.bodyMax) {
    throw new ForumError(400, `Post must be ${FORUM_LIMITS.bodyMin}-${FORUM_LIMITS.bodyMax.toLocaleString('en-US')} characters`);
  }
  return b;
}

async function assertCanWrite(user: User): Promise<void> {
  // Tokens issued before a ban are already refused; this covers bans placed
  // while a session is open.
  if (await findActiveBan(user.id)) throw new ForumError(403, 'Account suspended');
}

async function audit(admin: User, action: string, targetId: number, details: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({ data: { admin_id: admin.id, action, target_id: targetId, details: details as object } });
}

export class ForumService {
  /** Every category with its thread count and latest activity. */
  static async listCategories() {
    const categories = await prisma.forumCategory.findMany({ orderBy: { position: 'asc' } });
    return Promise.all(categories.map(async c => {
      const [threads, latest] = await Promise.all([
        prisma.forumThread.count({ where: { category_id: c.id, deleted: false } }),
        prisma.forumThread.findFirst({
          where: { category_id: c.id, deleted: false },
          orderBy: { last_post_at: 'desc' },
          select: { id: true, title: true, last_post_at: true, author: { select: AUTHOR_SELECT } },
        }),
      ]);
      return {
        ...c,
        thread_count: threads,
        latest: latest && { id: latest.id, title: latest.title, at: latest.last_post_at, author: author(latest.author) },
      };
    }));
  }

  static async category(slug: string) {
    const category = await prisma.forumCategory.findUnique({ where: { slug } });
    if (!category) throw new ForumError(404, 'Forum not found');
    return category;
  }

  /** A page of a category's threads: pinned first, then by latest activity. */
  static async listThreads(slug: string, rawPage: unknown) {
    const category = await this.category(slug);
    const where = { category_id: category.id, deleted: false };
    const current = page(rawPage);
    const [total, threads] = await Promise.all([
      prisma.forumThread.count({ where }),
      prisma.forumThread.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { last_post_at: 'desc' }],
        skip: (current - 1) * FORUM_LIMITS.threadsPerPage,
        take: FORUM_LIMITS.threadsPerPage,
        include: { author: { select: AUTHOR_SELECT } },
      }),
    ]);
    return {
      category,
      threads: threads.map(t => ({
        id: t.id, title: t.title, pinned: t.pinned, locked: t.locked,
        post_count: t.post_count, created_at: t.created_at, last_post_at: t.last_post_at,
        author: author(t.author),
      })),
      page: current,
      pages: Math.max(1, Math.ceil(total / FORUM_LIMITS.threadsPerPage)),
    };
  }

  static async createThread(user: User, slug: string, rawTitle: unknown, rawBody: unknown) {
    const category = await this.category(slug);
    if (category.staff_only && !user.is_admin) throw new ForumError(403, 'Only staff can start threads here');
    const title = cleanTitle(rawTitle);
    const body = cleanBody(rawBody);
    await assertCanWrite(user);
    return prisma.$transaction(async tx => {
      const thread = await tx.forumThread.create({ data: { category_id: category.id, author_id: user.id, title, post_count: 1 } });
      const post = await tx.forumPost.create({ data: { thread_id: thread.id, author_id: user.id, body } });
      return { thread, post };
    });
  }

  /** A thread with one page of its posts, oldest first. Deleted posts keep their place, without their text. */
  static async getThread(id: number, rawPage: unknown) {
    const thread = await prisma.forumThread.findFirst({
      where: { id, deleted: false },
      include: { category: true, author: { select: AUTHOR_SELECT } },
    });
    if (!thread) throw new ForumError(404, 'Thread not found');
    const current = page(rawPage);
    const [total, posts] = await Promise.all([
      prisma.forumPost.count({ where: { thread_id: id } }),
      prisma.forumPost.findMany({
        where: { thread_id: id },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        skip: (current - 1) * FORUM_LIMITS.postsPerPage,
        take: FORUM_LIMITS.postsPerPage,
        include: { author: { select: AUTHOR_SELECT } },
      }),
    ]);
    return {
      thread: {
        id: thread.id, title: thread.title, pinned: thread.pinned, locked: thread.locked,
        post_count: thread.post_count, created_at: thread.created_at, author: author(thread.author),
      },
      category: { slug: thread.category.slug, name: thread.category.name },
      posts: posts.map(p => ({
        id: p.id,
        body: p.deleted ? '' : p.body,
        deleted: p.deleted,
        created_at: p.created_at,
        edited_at: p.edited_at,
        author: author(p.author),
      })),
      page: current,
      pages: Math.max(1, Math.ceil(total / FORUM_LIMITS.postsPerPage)),
    };
  }

  static async reply(user: User, threadId: number, rawBody: unknown) {
    const body = cleanBody(rawBody);
    await assertCanWrite(user);
    return prisma.$transaction(async tx => {
      const thread = await tx.forumThread.findFirst({ where: { id: threadId, deleted: false } });
      if (!thread) throw new ForumError(404, 'Thread not found');
      if (thread.locked && !user.is_admin) throw new ForumError(403, 'This thread is locked');
      const post = await tx.forumPost.create({ data: { thread_id: threadId, author_id: user.id, body } });
      await tx.forumThread.update({
        where: { id: threadId },
        data: { post_count: { increment: 1 }, last_post_at: post.created_at },
      });
      return post;
    });
  }

  static async editPost(user: User, postId: number, rawBody: unknown, now: Date = new Date()) {
    const body = cleanBody(rawBody);
    const post = await prisma.forumPost.findUnique({ where: { id: postId }, include: { thread: true } });
    if (!post || post.deleted || post.thread.deleted) throw new ForumError(404, 'Post not found');
    const own = post.author_id === user.id;
    if (!own && !user.is_admin) throw new ForumError(403, 'You can only edit your own posts');
    if (own && !user.is_admin && now.getTime() - post.created_at.getTime() > FORUM_LIMITS.editWindowMs) {
      throw new ForumError(403, 'Posts can only be edited for 30 minutes');
    }
    await assertCanWrite(user);
    const updated = await prisma.forumPost.update({ where: { id: postId }, data: { body, edited_at: now } });
    if (!own) await audit(user, 'forum.post.edit', postId, { thread_id: post.thread_id });
    return updated;
  }

  /** Soft-delete a post. Deleting a thread's first post deletes the thread. */
  static async deletePost(user: User, postId: number) {
    const post = await prisma.forumPost.findUnique({ where: { id: postId }, include: { thread: true } });
    if (!post || post.deleted || post.thread.deleted) throw new ForumError(404, 'Post not found');
    const own = post.author_id === user.id;
    if (!own && !user.is_admin) throw new ForumError(403, 'You can only delete your own posts');
    const first = await prisma.forumPost.findFirst({
      where: { thread_id: post.thread_id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const wholeThread = first?.id === postId;
    await prisma.$transaction([
      prisma.forumPost.update({ where: { id: postId }, data: { deleted: true } }),
      wholeThread
        ? prisma.forumThread.update({ where: { id: post.thread_id }, data: { deleted: true } })
        : prisma.forumThread.update({ where: { id: post.thread_id }, data: { post_count: { decrement: 1 } } }),
    ]);
    if (!own) await audit(user, wholeThread ? 'forum.thread.delete' : 'forum.post.delete', wholeThread ? post.thread_id : postId, { post_id: postId });
    return { deleted: wholeThread ? 'thread' : 'post' };
  }

  /** Pin, lock or delete a thread. Admins only; always audit-logged. */
  static async moderateThread(user: User, threadId: number, changes: { pinned?: unknown; locked?: unknown; deleted?: unknown }) {
    if (!user.is_admin) throw new ForumError(403, 'Admins only');
    const data: { pinned?: boolean; locked?: boolean; deleted?: boolean } = {};
    for (const key of ['pinned', 'locked', 'deleted'] as const) {
      if (changes[key] !== undefined) {
        if (typeof changes[key] !== 'boolean') throw new ForumError(400, `${key} must be true or false`);
        data[key] = changes[key] as boolean;
      }
    }
    if (Object.keys(data).length === 0) throw new ForumError(400, 'Nothing to change');
    const thread = await prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new ForumError(404, 'Thread not found');
    const updated = await prisma.forumThread.update({ where: { id: threadId }, data });
    await audit(user, 'forum.thread.moderate', threadId, data);
    return updated;
  }

  /** The newest announcements, for the community home page. */
  static async news(limit = 5) {
    const threads = await prisma.forumThread.findMany({
      where: { deleted: false, category: { staff_only: true } },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
      include: { author: { select: AUTHOR_SELECT }, posts: { orderBy: [{ created_at: 'asc' }, { id: 'asc' }], take: 1 } },
    });
    return threads.map(t => ({
      id: t.id, title: t.title, created_at: t.created_at, post_count: t.post_count, author: author(t.author),
      excerpt: (t.posts[0]?.deleted ? '' : t.posts[0]?.body ?? '').slice(0, 280),
    }));
  }
}
