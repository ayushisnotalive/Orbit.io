import { prisma } from '../db/client.js';
import { computeNextExpected } from './schedule.js';
import { checkRateLimit, recordNegativeCache } from '../security/ratelimit.js';
import { PLANS, getEffectivePlan } from '../config/plans.js';
import { CONSTANTS } from '../config/constants.js';
import { AppError } from '../lib/errors.js';

export type PingKind = 'SUCCESS' | 'START' | 'FAIL';

export interface HandlePingOptions {
  ip?: string;
  runId?: string | null;
  exitCode?: number | null;
  body?: string | null;
  msg?: string | null;
  now?: Date;
}

export interface PingResult {
  ok: boolean;
  status: number;
  action: 'recorded' | 'min_gap_ignored' | 'ignored';
  checkId?: string;
  durationMs?: number | null;
  consecutiveFails?: number;
}

/**
 * Core transactional ping ingestion domain handler.
 * Performs a single read and a single atomic transaction (or zero writes on min-gap / pause / disabled).
 */
export async function handlePing(
  pingUuid: string,
  kind: PingKind,
  options: HandlePingOptions = {},
): Promise<PingResult> {
  const now = options.now || new Date();

  // 1. Single database read: lookup check with owner user
  const check = await prisma.check.findUnique({
    where: { pingUuid },
    include: {
      user: true,
    },
  });

  if (!check) {
    recordNegativeCache(pingUuid);
    throw new AppError('not_found', 'Check not found', 404);
  }

  // 2. Silent no-op for disabled accounts or paused checks (D-03, D-07)
  if (check.user.disabledAt !== null) {
    return { ok: true, status: 200, action: 'ignored', checkId: check.id };
  }
  if (check.status === 'PAUSED') {
    return { ok: true, status: 200, action: 'ignored', checkId: check.id };
  }

  // 3. START ping handling (D-09)
  if (kind === 'START') {
    const rl = checkRateLimit(
      `start:${check.id}`,
      1,
      CONSTANTS.PING_START_RATE_LIMIT_SECONDS,
    );
    if (!rl.allowed) {
      throw new AppError('rate_limited', 'Start ping rate limit exceeded (1 per 5s)', 429);
    }

    await prisma.$transaction(async (tx) => {
      await tx.ping.create({
        data: {
          checkId: check.id,
          kind: 'START',
          runId: options.runId || null,
          ts: now,
        },
      });

      await tx.check.update({
        where: { id: check.id },
        data: {
          lastStartAt: now,
          lastRunId: options.runId || null,
        },
      });
    });

    return { ok: true, status: 200, action: 'recorded', checkId: check.id };
  }

  // 4. Duration resolution hierarchy (D-10)
  let durationMs: number | null = null;
  if (options.runId) {
    const startPing = await prisma.ping.findFirst({
      where: {
        checkId: check.id,
        kind: 'START',
        runId: options.runId,
      },
      orderBy: { ts: 'desc' },
    });
    if (startPing) {
      durationMs = Math.max(0, now.getTime() - startPing.ts.getTime());
    }
  }

  if (durationMs === null && check.lastStartAt) {
    const elapsed = now.getTime() - check.lastStartAt.getTime();
    // Cap reasonable window to 24 hours
    if (elapsed >= 0 && elapsed <= 86400 * 1000) {
      durationMs = elapsed;
    }
  }

  // 5. SUCCESS ping handling (D-11, D-12)
  if (kind === 'SUCCESS') {
    // Check subscription plan min-gap
    const effectivePlan = getEffectivePlan(check.user);
    const minGapSec = PLANS[effectivePlan].minGapSec;

    if (check.lastPingAt) {
      const diffSec = (now.getTime() - check.lastPingAt.getTime()) / 1000;
      if (diffSec < minGapSec) {
        return {
          ok: true,
          status: 200,
          action: 'min_gap_ignored',
          checkId: check.id,
          durationMs,
        };
      }
    }

    // Recalculate schedule deadline
    const schedule = computeNextExpected({
      type: check.scheduleType,
      cron: check.cronExpr,
      periodSeconds: check.periodSeconds,
      timezone: check.timezone,
      graceSeconds: check.graceSeconds,
      referenceDate: now,
      currentExpectedAt: check.nextExpectedAt,
    });

    await prisma.$transaction(async (tx) => {
      // Insert SUCCESS ping row
      await tx.ping.create({
        data: {
          checkId: check.id,
          kind: 'SUCCESS',
          exitCode: 0,
          durationMs,
          ts: now,
        },
      });

      // Check and resolve any open incident
      const openIncident = await tx.incident.findFirst({
        where: { checkId: check.id, resolvedAt: null },
      });

      if (openIncident) {
        await tx.incident.update({
          where: { id: openIncident.id },
          data: {
            resolvedAt: now,
            resolvedBy: 'ping',
          },
        });

        // Stage RECOVERED alerts for verified active channels
        const checkChannels = await tx.checkChannel.findMany({
          where: { checkId: check.id },
          include: { channel: true },
        });

        const activeChannels = checkChannels
          .map((cc) => cc.channel)
          .filter((c) => c.verifiedAt !== null && c.disabledAt === null);

        if (activeChannels.length > 0) {
          await tx.alert.createMany({
            data: activeChannels.map((c) => ({
              incidentId: openIncident.id,
              channelId: c.id,
              kind: 'RECOVERED',
              checkName: check.name,
              reason: openIncident.reason,
              nextAttemptAt: now,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Update check
      await tx.check.update({
        where: { id: check.id },
        data: {
          status: 'UP',
          downSince: null,
          consecutiveFails: 0,
          lastPingAt: now,
          lastDurationMs: durationMs ?? check.lastDurationMs,
          pingCount: { increment: 1 },
          nextExpectedAt: schedule.nextExpectedAt,
          alertAfter: schedule.alertAfter,
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    return {
      ok: true,
      status: 200,
      action: 'recorded',
      checkId: check.id,
      durationMs,
      consecutiveFails: 0,
    };
  }

  // 6. FAIL ping handling (D-13)
  let bodyText: string | null = null;
  if (options.body && options.body.trim().length > 0) {
    bodyText = options.body.slice(0, 256);
  } else if (options.msg && options.msg.trim().length > 0) {
    bodyText = options.msg.slice(0, 100);
  }

  const exitCode = options.exitCode ?? 1;
  const newConsecutiveFails = check.consecutiveFails + 1;
  const shouldEscalate = newConsecutiveFails >= check.failThreshold && check.status !== 'DOWN';

  await prisma.$transaction(async (tx) => {
    // Insert FAIL ping row
    await tx.ping.create({
      data: {
        checkId: check.id,
        kind: 'FAIL',
        exitCode,
        durationMs,
        body: bodyText,
        ts: now,
      },
    });

    if (shouldEscalate) {
      await tx.check.update({
        where: { id: check.id },
        data: {
          status: 'DOWN',
          downSince: now,
          consecutiveFails: newConsecutiveFails,
          lastDurationMs: durationMs ?? check.lastDurationMs,
        },
      });

      // Create open incident if not already present
      let incident = await tx.incident.findFirst({
        where: { checkId: check.id, resolvedAt: null },
      });
      if (!incident) {
        incident = await tx.incident.create({
          data: {
            checkId: check.id,
            reason: 'FAIL',
            startedAt: now,
          },
        });
      }

      // Stage DOWN alerts for verified active channels
      const checkChannels = await tx.checkChannel.findMany({
        where: { checkId: check.id },
        include: { channel: true },
      });

      const activeChannels = checkChannels
        .map((cc) => cc.channel)
        .filter((c) => c.verifiedAt !== null && c.disabledAt === null);

      if (activeChannels.length > 0) {
        await tx.alert.createMany({
          data: activeChannels.map((c) => ({
            incidentId: incident.id,
            channelId: c.id,
            kind: 'DOWN',
            checkName: check.name,
            reason: 'FAIL',
            nextAttemptAt: now,
          })),
          skipDuplicates: true,
        });
      }
    } else {
      await tx.check.update({
        where: { id: check.id },
        data: {
          consecutiveFails: newConsecutiveFails,
          lastDurationMs: durationMs ?? check.lastDurationMs,
        },
      });
    }
  }, { maxWait: 10000, timeout: 20000 });

  return {
    ok: true,
    status: 200,
    action: 'recorded',
    checkId: check.id,
    durationMs,
    consecutiveFails: newConsecutiveFails,
  };
}
