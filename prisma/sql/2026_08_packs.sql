-- ============================================================================
-- BILNOV — Migration MANUELLE : MODULE PACKS D'ABONNEMENT
-- À appliquer via Codespace :  npx prisma db execute --file prisma/sql/2026_08_packs.sql --schema prisma/schema.prisma
-- Idempotent : peut être ré-exécutée sans casser une base déjà migrée.
-- ============================================================================

-- 1) Gate admin plateforme + capacité/stockage/pack sur les entités existantes
ALTER TABLE "users"          ADD COLUMN IF NOT EXISTS "is_platform_admin"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations"  ADD COLUMN IF NOT EXISTS "storage_bonus_bytes" BIGINT  NOT NULL DEFAULT 0;
ALTER TABLE "organizations"  ADD COLUMN IF NOT EXISTS "pack_id"             TEXT;
ALTER TABLE "subscriptions"  ADD COLUMN IF NOT EXISTS "pack_id"             TEXT;
ALTER TABLE "subscriptions"  ADD COLUMN IF NOT EXISTS "billing_period"      TEXT;
ALTER TABLE "subscriptions"  ADD COLUMN IF NOT EXISTS "current_period_start" TIMESTAMP(3);

-- 2) Types énumérés
DO $$ BEGIN CREATE TYPE "PackStatus"        AS ENUM ('DRAFT','PUBLISHED','SUSPENDED','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PackOptionType"    AS ENUM ('STORAGE','SEAT','GENERIC');                EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PackOptionPeriod"  AS ENUM ('MONTHLY','ANNUAL','ONE_TIME');             EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT','FIXED');                         EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Catalogue des packs
CREATE TABLE IF NOT EXISTS "packs" (
  "id"                  TEXT PRIMARY KEY,
  "slug"                TEXT NOT NULL UNIQUE,
  "name"                TEXT NOT NULL,
  "description"         TEXT,
  "monthly_price_cents" INTEGER NOT NULL DEFAULT 0,
  "annual_price_cents"  INTEGER,
  "currency"            TEXT NOT NULL DEFAULT 'DZD',
  "trial_days"          INTEGER NOT NULL DEFAULT 0,
  "status"              "PackStatus" NOT NULL DEFAULT 'DRAFT',
  "highlighted"         BOOLEAN NOT NULL DEFAULT false,
  "position"            INTEGER NOT NULL DEFAULT 0,
  "max_projects"          INTEGER,
  "max_files_per_project" INTEGER,
  "max_collaborators"     INTEGER,
  "storage_bytes"         BIGINT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4) Catalogue de fonctionnalités (géré par l'admin)
CREATE TABLE IF NOT EXISTS "plan_features" (
  "id"          TEXT PRIMARY KEY,
  "key"         TEXT NOT NULL UNIQUE,
  "label"       TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5) Activation d'une fonctionnalité par pack
CREATE TABLE IF NOT EXISTS "pack_features" (
  "id"          TEXT PRIMARY KEY,
  "pack_id"     TEXT NOT NULL REFERENCES "packs"("id") ON DELETE CASCADE,
  "feature_key" TEXT NOT NULL REFERENCES "plan_features"("key") ON DELETE CASCADE,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "position"    INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("pack_id","feature_key")
);

-- 6) Options à la carte
CREATE TABLE IF NOT EXISTS "pack_options" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        "PackOptionType" NOT NULL DEFAULT 'GENERIC',
  "price_cents" INTEGER NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'DZD',
  "period"      "PackOptionPeriod" NOT NULL DEFAULT 'MONTHLY',
  "unit_bytes"  BIGINT,
  "status"      "PackStatus" NOT NULL DEFAULT 'DRAFT',
  "position"    INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7) Codes promotionnels
CREATE TABLE IF NOT EXISTS "promo_codes" (
  "id"              TEXT PRIMARY KEY,
  "code"            TEXT NOT NULL UNIQUE,
  "description"     TEXT,
  "discount_type"   "PromoDiscountType" NOT NULL,
  "discount_value"  INTEGER NOT NULL,
  "pack_id"         TEXT,
  "max_redemptions" INTEGER,
  "redeemed_count"  INTEGER NOT NULL DEFAULT 0,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "expires_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "pack_features_pack_id_idx"    ON "pack_features"("pack_id");
CREATE INDEX IF NOT EXISTS "packs_status_position_idx"    ON "packs"("status","position");
