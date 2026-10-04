import { prisma } from '../db/client.js';
import { PLANS, type PlanName } from '../config/plans.js';
import { AppError } from '../lib/errors.js';
import type { ChannelType, ScheduleType } from '@prisma/client';

export interface CreateCheckGuardedInput {
  userId: string;
  plan: PlanName;
  name: string;
  scheduleType: ScheduleType;
  periodSeconds?: number | null;
  cronExpr?: string | null;
  timezone?: string;
  graceSeconds?: number;
  firstPingDeadlineSeconds?: number;
}

export interface CreateChannelGuardedInput {
  userId: string;
  plan: PlanName;
  type: ChannelType;
  label: string;
  targetEnc: string;
  signingSecret?: string | null;
}

/**
 * Validates that period/cron schedule adheres to the user's plan granularity.
 */
export function assertPeriodAllowed(
  plan: PlanName,
  periodSeconds: number | null | undefined,
): void {
  if (!periodSeconds) return;
  const minAllowed = PLANS[plan].minPeriodSec;
  if (periodSeconds < minAllowed) {
    throw new AppError(
      'plan_limit_reached',
      `The ${PLANS[plan].name} plan requires a minimum period of ${minAllowed}s (requested: ${periodSeconds}s). Upgrade your plan to monitor faster jobs.`,
      402,
    );
  }
}

/**
 * Race-safe, advisory-locked check insertion enforcing user plan limits atomically.
 */
export async function createCheckGuarded(
  input: CreateCheckGuardedInput,
): Promise<{ id: string; pingUuid: string }> {
  const planLimits = PLANS[input.plan];
  assertPeriodAllowed(input.plan, input.periodSeconds);

  const graceSeconds = input.graceSeconds ?? 300;
  const firstPingDeadlineSeconds = input.firstPingDeadlineSeconds ?? 86400;
  const timezone = input.timezone ?? 'UTC';

  return prisma.$transaction(async (tx) => {
    // Acquire transaction-scoped advisory lock for this user
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.userId}::text))`;

    const result = await tx.$queryRaw<Array<{ id: string; ping_uuid: string }>>`
      INSERT INTO checks (
        user_id, name, schedule_type, period_seconds, cron_expr, timezone,
        grace_seconds, first_ping_deadline_seconds, status, alert_after, updated_at
      )
      SELECT 
        ${input.userId}::uuid, 
        ${input.name}, 
        ${input.scheduleType}::"ScheduleType", 
        ${input.periodSeconds ?? null}, 
        ${input.cronExpr ?? null}, 
        ${timezone},
        ${graceSeconds}, 
        ${firstPingDeadlineSeconds}, 
        'NEW'::"CheckStatus", 
        now() + make_interval(secs => ${firstPingDeadlineSeconds}), 
        now()
      WHERE (SELECT count(*) FROM checks WHERE user_id = ${input.userId}::uuid) < ${planLimits.checks}
      RETURNING id, ping_uuid;
    `;

    if (!result || result.length === 0) {
      throw new AppError(
        'plan_limit_reached',
        `Your ${planLimits.name} plan limit of ${planLimits.checks} checks has been reached. Please upgrade to create more checks.`,
        402,
      );
    }

    return {
      id: result[0].id,
      pingUuid: result[0].ping_uuid,
    };
  });
}

/**
 * Race-safe, advisory-locked channel insertion enforcing user plan limits atomically.
 */
export async function createChannelGuarded(
  input: CreateChannelGuardedInput,
): Promise<{ id: string }> {
  const planLimits = PLANS[input.plan];

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.userId}::text))`;

    const result = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO channels (
        user_id, type, label, target_enc, signing_secret, created_at
      )
      SELECT 
        ${input.userId}::uuid, 
        ${input.type}::"ChannelType", 
        ${input.label}, 
        ${input.targetEnc}, 
        ${input.signingSecret ?? null}, 
        now()
      WHERE (SELECT count(*) FROM channels WHERE user_id = ${input.userId}::uuid) < ${planLimits.channels}
      RETURNING id;
    `;

    if (!result || result.length === 0) {
      throw new AppError(
        'plan_limit_reached',
        `Your ${planLimits.name} plan limit of ${planLimits.channels} alert channels has been reached. Please upgrade to add more channels.`,
        402,
      );
    }

    return {
      id: result[0].id,
    };
  });
}
