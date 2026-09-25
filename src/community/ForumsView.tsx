import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Lock, Pin, MessageSquare, Megaphone, Pencil, Trash2, Eye, PenLine, Shield } from "lucide-react";
import { APIClient } from "@/api/client";
import { AuthManager } from "@/core/AuthManager";
import { Markdown } from "./Markdown";
import type { CommunityRoute } from "./route";

/*
 * The forums: category index, a category's threads, a thread, and the
 * composer. State comes from the route (so every page has a URL); data is
 * fetched per page. Rules are enforced by the API
 * (api/src/services/forum.service.ts); the interface only mirrors them.
 */

interface Author { id: number; username: string; avatar_url?: string; is_admin: boolean; level: number }
interface Category {
  id: number; slug: string; name: string; description: string; staff_only: boolean; thread_count: number;
  latest: { id: number; title: string; at: string; author: Author } | null;
}
interface ThreadSummary { id: number; title: string; pinned: boolean; locked: boolean; post_count: number; last_post_at: string; author: Author }
interface Post { id: number; body: string; deleted: boolean; created_at: string; edited_at: string | null; author: Author }
interface ThreadPage {
  thread: { id: number; title: string; pinned: boolean; locked: boolean; post_count: number; author: Author };
  category: { slug: string; name: string };
  posts: Post[]; page: number; pages: number;
}

const TITLE_MAX = 120;
const BODY_MAX = 10_000;
const EDIT_WINDOW_MS = 30 * 60 * 1000;

type ForumRoute = Extract<CommunityRoute, { page: "forums" | "forum" | "thread" | "compose" }>;

interface Props {
  route: ForumRoute;
  navigate: (route: CommunityRoute) => void;
  onPlayerClick: (id: number) => void;
  timeAgo: (iso: string) => string;
}

function me() {
  const user = AuthManager.currentUser as { id: number; is_admin?: boolean } | null;
  return AuthManager.isGuest || !user ? null : user;
}

export function ForumsView(props: Props) {
  const { route } = props;
  if (route.page === "forums") return <ForumIndex {...props} />;
  if (route.page === "forum") return <ForumThreads {...props} slug={route.slug} page={route.p} />;
  if (route.page === "thread") return <ThreadView {...props} slug={route.slug} id={route.id} page={route.p} />;
  return <Compose {...props} slug={route.slug} />;
}

