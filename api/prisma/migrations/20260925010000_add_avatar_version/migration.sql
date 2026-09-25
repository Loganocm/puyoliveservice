-- Version avatars so they can be served by URL and cached indefinitely,
-- instead of being inlined as base64 in every list response.
-- Idempotent: safe on databases created with `prisma db push`.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_updated_at" TIMESTAMP(3);

-- Existing avatars get a version now, so they have a URL straight away.
UPDATE "users" SET "avatar_updated_at" = CURRENT_TIMESTAMP
WHERE "avatar_url" IS NOT NULL AND "avatar_updated_at" IS NULL;
