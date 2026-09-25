-- Moderation tables: bans, audit_logs, login_logs.
--
-- These three models have been in schema.prisma since the admin panel was
-- added, but no migration ever created them. Production builds its schema only
-- through `prisma migrate deploy` (api/entrypoint.sh), so on a database built
-- from migrations the tables did not exist: bans could not be created or
-- enforced, the audit log and login log silently failed, and the ban check at
-- login was wrapped in a catch-all to hide the missing table.
--
-- The SQL is exactly `prisma migrate diff --from-migrations --to-schema-datamodel`
-- made idempotent, because a database that was ever touched by `prisma db push`
-- may already have some or all of these objects. Every statement is a no-op if
-- its object exists, so this is safe on both kinds of database.
--
-- See website/src/content/docs/review/findings.md (API-01).

-- CreateTable
CREATE TABLE IF NOT EXISTS "bans" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "ip_address" TEXT,
    "reason" TEXT NOT NULL,
    "banned_by" INTEGER,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" INTEGER,
    "target_ip" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "login_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ip_address" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bans_ip_address_idx" ON "bans"("ip_address");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "login_logs_ip_address_idx" ON "login_logs"("ip_address");

-- AddForeignKey (Postgres has no ADD CONSTRAINT IF NOT EXISTS)
DO $$ BEGIN
    ALTER TABLE "bans" ADD CONSTRAINT "bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
