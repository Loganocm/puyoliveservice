-- Community forums: categories, threads and posts, with the seeded categories.
-- Generated with `prisma migrate diff`, then made idempotent (IF NOT EXISTS,
-- duplicate_object guards, ON CONFLICT) like 20260925000000, so it is safe on
-- databases created with `prisma db push`.
-- Design: website/src/content/docs/architecture/community.md

CREATE TABLE IF NOT EXISTS "forum_categories" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "staff_only" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "forum_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "forum_threads" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_post_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "forum_posts" (
    "id" SERIAL NOT NULL,
    "thread_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "forum_categories_slug_key" ON "forum_categories"("slug");
CREATE INDEX IF NOT EXISTS "forum_threads_category_id_pinned_last_post_at_idx" ON "forum_threads"("category_id", "pinned", "last_post_at");
CREATE INDEX IF NOT EXISTS "forum_posts_thread_id_created_at_idx" ON "forum_posts"("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "forum_posts_author_id_created_at_idx" ON "forum_posts"("author_id", "created_at");

DO $$ BEGIN
    ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "forum_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "forum_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seeded categories. Existing rows (matched by slug) are left alone, so staff
-- can rename or reorder them without a migration undoing it.
INSERT INTO "forum_categories" ("slug", "name", "description", "position", "staff_only") VALUES
    ('announcements', 'Announcements', 'News and release notes from the Puyo Live team.', 0, true),
    ('general', 'General', 'Anything about Puyo Live and falling-puyo games.', 1, false),
    ('strategy', 'Strategy and Chains', 'Chain forms, GTR and beyond, openers, defence and reading the opponent.', 2, false),
    ('help', 'Help and Feedback', 'Questions, bug reports and what could be better.', 3, false),
    ('ideas', 'Feature Requests', 'What you would like to see next.', 4, false),
    ('off-topic', 'Off-topic', 'Everything else. Be kind.', 5, false)
ON CONFLICT ("slug") DO NOTHING;
