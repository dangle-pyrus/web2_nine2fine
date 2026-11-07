-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "auth_method" AS ENUM ('password', 'otp');

-- CreateEnum
CREATE TYPE "token_purpose" AS ENUM ('register', 'login', 'reset_password', 'guest_order_lookup');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('member', 'admin', 'staff');

-- CreateTable
CREATE TABLE "membership_tiers" (
    "membership_tier_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tier_name" VARCHAR(50) NOT NULL,
    "min_spending" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_spending" DECIMAL(12,2),
    "benefits" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "membership_tiers_pkey" PRIMARY KEY ("membership_tier_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "membership_tier_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "phone_number" VARCHAR(20),
    "gender" VARCHAR(20),
    "loyal_points" INTEGER NOT NULL DEFAULT 0,
    "role" "user_role" NOT NULL DEFAULT 'member',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "terms_accepted_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "address_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "recipient_name" VARCHAR(100) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "street" VARCHAR(255) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "auth_action_tokens" (
    "token_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "purpose" "token_purpose" NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(6),
    "invalidated_at" TIMESTAMP(6),

    CONSTRAINT "auth_action_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "email" VARCHAR(255) NOT NULL,
    "device_id" VARCHAR(100) NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("email","device_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" VARCHAR(100) NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "login_method" "auth_method" NOT NULL,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6),
    "revoke_reason" VARCHAR(50),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_tiers_tier_name_key" ON "membership_tiers"("tier_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_auth_tokens_email_purpose" ON "auth_action_tokens"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "idx_sessions_device_id" ON "sessions"("device_id");

-- CreateIndex
CREATE INDEX "idx_sessions_expires_at" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_sessions_user_device" ON "sessions"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

