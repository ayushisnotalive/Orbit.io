import { Prisma, Alert } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { PLANS } from '../config/plans.js';
import { env } from '../env.js';
import { getDeliveryAdapter } from './adapters/index.js';
import { decryptTarget } from '../security/crypto.js';

/**
 * Scanner result metrics returned after each scan iteration.
 */
export interface ScanResult {
  checksMarkedDown: number;
  incidentsOpened: number;
  alertsStaged: number;
  durationMs: number;
}

/**
 * Worker configuration interface
 */
export interface WorkerConfig {
  /** Polling interval in milliseconds (default: 10000 = 10s) */
  pollIntervalMs: number;

  /** Lease timeout in seconds (default: 60) */
  leaseTimeoutSeconds: number;

  /** Number of alerts to process per batch (default: 10) */
  batchSize: number;

  /** Maximum retry attempts before giving up (default: 24) */
  maxRetries: number;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  pollIntervalMs: 10000,
  leaseTimeoutSeconds: 60,
  batchSize: 10,
  maxRetries: 24,
};

/**
 * Type for leased alert with full relations
 */
type LeasedAlert = Prisma.AlertGetPayload<{
  include: {
    incident: {
      include: {
        check: {
          include: { user: true };
        };
      };
    };
    channel: true;
  };
}>;

let workerRunning = false;
let shutdownRequested = false;

/**
 * Leases a batch of pending alerts using FOR UPDATE SKIP LOCKED
 *
 * @param config Worker configuration
 * @returns Array of leased alerts with incident, channel, and check relations
 */
async function leaseAlerts(config: WorkerConfig): Promise<LeasedAlert[]> {
  const leaseUntil = new Date(Date.now() + config.leaseTimeoutSeconds * 1000);

  // Atomic lease acquisition with row-level locking
  const leased = await prisma.$queryRaw<Array<{ id: bigint }>>`
    WITH leased_ids AS (
      SELECT id
      FROM alerts
      WHERE status = 'PENDING'
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ${config.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE alerts a
    SET 
      attempts = attempts + 1,
      next_attempt_at = ${leaseUntil}
    FROM leased_ids
    WHERE a.id = leased_ids.id
    RETURNING a.id
  `;

  // Fetch related data for leased alerts
  if (leased.length === 0) return [];

  const alertIds = leased.map((a) => a.id);
  const fullAlerts = await prisma.alert.findMany({
    where: { id: { in: alertIds } },
    include: {
      incident: {
        include: {
          check: {
            include: {
              user: true,
            },
          },
        },
      },
      channel: true,
    },
  });

  return fullAlerts;
}

/**
 * Single poll iteration: lease alerts and process them
 *
 * @param config Worker configuration
 */
export async function pollAndProcessAlerts(config: WorkerConfig): Promise<void> {
  const pollStart = Date.now();

  // Lease a batch of alerts
  const alerts = await leaseAlerts(config);

  if (alerts.length === 0) {
    // Queue empty - log and return
    logger.debug({ event: 'worker.poll', alertsLeased: 0, queueEmpty: true });
    return;
  }

  logger.info({
    event: 'worker.poll',
    alertsLeased: alerts.length,
    alertIds: alerts.map((a) => a.id),
  });

  // Process each alert
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let retry = 0;

  for (const alert of alerts) {
    try {
      const result = await processAlert(alert, config);

      switch (result) {
        case 'sent':
          sent++;
          break;
        case 'failed':
          failed++;
          break;
        case 'suppressed':
          suppressed++;
          break;
        case 'retry':
          retry++;
          break;
      }
    } catch (error) {
      logger.error({
        event: 'worker.alert_error',
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
      failed++;
    }
  }

  const pollDuration = Date.now() - pollStart;

  // Get current queue depth
  const queueDepth = await prisma.alert.count({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: new Date() },
    },
  });

  logger.info({
    event: 'worker.poll_complete',
    alertsLeased: alerts.length,
    alertsSent: sent,
    alertsFailed: failed,
    alertsSuppressed: suppressed,
    alertsRetry: retry,
    queueDepth,
    pollDurationMs: pollDuration,
  });
}

/**
 * Starts the alert worker loop
 *
 * @param config Worker configuration (optional, uses defaults)
 */
