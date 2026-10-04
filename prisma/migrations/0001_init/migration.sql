-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'PLUS');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('NONE', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PlanSource" AS ENUM ('PROVIDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('PERIOD', 'CRON');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('NEW', 'UP', 'DOWN', 'PAUSED');

-- CreateEnum
CREATE TYPE "PingKind" AS ENUM ('SUCCESS', 'START', 'FAIL');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('EMAIL', 'TELEGRAM', 'SLACK', 'DISCORD', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "IncidentReason" AS ENUM ('MISSED', 'FAIL', 'NEVER');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('DOWN', 'RECOVERED', 'REMINDER');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "NoticeLevel" AS ENUM ('INFO', 'DEGRADED', 'OUTAGE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "github_id" TEXT,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "plan_status" "PlanStatus" NOT NULL DEFAULT 'NONE',
    "plan_source" "PlanSource" NOT NULL DEFAULT 'PROVIDER',
    "admin_plan_until" TIMESTAMPTZ(3),
    "billing_interval" "BillingInterval",
    "billing_customer_id" TEXT,
    "billing_subscription_id" TEXT,
    "plan_renews_at" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "past_due_since" TIMESTAMPTZ(3),
    "founding" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "disabled_at" TIMESTAMPTZ(3),
    "disabled_reason" TEXT,
    "quiet_start" INTEGER,
    "quiet_end" INTEGER,
    "marketing_emails" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "admin_auth_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id_hash")
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "ping_uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "schedule_type" "ScheduleType" NOT NULL,
    "period_seconds" INTEGER,
    "cron_expr" VARCHAR(100),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "grace_seconds" INTEGER NOT NULL DEFAULT 300,
    "first_ping_deadline_seconds" INTEGER NOT NULL DEFAULT 86400,
    "fail_threshold" INTEGER NOT NULL DEFAULT 1,
    "consecutive_fails" INTEGER NOT NULL DEFAULT 0,
    "max_runtime_seconds" INTEGER,
    "reminder_interval_seconds" INTEGER,
    "status" "CheckStatus" NOT NULL DEFAULT 'NEW',
    "last_ping_at" TIMESTAMPTZ(3),
    "last_start_at" TIMESTAMPTZ(3),
    "last_run_id" TEXT,
    "last_duration_ms" INTEGER,
    "next_expected_at" TIMESTAMPTZ(3),
    "alert_after" TIMESTAMPTZ(3),
    "down_since" TIMESTAMPTZ(3),
    "muted_until" TIMESTAMPTZ(3),
    "ping_count" INTEGER NOT NULL DEFAULT 0,
    "paused_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pings" (
    "id" BIGSERIAL NOT NULL,
    "check_id" UUID NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "PingKind" NOT NULL,
    "run_id" TEXT,
    "exit_code" INTEGER,
    "duration_ms" INTEGER,
    "body" VARCHAR(256),

    CONSTRAINT "pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "ChannelType" NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "target_enc" TEXT NOT NULL,
    "signing_secret" TEXT,
    "verified_at" TIMESTAMPTZ(3),
    "verify_token_hash" TEXT,
    "verify_expires_at" TIMESTAMPTZ(3),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "disabled_at" TIMESTAMPTZ(3),
    "disabled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_channels" (
    "check_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,

    CONSTRAINT "check_channels_pkey" PRIMARY KEY ("check_id","channel_id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "reason" "IncidentReason" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by" TEXT,
    "last_reminder_at" TIMESTAMPTZ(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" BIGSERIAL NOT NULL,
    "incident_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "check_name" TEXT NOT NULL,
    "reason" "IncidentReason" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_daily" (
    "user_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "emails_sent" INTEGER NOT NULL DEFAULT 0,
    "webhooks_sent" INTEGER NOT NULL DEFAULT 0,
    "tests_sent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "global_usage_daily" (
    "day" VARCHAR(10) NOT NULL,
    "emails_sent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "global_usage_daily_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "target_user_id" UUID,
    "event" TEXT NOT NULL,
    "ip_hash" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" UUID,
    "payload" JSONB,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "level" "NoticeLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "status_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_state" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_state_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE INDEX "users_plan_plan_status_idx" ON "users"("plan", "plan_status");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "login_tokens_email_created_at_idx" ON "login_tokens"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "checks_ping_uuid_key" ON "checks"("ping_uuid");

-- CreateIndex
CREATE INDEX "checks_user_id_idx" ON "checks"("user_id");

-- CreateIndex
CREATE INDEX "pings_check_id_ts_idx" ON "pings"("check_id", "ts" DESC);

-- CreateIndex
CREATE INDEX "channels_user_id_idx" ON "channels"("user_id");

-- CreateIndex
CREATE INDEX "incidents_check_id_started_at_idx" ON "incidents"("check_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "alerts_incident_id_channel_id_kind_seq_key" ON "alerts"("incident_id", "channel_id", "kind", "seq");

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_target_user_id_created_at_idx" ON "audit_log"("target_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "analytics_events_name_created_at_idx" ON "analytics_events"("name", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pings" ADD CONSTRAINT "pings_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_channels" ADD CONSTRAINT "check_channels_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_channels" ADD CONSTRAINT "check_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

