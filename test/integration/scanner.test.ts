import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { runScan } from '../../src/domain/scanner.js';

describe('Scanner: Core CTE & Advisory Lock', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.alert.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.ping.deleteMany();
    await prisma.checkChannel.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.check.deleteMany();
    await prisma.user.deleteMany();

    // Release any lingering advisory locks
    await prisma.$executeRaw`SELECT pg_advisory_unlock_all()`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Missed Ping Detection', () => {
    it('should mark UP check as DOWN when alertAfter is in the past', async () => {
      // Create user and check
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      const check = await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Test Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
          lastPingAt: new Date(now.getTime() - 70 * 60 * 1000), // 70 minutes ago
        },
      });

      // Run scanner
      const result = await runScan(now);

      // Verify results
      expect(result.checksMarkedDown).toBe(1);
      expect(result.incidentsOpened).toBe(1);

      // Verify check status
      const updatedCheck = await prisma.check.findUnique({
        where: { id: check.id },
      });
      expect(updatedCheck?.status).toBe('DOWN');
      expect(updatedCheck?.downSince).toBeTruthy();

      // Verify incident created
      const incidents = await prisma.incident.findMany({
        where: { checkId: check.id },
      });
      expect(incidents).toHaveLength(1);
      expect(incidents[0].reason).toBe('MISSED');
      expect(incidents[0].resolvedAt).toBeNull();
    });

    it('should not mark DOWN check as DOWN again (already down)', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test2@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const downSince = new Date(now.getTime() - 10 * 60 * 1000);
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Already Down Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'DOWN',
          downSince,
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const result = await runScan(now);

      // Scanner filters only UP checks, so already-DOWN checks are not processed
      expect(result.checksMarkedDown).toBe(0);
    });
  });

  describe('Never Pinged Detection', () => {
    it('should mark NEW check as DOWN when past first-ping deadline', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test3@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const nextExpectedAt = new Date(now.getTime() - 25 * 3600 * 1000); // 25 hours ago
      const firstPingDeadlineSeconds = 86400; // 24 hours

      const check = await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Never Pinged Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          firstPingDeadlineSeconds,
          status: 'NEW',
          nextExpectedAt,
          alertAfter: new Date(nextExpectedAt.getTime() + 300 * 1000),
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(1);
      expect(result.incidentsOpened).toBe(1);

      const updatedCheck = await prisma.check.findUnique({
        where: { id: check.id },
      });
      expect(updatedCheck?.status).toBe('DOWN');

      const incidents = await prisma.incident.findMany({
        where: { checkId: check.id },
      });
      expect(incidents).toHaveLength(1);
      expect(incidents[0].reason).toBe('NEVER');
    });

    it('should not mark NEW check as DOWN when within first-ping deadline', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test4@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const nextExpectedAt = new Date(now.getTime() - 20 * 3600 * 1000); // 20 hours ago
      const firstPingDeadlineSeconds = 86400; // 24 hours

      await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Within Deadline Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          firstPingDeadlineSeconds,
          status: 'NEW',
          nextExpectedAt,
          alertAfter: new Date(nextExpectedAt.getTime() + 300 * 1000),
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(0);
      expect(result.incidentsOpened).toBe(0);
    });
  });

  describe('Filter Rules', () => {
    it('should exclude PAUSED checks from scan', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test5@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Paused Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'PAUSED',
          pausedAt: new Date(),
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(0);
    });

    it('should exclude checks with muted_until in future', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test6@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);
      const mutedUntil = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour in future

      await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Muted Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          mutedUntil,
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(0);
    });

    it('should exclude checks belonging to disabled users', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test7@example.com',
          plan: 'FREE',
          disabledAt: new Date(),
          disabledReason: 'Testing',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Disabled User Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(0);
    });
  });

  describe('Alert Staging', () => {
    it('should stage alerts for verified, active channels', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test8@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      const check = await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Check with Channels',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const verifiedChannel = await prisma.channel.create({
        data: {
          userId: user.id,
          type: 'EMAIL',
          label: 'Verified Email',
          targetEnc: 'encrypted-target',
          verifiedAt: new Date(),
        },
      });

      await prisma.checkChannel.create({
        data: {
          checkId: check.id,
          channelId: verifiedChannel.id,
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(1);
      expect(result.incidentsOpened).toBe(1);
      expect(result.alertsStaged).toBe(1);

      const alerts = await prisma.alert.findMany({
        where: {
          incident: {
            checkId: check.id,
          },
        },
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].kind).toBe('DOWN');
      expect(alerts[0].status).toBe('PENDING');
      expect(alerts[0].seq).toBe(0);
      expect(alerts[0].channelId).toBe(verifiedChannel.id);
    });

    it('should not stage alerts for unverified channels', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test9@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      const check = await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Check with Unverified Channel',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const unverifiedChannel = await prisma.channel.create({
        data: {
          userId: user.id,
          type: 'EMAIL',
          label: 'Unverified Email',
          targetEnc: 'encrypted-target',
          verifiedAt: null, // Not verified
        },
      });

      await prisma.checkChannel.create({
        data: {
          checkId: check.id,
          channelId: unverifiedChannel.id,
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(1);
      expect(result.incidentsOpened).toBe(1);
      expect(result.alertsStaged).toBe(0); // No alerts staged
    });

    it('should not stage alerts for disabled channels', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test10@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      const check = await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Check with Disabled Channel',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      const disabledChannel = await prisma.channel.create({
        data: {
          userId: user.id,
          type: 'EMAIL',
          label: 'Disabled Email',
          targetEnc: 'encrypted-target',
          verifiedAt: new Date(),
          disabledAt: new Date(), // Disabled
          disabledReason: 'Too many failures',
        },
      });

      await prisma.checkChannel.create({
        data: {
          checkId: check.id,
          channelId: disabledChannel.id,
        },
      });

      const result = await runScan(now);

      expect(result.checksMarkedDown).toBe(1);
      expect(result.incidentsOpened).toBe(1);
      expect(result.alertsStaged).toBe(0); // No alerts staged
    });
  });

  describe('Advisory Lock', () => {
    it('should prevent concurrent scanner execution', async () => {
      // Create multiple checks to ensure scanner takes enough time for concurrent attempts
      const user = await prisma.user.create({
        data: {
          email: 'test-lock@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      // Create 10 checks to increase transaction duration
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          prisma.check.create({
            data: {
              userId: user.id,
              name: `Check ${i} for Lock Test`,
              scheduleType: 'PERIOD',
              periodSeconds: 3600,
              timezone: 'UTC',
              graceSeconds: 300,
              status: 'UP',
              alertAfter,
              nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
            },
          })
        )
      );

      // This test verifies that only one scanner can run at a time
      // by attempting to run two scanners concurrently
      const results = await Promise.all([runScan(now), runScan(now)]);

      // One should acquire lock (durationMs > 0), other should skip (durationMs = 0)
      const acquiredCount = results.filter((r) => r.durationMs > 0).length;
      const skippedCount = results.filter((r) => r.durationMs === 0).length;

      // At least one should be skipped due to lock
      expect(skippedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Incident Reuse', () => {
    it('should not create duplicate incidents for already-down checks', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'test11@example.com',
          plan: 'FREE',
        },
      });

      const now = new Date();
      const alertAfter = new Date(now.getTime() - 5 * 60 * 1000);

      const check = await prisma.check.create({
        data: {
          userId: user.id,
          name: 'Check with Open Incident',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'UP',
          alertAfter,
          nextExpectedAt: new Date(alertAfter.getTime() - 300 * 1000),
        },
      });

      // First scan: creates incident
      const result1 = await runScan(now);
      expect(result1.incidentsOpened).toBe(1);

      // Second scan: should reuse existing open incident
      const result2 = await runScan(new Date(now.getTime() + 60000));

      const incidents = await prisma.incident.findMany({
        where: { checkId: check.id, resolvedAt: null },
      });

      expect(incidents).toHaveLength(1); // Only one open incident
    });
  });
});
