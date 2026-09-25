import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, authenticate } from '../middleware/index.js';
import { ForumError, ForumService } from '../services/forum.service.js';

/**
 * /api/forums — the community forums.
 * Table of routes and rules: website/src/content/docs/architecture/community.md.
 */
const router = Router();

/**
 * Writes are limited per account, on top of the global per-IP limit: at most
 * six posts, threads or edits a minute. Runs after `authenticate`.
 */
const writeLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `forum-user-${req.user?.id ?? 'anonymous'}`,
  message: { error: 'You are posting too quickly. Wait a minute and try again.' },
});

const SLUG = /^[a-z0-9-]{1,40}$/;

function slugParam(req: Request): string {
  const slug = String(req.params.slug ?? '');
  if (!SLUG.test(slug)) throw new ForumError(404, 'Forum not found');
  return slug;
}

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ForumError(404, 'Not found');
  return id;
}

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ categories: await ForumService.listCategories() });
}));

router.get('/news', asyncHandler(async (req: Request, res: Response) => {
  res.json({ news: await ForumService.news(Number(req.query.limit) || 5) });
}));

router.get('/threads/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json(await ForumService.getThread(idParam(req), req.query.page));
}));

router.post('/threads/:id/posts', authenticate, writeLimit, asyncHandler(async (req: Request, res: Response) => {
  const post = await ForumService.reply(req.user!, idParam(req), req.body?.body);
  res.status(201).json({ post });
}));

router.patch('/threads/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const thread = await ForumService.moderateThread(req.user!, idParam(req), req.body ?? {});
  res.json({ thread });
}));

router.patch('/posts/:id', authenticate, writeLimit, asyncHandler(async (req: Request, res: Response) => {
  const post = await ForumService.editPost(req.user!, idParam(req), req.body?.body);
  res.json({ post });
}));

router.delete('/posts/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  res.json(await ForumService.deletePost(req.user!, idParam(req)));
}));

router.get('/:slug/threads', asyncHandler(async (req: Request, res: Response) => {
  res.json(await ForumService.listThreads(slugParam(req), req.query.page));
}));

router.post('/:slug/threads', authenticate, writeLimit, asyncHandler(async (req: Request, res: Response) => {
  const created = await ForumService.createThread(req.user!, slugParam(req), req.body?.title, req.body?.body);
  res.status(201).json(created);
}));

export default router;
