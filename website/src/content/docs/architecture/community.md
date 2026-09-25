---
title: Community hub
description: The design for an osu!-style community hub — news, forums, rankings, player pages and a replay gallery — its data model, API, moderation and rollout.
sidebar:
  order: 8
---

Roadmap item P3.2. First slice (forums and the hub layout) ships in 0.3.0.

## Why a community hub

osu! is the clearest example in the genre of a game whose website is part of
the game. Its news posts, forums, rankings, detailed player pages and shared
content give players reasons to return between sessions and to bring friends.
TETR.IO follows the same pattern with player profiles and league pages.
Retention in competitive games comes from identity (my profile, my rank, my
replays), progress (seasons, ranks) and belonging (forums, events). The match
itself is only part of it.

Today "Community" is a modal with three tabs of statistics. The target is a
real section of the site with shareable links.

## Structure

| Area | Contents | Status |
|---|---|---|
| **Home** | Latest news, recent notable matches (long chains, upsets), active players, links into everything else | 0.3.0 (news + activity) |
| **Forums** | Categories, threads, posts; staff announcements; moderation | **0.3.0** |
| **Rankings** | Per ruleset and season; around-me view; filters by country later | Existing; moves into the hub |
| **Players** | Search; player pages with rating history, recent matches, best chains, medals | Existing search; pages in P3.2 |
| **Replays** | Gallery of notable replays with share links, comments and "watch in game" | P3.2 |
| **News** | Announcements (the staff-only forum category) and release notes (from the changelog) | 0.3.0 |

## Forums: data model

```mermaid
erDiagram
  users ||--o{ forum_threads : starts
  users ||--o{ forum_posts : writes
  forum_categories ||--o{ forum_threads : contains
  forum_threads ||--o{ forum_posts : contains
  forum_categories { int id; text slug; text name; text description; int position; bool staff_only }
  forum_threads { int id; int category_id; int author_id; varchar title; bool pinned; bool locked; bool deleted; int post_count; timestamp last_post_at }
  forum_posts { int id; int thread_id; int author_id; text body; bool deleted; timestamp edited_at }
```

Seeded categories: Announcements (staff only), General, Strategy and Chains,
Help and Feedback, Feature Requests, Off-topic.

## Forums: API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/forums` | Anyone | Categories with thread counts and last activity |
| GET | `/api/forums/:slug/threads?page=` | Anyone | Threads, pinned first, then by last activity |
| POST | `/api/forums/:slug/threads` | Signed in | Start a thread (title + first post) |
| GET | `/api/forums/threads/:id?page=` | Anyone | A thread and a page of posts |
| POST | `/api/forums/threads/:id/posts` | Signed in | Reply (refused if locked) |
| PATCH | `/api/forums/posts/:id` | Author (30 min) or admin | Edit |
| DELETE | `/api/forums/posts/:id` | Author or admin | Soft delete |
| PATCH | `/api/forums/threads/:id` | Admin | Pin, lock |

Rules: titles 3–120 characters, posts 1–10,000; posting is rate-limited per
account; banned accounts cannot post (tokens are already invalidated by bans);
every moderation action writes an audit log row.

## Content safety

Posts are stored as plain text and rendered with a **small, safe Markdown
subset** (bold, italic, inline code, quotes, line breaks and `http(s)` links
opened with `rel="noopener nofollow ugc"`). HTML is escaped before any
formatting is applied, so no markup a user types can reach the page. There are
no images in posts in the first slice.

## Routing and sharing

The hub lives at `/community/…` (for example `/community/forums/strategy/42`).
The client reads the path on load and opens the hub at that place, and the
hosting configuration serves the app for those paths. Links can be shared,
bookmarked and opened in new tabs.

## Later

- Player pages with rating history graphs, medals and a replay list.
- Replay gallery with comments, reactions and "featured" picks.
- Notifications (replies, mentions) and friends.
- Search across threads (PostgreSQL full-text search).
- Reports and a moderation queue in the admin panel.
- Tournaments and events pages.
