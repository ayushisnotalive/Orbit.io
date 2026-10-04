import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';

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
 * Advisory lock ID for scanner execution.
 * Fixed constant ensures only one scanner runs across all instances.
 */
const SCANNER_LOCK_ID = 1234567890;

/**
 * Runs the atomic scanner CTE query that identifies overdue checks,
 * marks them DOWN, creates incidents, and stages alerts for delivery.
 *
 * Protected by PostgreSQL advisory lock to ensure single-instance execution
 * across multiple containers or processes.
 *
 * @param now - Reference timestamp for scan (defaults to current time)
 * @returns Scan result metrics
 */
export async function runScan(now: Date = new Date()): Promise<ScanResult> {
  const startTime = Date.now();

  try {
    // Use a transaction to hold advisory lock across entire scan
    const result = await prisma.$transaction(async (tx) => {
      // Try to acquire advisory lock (transaction-level using xact variant)
      const lockResult = await tx.$queryRaw<[{ pg_try_advisory_xact_lock: boolean }]>`
        SELECT pg_try_advisory_xact_lock(${SCANNER_LOCK_ID})
      `;
      const lockAcquired = lockResult[0].pg_try_advisory_xact_lock;

      if (!lockAcquired) {
        logger.debug({ event: 'scanner.skip', reason: 'lock_held' });
        // Return special marker to indicate lock not acquired
        return null;
      }

      logger.info({ event: 'scanner.start', timestamp: now.toISOString() });

      // Execute atomic scanner CTE within the transaction
      // Lock will be automatically released when transaction commits
      const cteResult = await executeScannerCTE(now, tx);

      // Record last scan timestamp in system_state table
      await tx.systemState.upsert({
        where: { key: 'last_scan_at' },
        update: { value: now.toISOString() },
        create: { key: 'last_scan_at', value: now.toISOString() },
      });

      return cteResult;
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    // Check if lock was not acquired
    if (result === null) {
      return {
        checksMarkedDown: 0,
        incidentsOpened: 0,
        alertsStaged: 0,
        durationMs: 0, // Indicate scan was skipped
      };
    }

    const durationMs = Date.now() - startTime;

    logger.info({
      event: 'scanner.complete',
      ...result,
      durationMs,
    });

    return {
      ...result,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error({
      event: 'scanner.failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    // Return zero metrics on failure (don't throw)
    return {
      checksMarkedDown: 0,
      incidentsOpened: 0,
      alertsStaged: 0,
      durationMs,
    };
  }
}

/**
 * Executes the atomic CTE query that:
 * 1. Identifies due checks (missed pings or never-pinged)
 * 2. Marks them DOWN
 * 3. Creates incidents
 * 4. Stages alerts for verified, active channels
 *
 * All operations execute within a single atomic transaction.
 */
async function executeScannerCTE(
  now: Date,
  tx: Prisma.TransactionClient = prisma
): Promise<Omit<ScanResult, 'durationMs'>> {
  // Execute the scanner CTE as a single atomic operation
  const result = await tx.$queryRaw<
    Array<{
      check_id: string;
      incident_id: string;
      alerts_staged: bigint;
    }>
  >`
    WITH due_checks AS (
      -- Step 1: Identify checks that are overdue or never pinged
      SELECT 
        c.id,
        c.user_id,
        c.name,
        c.status as old_status,
        CASE 
          WHEN c.status = 'NEW' THEN 'NEVER'
          ELSE 'MISSED'
        END as incident_reason
      FROM checks c
      INNER JOIN users u ON c.user_id = u.id
      WHERE u.disabled_at IS NULL
        AND c.status != 'PAUSED'
        AND (c.muted_until IS NULL OR c.muted_until < ${now})
        AND (
          -- Missed ping: was UP, now past alertAfter deadline
          (c.status = 'UP' AND c.alert_after IS NOT NULL AND c.alert_after <= ${now})
          OR
          -- Never pinged: still NEW, past first-ping deadline
          (c.status = 'NEW' 
           AND c.next_expected_at IS NOT NULL
           AND (c.next_expected_at + (c.first_ping_deadline_seconds || ' seconds')::interval) <= ${now})
        )
      FOR UPDATE OF c  -- Serialize with ping handlers
    ),
    updated_checks AS (
      -- Step 2: Mark due checks as DOWN
      UPDATE checks
      SET 
        status = 'DOWN',
        down_since = CASE 
          WHEN status != 'DOWN' THEN ${now}
          ELSE down_since  -- Keep original down_since if already DOWN
        END,
        updated_at = ${now}
      WHERE id IN (SELECT id FROM due_checks)
      RETURNING id
    ),
    inserted_incidents AS (
      -- Step 3: Create incidents (or reuse open ones)
      INSERT INTO incidents (check_id, reason, started_at)
      SELECT 
        dc.id,
        dc.incident_reason::\"IncidentReason\",
        ${now}
      FROM due_checks dc
      WHERE NOT EXISTS (
        -- Don't create new incident if one is already open
        SELECT 1 FROM incidents i
        WHERE i.check_id = dc.id AND i.resolved_at IS NULL
      )
      ON CONFLICT DO NOTHING
      RETURNING id, check_id
    ),
    open_incidents AS (
      -- Get all open incidents for due checks (newly inserted OR pre-existing)
      -- Use UNION to combine freshly inserted with pre-existing
      SELECT i.id, i.check_id, i.reason, dc.name as check_name
      FROM incidents i
      INNER JOIN due_checks dc ON i.check_id = dc.id
      WHERE i.resolved_at IS NULL
      
      UNION
      
      SELECT ii.id, ii.check_id, dc.incident_reason::"IncidentReason" as reason, dc.name as check_name
      FROM inserted_incidents ii
      INNER JOIN due_checks dc ON dc.id = ii.check_id
    ),
    staged_alerts AS (
      -- Step 4: Stage alerts for verified, active channels
      INSERT INTO alerts (
        incident_id,
        channel_id,
        kind,
        seq,
        check_name,
        reason,
        status,
        next_attempt_at,
        created_at
      )
      SELECT 
        oi.id as incident_id,
        ch.id as channel_id,
        'DOWN'::"AlertKind" as kind,
        0 as seq,
        oi.check_name,
        oi.reason,
        'PENDING'::"AlertStatus" as status,
        ${now} as next_attempt_at,
        ${now} as created_at
      FROM open_incidents oi
      INNER JOIN check_channels cc ON cc.check_id = oi.check_id
      INNER JOIN channels ch ON ch.id = cc.channel_id
      WHERE ch.verified_at IS NOT NULL
        AND ch.disabled_at IS NULL
      ON CONFLICT (incident_id, channel_id, kind, seq) DO NOTHING
      RETURNING id, incident_id, channel_id
    )
    -- Return aggregated counts (include all updated checks, not just those with incidents/alerts)
    SELECT 
      dc.id::text as check_id,
      COALESCE(oi.id::text, 'none') as incident_id,
      COUNT(sa.id) as alerts_staged
    FROM due_checks dc
    LEFT JOIN open_incidents oi ON oi.check_id = dc.id
    LEFT JOIN staged_alerts sa ON sa.incident_id = oi.id
    GROUP BY dc.id, oi.id
  `;

  // Aggregate results
  const checksMarkedDown = new Set(result.map((r) => r.check_id)).size;
  const incidentsOpened = new Set(
    result.filter((r) => r.incident_id !== 'none').map((r) => r.incident_id)
  ).size;
  const alertsStaged = result.reduce((sum, r) => sum + Number(r.alerts_staged), 0);

  return {
    checksMarkedDown,
    incidentsOpened,
    alertsStaged,
  };
}