export async function startAlertWorker(
  config: WorkerConfig = DEFAULT_WORKER_CONFIG
): Promise<void> {
  if (workerRunning) {
    throw new Error('Alert worker already running');
  }

  workerRunning = true;
  shutdownRequested = false;

  logger.info({
    event: 'worker.start',
    config: {
      pollIntervalMs: config.pollIntervalMs,
      leaseTimeoutSeconds: config.leaseTimeoutSeconds,
      batchSize: config.batchSize,
    },
  });

  // Register shutdown handlers
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);

  // Main polling loop
  while (workerRunning && !shutdownRequested) {
    try {
      await pollAndProcessAlerts(config);
    } catch (error) {
      logger.error({
        event: 'worker.error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    // Wait for next poll interval
    await sleep(config.pollIntervalMs);
  }

  logger.info({ event: 'worker.stopped' });
  workerRunning = false;
}

/**
 * Stops the alert worker gracefully
 */
export async function stopAlertWorker(): Promise<void> {
  if (!workerRunning) {
    return;
  }

  logger.info({ event: 'worker.shutdown_requested' });
  shutdownRequested = true;

  // Wait for current poll to complete (max 30s)
  const timeout = 30000;
  const start = Date.now();
  while (workerRunning && Date.now() - start < timeout) {
    await sleep(100);
  }

  if (workerRunning) {
    logger.warn({ event: 'worker.shutdown_timeout' });
    workerRunning = false;
  }
}

function handleShutdown(signal: string): void {
  logger.info({ event: 'worker.signal_received', signal });
  void stopAlertWorker();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates the next retry delay using exponential backoff
 *
 * Formula: min(60 × 2^attempts, 3600) seconds
 *
 * @param attempts Current attempt count (0-indexed)
 * @returns Delay in seconds before next retry
 *
 * @example
 * calculateBackoffDelay(0) // 60s (1 min)
 * calculateBackoffDelay(1) // 120s (2 min)
 * calculateBackoffDelay(2) // 240s (4 min)
 * calculateBackoffDelay(5) // 1920s (32 min)
 * calculateBackoffDelay(10) // 3600s (60 min, capped)
 */
export function calculateBackoffDelay(attempts: number): number {
  const baseDelay = 60; // 1 minute
  const maxDelay = 3600; // 60 minutes

  const delay = baseDelay * Math.pow(2, attempts);
  return Math.min(delay, maxDelay);
}

/**
 * Determines if an alert should be abandoned based on age
 *
 * @param alert Alert to check
 * @param now Current timestamp
 * @returns True if alert is older than 24 hours
 */
export function shouldGiveUp(alert: Alert, now: Date = new Date()): boolean {
  const GIVE_UP_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  const ageMs = now.getTime() - alert.createdAt.getTime();
  return ageMs > GIVE_UP_THRESHOLD_MS;
}

/**
 * Returns human-readable age string for logging
 */
export function getAlertAge(alert: Alert, now: Date = new Date()): string {
  const ageMs = now.getTime() - alert.createdAt.getTime();
  const ageSeconds = Math.floor(ageMs / 1000);
  const ageMinutes = Math.floor(ageSeconds / 60);
  const ageHours = Math.floor(ageMinutes / 60);

  if (ageHours > 0) {
    return `${ageHours}h ${ageMinutes % 60}m`;
  } else if (ageMinutes > 0) {
    return `${ageMinutes}m`;
  } else {
    return `${ageSeconds}s`;
  }
}

/**
 * Marks an alert as FAILED with reason
 */
async function markAlertFailed(alertId: bigint, reason: string): Promise<void> {
  await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: 'FAILED',
      lastError: reason,
    },
  });

  logger.warn({
    event: 'worker.alert_failed',
    alertId,
    reason,
  });
}

/**
 * Schedules alert retry with exponential backoff
 */
async function scheduleRetry(
  alertId: bigint,
  attempts: number,
  error: string
): Promise<void> {
  const delaySeconds = calculateBackoffDelay(attempts);
  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);

  await prisma.alert.update({
    where: { id: alertId },
    data: {
      nextAttemptAt,
      lastError: error,
    },
  });

  logger.info({
    event: 'worker.alert_retry_scheduled',
    alertId,
    attempts,
    delaySeconds,
    nextAttemptAt: nextAttemptAt.toISOString(),
  });
}

/**
 * Marks alert as successfully SENT
 */
async function markAlertSent(alertId: bigint): Promise<void> {
  await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      lastError: null,
    },
  });

  logger.info({
    event: 'worker.alert_sent',
    alertId,
  });
}