/* ── Shared pieces ─────────────────────────────────────────────────────── */

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    load().then(setData).catch((e: Error) => setError(e.message || "Could not load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setData(null); reload(); }, [reload]);
  return { data, error, reload };
}

function Crumbs({ items, navigate }: { items: [string, CommunityRoute | null][]; navigate: Props["navigate"] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-white/50 mb-4 flex-wrap">
      {items.map(([label, to], i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
          {to ? <button className="hover:text-white transition-colors" onClick={() => navigate(to)}>{label}</button> : <span className="text-white/80">{label}</span>}
        </span>
      ))}
    </nav>
  );
}

function Name({ author, onPlayerClick }: { author: Author; onPlayerClick: Props["onPlayerClick"] }) {
  return (
    <button className="font-semibold text-white hover:underline inline-flex items-center gap-1" onClick={() => onPlayerClick(author.id)}>
      {author.username}
      {author.is_admin && <Shield size={12} aria-label="Staff" style={{ color: "var(--pl-accent-primary)" }} />}
    </button>
  );
}

function Avatar({ author, size = 40 }: { author: Author; size?: number }) {
  return author.avatar_url
    ? <img src={author.avatar_url} alt="" width={size} height={size} className="rounded-xl object-cover shrink-0" loading="lazy" />
    : (
      <div className="rounded-xl shrink-0 flex items-center justify-center font-bold text-white" style={{ width: size, height: size, background: "linear-gradient(135deg, var(--pl-accent-primary), var(--pl-accent-secondary))" }}>
        {author.username.slice(0, 1).toUpperCase()}
      </div>
    );
}

function Pager({ page, pages, go }: { page: number; pages: number; go: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-5 text-sm">
      <button disabled={page <= 1} onClick={() => go(page - 1)} className="px-3 py-1.5 rounded-lg bg-white/5 disabled:opacity-30">Previous</button>
      <span className="text-white/50 tabular-nums">Page {page} of {pages}</span>
      <button disabled={page >= pages} onClick={() => go(page + 1)} className="px-3 py-1.5 rounded-lg bg-white/5 disabled:opacity-30">Next</button>
    </div>
  );
}

function Status({ error, retry }: { error: string | null; retry: () => void }) {
  if (error) {
    return (
      <div className="py-12 text-center text-white/60">
        <p className="mb-3">{error}</p>
        <button onClick={retry} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15">Try again</button>
      </div>
    );
  }
  return <div className="py-12 text-center text-white/40">Loading…</div>;
}

function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button {...rest} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white disabled:opacity-40 ${rest.className ?? ""}`} style={{ background: "var(--pl-accent-primary)" }}>
      {children}
    </button>
  );
}

/* ── Pages ─────────────────────────────────────────────────────────────── */

function ForumIndex({ navigate, timeAgo }: Props) {
  const { data, error, reload } = useLoad<{ categories: Category[] }>(() => APIClient.getForums(), []);
  if (!data) return <Status error={error} retry={reload} />;
  return (
    <div className="space-y-2">
      {data.categories.map(c => (
        <button
          key={c.id}
          onClick={() => navigate({ page: "forum", slug: c.slug, p: 1 })}
          className="w-full text-left flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
        >
          <div className="p-2.5 rounded-xl bg-white/5 shrink-0">
            {c.staff_only ? <Megaphone size={20} style={{ color: "var(--pl-accent-primary)" }} /> : <MessageSquare size={20} style={{ color: "var(--pl-accent-secondary)" }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white">{c.name}</div>
            <div className="text-sm text-white/50 truncate">{c.description}</div>
          </div>
          <div className="hidden sm:block text-right text-xs text-white/45 w-56 shrink-0">
            {c.latest ? (
              <>
                <div className="truncate text-white/70">{c.latest.title}</div>
                <div>{c.latest.author.username} · {timeAgo(c.latest.at)}</div>
              </>
            ) : "No threads yet"}
          </div>
          <div className="text-sm tabular-nums text-white/50 w-16 text-right shrink-0">{c.thread_count} <span className="text-white/30">thr.</span></div>
        </button>
      ))}
    </div>
  );
}

function ForumThreads({ slug, page, navigate, timeAgo }: Props & { slug: string; page: number }) {
  const { data, error, reload } = useLoad<{ category: Category; threads: ThreadSummary[]; page: number; pages: number }>(
    () => APIClient.getForumThreads(slug, page), [slug, page]);
  if (!data) return <Status error={error} retry={reload} />;
  const user = me();
  const canStart = !!user && (!data.category.staff_only || !!user.is_admin);
  return (
    <div>
      <Crumbs items={[["Forums", { page: "forums" }], [data.category.name, null]]} navigate={navigate} />
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-2xl font-semibold text-white">{data.category.name}</h3>
          <p className="text-sm text-white/50">{data.category.description}</p>
        </div>
        {canStart
          ? <PrimaryButton onClick={() => navigate({ page: "compose", slug })}><PenLine size={16} /> New thread</PrimaryButton>
          : !user && <span className="text-xs text-white/40 mt-2">Sign in to post</span>}
      </div>
      {data.threads.length === 0 ? (
        <p className="py-10 text-center text-white/40">No threads yet. Start the first one.</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/5 overflow-hidden">
          {data.threads.map(t => (
            <li key={t.id}>
              <button
                onClick={() => navigate({ page: "thread", slug, id: t.id, p: 1 })}
                className="w-full text-left flex items-center gap-3 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-medium text-white">
                    {t.pinned && <Pin size={14} aria-label="Pinned" style={{ color: "var(--pl-accent-primary)" }} />}
                    {t.locked && <Lock size={14} aria-label="Locked" className="text-white/40" />}
                    <span className="truncate">{t.title}</span>
                  </div>
                  <div className="text-xs text-white/45">by {t.author.username}</div>
                </div>
                <div className="text-xs text-white/45 text-right shrink-0">
                  <div className="tabular-nums">{t.post_count - 1} {t.post_count - 1 === 1 ? "reply" : "replies"}</div>
                  <div>{timeAgo(t.last_post_at)}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={data.page} pages={data.pages} go={p => navigate({ page: "forum", slug, p })} />
    </div>
  );
}

function ThreadView({ slug, id, page, navigate, onPlayerClick, timeAgo }: Props & { slug: string; id: number; page: number }) {
  const { data, error, reload } = useLoad<ThreadPage>(() => APIClient.getForumThread(id, page), [id, page]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!data) return <Status error={error} retry={reload} />;
  const user = me();
  const admin = !!user?.is_admin;

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      after?.();
      reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Crumbs items={[["Forums", { page: "forums" }], [data.category.name, { page: "forum", slug: data.category.slug, p: 1 }], [data.thread.title, null]]} navigate={navigate} />
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-2xl font-semibold text-white break-words flex items-center gap-2">
          {data.thread.pinned && <Pin size={18} aria-label="Pinned" style={{ color: "var(--pl-accent-primary)" }} />}
          {data.thread.locked && <Lock size={18} aria-label="Locked" className="text-white/40" />}
          {data.thread.title}
        </h3>
        {admin && (
          <div className="flex gap-2 shrink-0">
            <button disabled={busy} className="px-3 py-1.5 rounded-lg bg-white/5 text-xs" onClick={() => act(() => APIClient.moderateForumThread(id, { pinned: !data.thread.pinned }))}>
              {data.thread.pinned ? "Unpin" : "Pin"}
            </button>
            <button disabled={busy} className="px-3 py-1.5 rounded-lg bg-white/5 text-xs" onClick={() => act(() => APIClient.moderateForumThread(id, { locked: !data.thread.locked }))}>
              {data.thread.locked ? "Unlock" : "Lock"}
            </button>
          </div>
        )}
      </div>
      {notice && <p role="alert" className="mb-3 text-sm" style={{ color: "var(--pl-state-danger)" }}>{notice}</p>}

      <ol className="space-y-3">
        {data.posts.map(post => {
          const own = user?.id === post.author.id;
          const canEdit = !post.deleted && (admin || (own && Date.now() - new Date(post.created_at).getTime() < EDIT_WINDOW_MS));
          const canDelete = !post.deleted && (admin || own);
          return (
            <li key={post.id} className="flex gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <Avatar author={post.author} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm mb-1.5 flex-wrap">
                  <Name author={post.author} onPlayerClick={onPlayerClick} />
                  <span className="text-white/35">· {timeAgo(post.created_at)}{post.edited_at && " · edited"}</span>
                  <span className="ml-auto flex gap-1">
                    {canEdit && editing !== post.id && (
                      <button aria-label="Edit post" className="p-1.5 rounded-lg hover:bg-white/10 text-white/50" onClick={() => setEditing(post.id)}><Pencil size={14} /></button>
                    )}
                    {canDelete && (
                      <button aria-label="Delete post" disabled={busy} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"
                        onClick={() => act(() => APIClient.deleteForumPost(post.id), () => {
                          if (post.id === data.posts[0]?.id && page === 1) navigate({ page: "forum", slug: data.category.slug, p: 1 });
                        })}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </span>
                </div>
                {post.deleted ? (
                  <p className="italic text-white/35">This post was deleted.</p>
                ) : editing === post.id ? (
                  <Editor
                    initial={post.body}
                    submitLabel="Save"
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSubmit={body => act(() => APIClient.editForumPost(post.id, body), () => setEditing(null))}
                  />
                ) : (
                  <div className="text-white/85 text-[15px]"><Markdown source={post.body} /></div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <Pager page={data.page} pages={data.pages} go={p => navigate({ page: "thread", slug, id, p })} />

      <div className="mt-6">
        {!user ? (
          <p className="text-sm text-white/45 text-center">Sign in to reply.</p>
        ) : data.thread.locked && !admin ? (
          <p className="text-sm text-white/45 text-center flex items-center justify-center gap-2"><Lock size={14} /> This thread is locked.</p>
        ) : (
          <Editor
            key={`reply-${data.thread.post_count}`}
            submitLabel="Reply"
            busy={busy}
            onSubmit={body => act(() => APIClient.replyForumThread(id, body), () => {
              // Show the new reply: it is on the last page.
              const last = Math.ceil((data.thread.post_count + 1) / 20);
              if (last !== page) navigate({ page: "thread", slug, id, p: last });
            })}
          />
        )}
      </div>
    </div>
  );
}

function Compose({ slug, navigate }: Props & { slug: string }) {
  const { data: forums } = useLoad<{ categories: Category[] }>(() => APIClient.getForums(), []);
  const name = forums?.categories.find(c => c.slug === slug)?.name ?? slug;
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = me();
  if (!user) return <p className="py-10 text-center text-white/50">Sign in to start a thread.</p>;
  return (
    <div>
      <Crumbs items={[["Forums", { page: "forums" }], [name, { page: "forum", slug, p: 1 }], ["New thread", null]]} navigate={navigate} />
      <label className="block text-sm font-semibold text-white/70 mb-1.5" htmlFor="thread-title">Title</label>
      <input
        id="thread-title"
        value={title}
        maxLength={TITLE_MAX}
        onChange={e => setTitle(e.target.value)}
        className="w-full mb-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white outline-none focus:border-white/30"
        placeholder="What is it about?"
      />
      {error && <p role="alert" className="mb-3 text-sm" style={{ color: "var(--pl-state-danger)" }}>{error}</p>}
      <Editor
        submitLabel="Post thread"
        busy={busy}
        disabled={title.trim().length < 3}
        onCancel={() => navigate({ page: "forum", slug, p: 1 })}
        onSubmit={async body => {
          setBusy(true);
          setError(null);
          try {
            const created = await APIClient.createForumThread(slug, title, body);
            navigate({ page: "thread", slug, id: created.thread.id, p: 1 });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

/** A textarea with a live preview and the length limit shown. */
function Editor({ initial = "", submitLabel, busy, disabled, onSubmit, onCancel }: {
  initial?: string; submitLabel: string; busy: boolean; disabled?: boolean;
  onSubmit: (body: string) => void; onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [preview, setPreview] = useState(false);
  const empty = body.trim().length === 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      {preview ? (
        <div className="min-h-[120px] px-2 py-1 text-white/85 text-[15px]">{empty ? <p className="text-white/35">Nothing to preview.</p> : <Markdown source={body} />}</div>
      ) : (
        <textarea
          aria-label="Post"
          value={body}
          maxLength={BODY_MAX}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !empty && !busy && !disabled) onSubmit(body); }}
          rows={5}
          className="w-full min-h-[120px] resize-y bg-transparent text-white outline-none px-2 py-1"
          placeholder="Write something… **bold**, *italic*, `code`, > quote, links"
        />
      )}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button type="button" onClick={() => setPreview(p => !p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:bg-white/10">
          {preview ? <><PenLine size={14} /> Write</> : <><Eye size={14} /> Preview</>}
        </button>
        <span className="text-xs text-white/30 tabular-nums">{body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}</span>
        <span className="ml-auto flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-white/60 hover:bg-white/10">Cancel</button>}
          <PrimaryButton disabled={empty || busy || disabled} onClick={() => onSubmit(body)}>{submitLabel}</PrimaryButton>
        </span>
      </div>
    </div>
  );
}