/**
 * Marks an alert as SUPPRESSED with reason
 */
async function markAlertSuppressed(
  alertId: bigint,
  reason: string
): Promise<void> {
  await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: 'SUPPRESSED',
      lastError: reason,
    },
  });

  logger.info({
    event: 'worker.alert_suppressed',
    alertId,
    reason,
  });
}

/**
 * Checks if an alert should be suppressed based on channel/check rules
 *
 * @param alert Alert with channel and check relations
 * @returns Suppression reason if suppressed, null if deliverable
 */
function evaluateSuppression(alert: LeasedAlert): string | null {
  const { channel, incident } = alert;
  const check = incident.check;

  // Rule 1: Channel not verified
  if (!channel.verifiedAt) {
    return 'channel_unverified';
  }

  // Rule 2: Channel disabled
  if (channel.disabledAt) {
    return 'channel_disabled';
  }

  // Rule 3: Check muted
  const now = new Date();
  if (check.mutedUntil && check.mutedUntil > now) {
    return `check_muted_until_${check.mutedUntil.toISOString()}`;
  }

  // Not suppressed
  return null;
}

/**
 * Formats date as YYYY-MM-DD string
 */
function formatDay(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Gets or creates daily usage record for user
 *
 * @param userId User ID
 * @param day Date string in YYYY-MM-DD format
 * @returns Usage record
 */
async function getOrCreateDailyUsage(
  userId: string,
  day: string
): Promise<{ emailsSent: number; webhooksSent: number; testsSent: number }> {
  // Try to find existing record
  let usage = await prisma.usageDaily.findUnique({
    where: {
      userId_day: { userId, day },
    },
  });

  // Create if not exists
  if (!usage) {
    usage = await prisma.usageDaily.create({
      data: {
        userId,
        day,
        emailsSent: 0,
        webhooksSent: 0,
        testsSent: 0,
      },
    });
  }

  return usage;
}

/**
 * Gets or creates global daily usage record
 *
 * @param day Date string in YYYY-MM-DD format
 * @returns Global usage record
 */
async function getOrCreateGlobalUsage(
  day: string
): Promise<{ emailsSent: number }> {
  // Try to find existing record
  let usage = await prisma.globalUsageDaily.findUnique({
    where: { day },
  });

  // Create if not exists
  if (!usage) {
    usage = await prisma.globalUsageDaily.create({
      data: {
        day,
        emailsSent: 0,
      },
    });
  }

  return usage;
}

/**
 * Checks if alert delivery would exceed usage caps
 *
 * @param alert Alert with incident and channel
 * @returns Cap violation reason if exceeded, null if within limits
 */
async function checkUsageCaps(alert: LeasedAlert): Promise<string | null> {
  const { channel, incident } = alert;
  const user = incident.check.user;
  const today = formatDay(new Date());

  // Only check email caps for EMAIL channels
  if (channel.type !== 'EMAIL') {
    return null; // Other channel types don't have caps yet
  }

  // Get user's plan and daily email cap
  const plan = PLANS[user.plan];
  const userCap = plan.emailsPerDay;

  // Get user's usage for today
  const userUsage = await getOrCreateDailyUsage(user.id, today);

  if (userUsage.emailsSent >= userCap) {
    return `usage cap: user_daily_email_cap_${userCap}`;
  }

  // Get global usage cap from config
  const globalCap = env.EMAIL_GLOBAL_DAILY_CAP;

  // Get global usage for today
  const globalUsage = await getOrCreateGlobalUsage(today);

  if (globalUsage.emailsSent >= globalCap) {
    return `usage cap: global_daily_email_cap_${globalCap}`;
  }

  // Within all limits
  return null;
}

/**
 * Increments user daily usage counter
 *
 * @param userId User ID
 * @param day Date string (YYYY-MM-DD)
 * @param field Field to increment (emailsSent, webhooksSent, testsSent)
 */
async function incrementUserUsage(
  userId: string,
  day: string,
  field: 'emailsSent' | 'webhooksSent' | 'testsSent'
): Promise<void> {
  await prisma.usageDaily.upsert({
    where: {
      userId_day: { userId, day },
    },
    update: {
      [field]: { increment: 1 },
    },
    create: {
      userId,
      day,
      [field]: 1,
      // Initialize other fields to 0
      emailsSent: field === 'emailsSent' ? 1 : 0,
      webhooksSent: field === 'webhooksSent' ? 1 : 0,
      testsSent: field === 'testsSent' ? 1 : 0,
    },
  });
}

/**
 * Increments global daily email counter
 *
 * @param day Date string (YYYY-MM-DD)
 */
async function incrementGlobalUsage(day: string): Promise<void> {
  await prisma.globalUsageDaily.upsert({
    where: { day },
    update: {
      emailsSent: { increment: 1 },
    },
    create: {
      day,
      emailsSent: 1,
    },
  });
}

/**
 * Processes a single leased alert
 *
 * @param alert Leased alert with relations
 * @param config Worker configuration
 * @returns Processing result (sent, failed, suppressed, retry)
 */
async function processAlert(
  alert: LeasedAlert,
  _config: WorkerConfig
): Promise<'sent' | 'failed' | 'suppressed' | 'retry'> {
  // Check 1: Give-up threshold
  if (shouldGiveUp(alert)) {
    await markAlertFailed(
      alert.id,
      `Exceeded 24h retry window (age: ${getAlertAge(alert)})`
    );
    return 'failed';
  }

  // Check 2: Suppression rules
  const suppressionReason = evaluateSuppression(alert);
  if (suppressionReason) {
    await markAlertSuppressed(alert.id, suppressionReason);
    return 'suppressed';
  }

  // Check 3: Usage caps
  const capReason = await checkUsageCaps(alert);
  if (capReason) {
    await markAlertSuppressed(alert.id, capReason);
    return 'suppressed';
  }

  // Check 4: Attempt delivery
  try {
    // Get the appropriate delivery adapter for this channel
    const adapter = getDeliveryAdapter(alert.channel.type);

    // Decrypt target before passing to adapter
    const getKey = (keyId: string) => {
      if (keyId === 'v1') return env.ENC_KEY_V1;
      throw new Error(`Unknown key ID: ${keyId}`);
    };

    const plainTarget = decryptTarget(alert.channel.targetEnc, getKey);

    // Prepare delivery context
    const deliveryContext = {
      alert: alert,
      check: alert.incident.check,
      destination: plainTarget, // Plaintext destination
      channel: alert.channel.type,
      attempts: alert.attempts,
    };

    // Attempt delivery
    const result = await adapter.deliver(deliveryContext);

    // Check if delivery succeeded
    if (!result.success) {
      throw new Error(result.error || 'Delivery failed without error message');
    }

    // Success - mark as sent and increment usage
    await markAlertSent(alert.id);

    // Reset channel consecutive failures on successful delivery (CHANM-03)
    await prisma.channel.update({
      where: { id: alert.channel.id },
      data: {
        consecutiveFailures: 0,
        lastError: null,
      },
    }).catch((err) => {
      logger.error({ event: 'worker.channel_reset_failed', error: err });
    });

    // Increment usage counters
    const today = formatDay(new Date());
    const userId = alert.incident.check.user.id;

    if (alert.channel.type === 'EMAIL') {
      await incrementUserUsage(userId, today, 'emailsSent');
      await incrementGlobalUsage(today);
    } else if (alert.channel.type === 'WEBHOOK') {
      await incrementUserUsage(userId, today, 'webhooksSent');
    }

    return 'sent';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn({
      event: 'worker.alert_delivery_failed',
      alertId: alert.id,
      attempts: alert.attempts,
      error: errorMessage,
    });

    // Increment channel consecutive failures and auto-disable after 10 (CHANM-03)
    try {
      const updatedChannel = await prisma.channel.update({
        where: { id: alert.channel.id },
        data: {
          consecutiveFailures: { increment: 1 },
          lastError: errorMessage.slice(0, 255),
        },
        select: { consecutiveFailures: true },
      });

      if (updatedChannel.consecutiveFailures >= 10) {
        await prisma.channel.update({
          where: { id: alert.channel.id },
          data: {
            disabledAt: new Date(),
            disabledReason: 'consecutive_delivery_failures',
          },
        });
        logger.warn({
          event: 'channel.auto_disabled',
          channelId: alert.channel.id,
          consecutiveFailures: updatedChannel.consecutiveFailures,
        });
      }
    } catch (channelErr) {
      logger.error({ event: 'worker.channel_failure_increment_error', error: channelErr });
    }

    // Schedule retry with exponential backoff (attempt 1 uses index 0 = 60s)
    await scheduleRetry(alert.id, Math.max(0, alert.attempts - 1), errorMessage);
    return 'retry';
  }
}
