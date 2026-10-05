import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { encryptTarget } from '../../src/security/crypto.js';
import {
  startAlertWorker,
  stopAlertWorker,
  calculateBackoffDelay,
  type WorkerConfig,
} from '../../src/jobs/alertWorker.js';
import {
  registerDeliveryAdapter,
  clearAdapterRegistry,
  MockDeliveryAdapter,
} from '../../src/jobs/adapters/index.js';
import type { User, Check, Incident, Alert, Channel } from '@prisma/client';

describe('Alert Worker: Integration Tests', () => {
  let testUser: User;
  let testCheck: Check;
  let testChannel: Channel;

  beforeEach(async () => {
    // Clean up test data
    await prisma.alert.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.ping.deleteMany();
    await prisma.checkChannel.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.check.deleteMany();
    await prisma.usageDaily.deleteMany();
    await prisma.globalUsageDaily.deleteMany();
    await prisma.user.deleteMany();

    // Stop any running workers
    await stopAlertWorker();

    // Clear adapter registry and register mock adapters
    clearAdapterRegistry();
  });

  afterEach(async () => {
    await stopAlertWorker();
    clearAdapterRegistry();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setupTestData() {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'worker-test@example.com',
        plan: 'PRO',
      },
    });

    // Create test check
    testCheck = await prisma.check.create({
      data: {
        userId: testUser.id,
        name: 'Alert Worker Test Check',
        scheduleType: 'PERIOD',
        periodSeconds: 3600,
        timezone: 'UTC',
        graceSeconds: 300,
        status: 'DOWN',
        downSince: new Date(),
      },
    });

    // Create test channel
    testChannel = await prisma.channel.create({
      data: {
        userId: testUser.id,
        label: 'Test Email Channel',
        type: 'EMAIL',
        targetEnc: encryptTarget('test@example.com'),
        verifiedAt: new Date(),
        // disabledAt is null (enabled)
      },
    });

    return { testUser, testCheck, testChannel };
  }

  async function createIncidentAndAlert(
    check: Check,
    channel: Channel,
    overrides: Partial<Alert> = {},
  ): Promise<{ incident: Incident; alert: Alert }> {
    const incident = await prisma.incident.create({
      data: {
        checkId: check.id,
        reason: 'MISSED',
        startedAt: new Date(),
      },
    });

    const alert = await prisma.alert.create({
      data: {
        incidentId: incident.id,
        channelId: channel.id,
        kind: 'DOWN',
        checkName: check.name,
        reason: 'MISSED',
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(Date.now() - 10000),
        createdAt: new Date(),
        ...overrides,
      },
    });

    return { incident, alert };
  }

  async function waitForAlertCondition(
    alertId: string,
    predicate: (alert: Alert) => boolean,
    timeoutMs = 5000,
  ): Promise<Alert | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const alert = await prisma.alert.findUnique({ where: { id: alertId } });
      if (alert && predicate(alert)) {
        return alert;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return await prisma.alert.findUnique({ where: { id: alertId } });
  }

  describe('Worker Lifecycle', () => {
    it('should start and stop worker gracefully', async () => {
      await setupTestData();

      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      // Start worker
      const workerPromise = startAlertWorker(config);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Stop worker
      await stopAlertWorker();

      // Worker should complete without hanging
      await workerPromise;
    });
  });

  describe('Alert Processing', () => {
    it('should deliver a PENDING alert successfully', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Register mock adapter that succeeds
      const mockAdapter = new MockDeliveryAdapter('EMAIL', {
        shouldSucceed: true,
      });
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Create alert
      const { alert } = await createIncidentAndAlert(testCheck, testChannel);

      // Run worker for one cycle
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SENT');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was sent
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('SENT');
      expect(updatedAlert?.sentAt).toBeTruthy();
      expect(mockAdapter.deliveryCalls).toHaveLength(1);
      expect(mockAdapter.deliveryCalls[0].destination).toBe('test@example.com');
    });

    it('should retry a failed alert with exponential backoff', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Register mock adapter that fails
      const mockAdapter = new MockDeliveryAdapter('EMAIL', {
        shouldSucceed: false,
        errorMessage: 'Simulated failure',
      });
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Create alert
      const { alert } = await createIncidentAndAlert(testCheck, testChannel);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.attempts >= 1);
      await stopAlertWorker();
      await workerPromise;

      // Verify alert failed and was scheduled for retry
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('PENDING');
      expect(updatedAlert?.attempts).toBe(1);
      expect(updatedAlert?.lastError).toContain('Simulated failure');
      expect(updatedAlert?.nextAttemptAt).toBeTruthy();

      // Verify backoff delay is correct (60 * 2^0 = 60 seconds for first retry)
      if (updatedAlert?.nextAttemptAt) {
        const expectedDelay = calculateBackoffDelay(0); // 60 seconds
        const actualDelay = Math.floor(
          (updatedAlert.nextAttemptAt.getTime() - Date.now()) / 1000,
        );
        expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 2);
        expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 2);
      }
    });

    it('should give up after 24 hours', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Create alert that's 25 hours old
      const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const { alert } = await createIncidentAndAlert(testCheck, testChannel, {
        createdAt,
        attempts: 10,
      });

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'FAILED');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was marked as failed
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('FAILED');
      expect(updatedAlert?.lastError).toContain('Exceeded 24h retry window');
      expect(mockAdapter.deliveryCalls).toHaveLength(0); // Should not attempt delivery
    });
  });

  describe('Suppression Rules', () => {
    it('should suppress alert when channel is disabled', async () => {
      const { testCheck } = await setupTestData();

      // Create disabled channel
      const disabledChannel = await prisma.channel.create({
        data: {
          userId: testUser.id,
          label: 'Disabled Channel',
          type: 'EMAIL',
          targetEnc: encryptTarget('disabled@example.com'),
          verifiedAt: new Date(),
          disabledAt: new Date(), // Disabled
          disabledReason: 'Test - intentionally disabled',
        },
      });

      const { alert } = await createIncidentAndAlert(testCheck, disabledChannel);

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SUPPRESSED');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was suppressed
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('SUPPRESSED');
      expect(updatedAlert?.lastError).toContain('disabled');
      expect(mockAdapter.deliveryCalls).toHaveLength(0);
    });

    it('should suppress alert when channel is unverified', async () => {
      const { testCheck } = await setupTestData();

      // Create unverified channel
      const unverifiedChannel = await prisma.channel.create({
        data: {
          userId: testUser.id,
          label: 'Unverified Channel',
          type: 'EMAIL',
          targetEnc: encryptTarget('unverified@example.com'),
          // verifiedAt is null (unverified)
        },
      });

      const { alert } = await createIncidentAndAlert(testCheck, unverifiedChannel);

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SUPPRESSED');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was suppressed
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('SUPPRESSED');
      expect(updatedAlert?.lastError).toContain('unverified');
      expect(mockAdapter.deliveryCalls).toHaveLength(0);
    });

    it('should suppress alert when check is muted', async () => {
      const { testChannel } = await setupTestData();

      // Create muted check
      const mutedCheck = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Muted Check',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'DOWN',
          downSince: new Date(),
          mutedUntil: new Date(Date.now() + 60 * 60 * 1000), // Muted for 1 hour
        },
      });

      const { alert } = await createIncidentAndAlert(mutedCheck, testChannel);

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SUPPRESSED');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was suppressed
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('SUPPRESSED');
      expect(updatedAlert?.lastError).toContain('muted');
      expect(mockAdapter.deliveryCalls).toHaveLength(0);
    });
  });

  describe('Usage Caps', () => {
    it('should suppress email alert when user exceeds plan limit', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Update user to FREE plan (20 emails/day limit)
      await prisma.user.update({
        where: { id: testUser.id },
        data: { plan: 'FREE' },
      });

      // Create daily usage at limit
      const today = new Date().toISOString().split('T')[0];
      await prisma.usageDaily.create({
        data: {
          userId: testUser.id,
          day: today,
          emailsSent: 30, // At limit for FREE plan (30 emails/day)
          webhooksSent: 0,
        },
      });

      const { alert } = await createIncidentAndAlert(testCheck, testChannel);

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SUPPRESSED');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was suppressed
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('SUPPRESSED');
      expect(updatedAlert?.lastError).toContain('usage cap');
      expect(mockAdapter.deliveryCalls).toHaveLength(0);
    });

    it('should suppress email alert when global cap is exceeded', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Create global usage at cap (90 emails/day from env)
      const today = new Date().toISOString().split('T')[0];
      await prisma.globalUsageDaily.create({
        data: {
          day: today,
          emailsSent: 90, // At global cap
        },
      });

      const { alert } = await createIncidentAndAlert(testCheck, testChannel);

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL');
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SUPPRESSED');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was suppressed
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });

      expect(updatedAlert?.status).toBe('SUPPRESSED');
      expect(updatedAlert?.lastError).toContain('global');
      expect(mockAdapter.deliveryCalls).toHaveLength(0);
    });

    it('should increment usage counters on successful delivery', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Register mock adapter that succeeds
      const mockAdapter = new MockDeliveryAdapter('EMAIL', {
        shouldSucceed: true,
      });
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Create alert
      const { alert } = await createIncidentAndAlert(testCheck, testChannel);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      await waitForAlertCondition(alert.id, (a) => a.status === 'SENT');
      await stopAlertWorker();
      await workerPromise;

      // Verify alert was sent
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });
      expect(updatedAlert?.status).toBe('SENT');

      // Verify user usage was incremented
      const today = new Date().toISOString().split('T')[0];
      const dailyUsage = await prisma.usageDaily.findUnique({
        where: {
          userId_day: {
            userId: testUser.id,
            day: today,
          },
        },
      });
      expect(dailyUsage?.emailsSent).toBe(1);

      // Verify global usage was incremented
      const globalUsage = await prisma.globalUsageDaily.findUnique({
        where: { day: today },
      });
      expect(globalUsage?.emailsSent).toBe(1);
    });
  });

  describe('Concurrency', () => {
    it('should handle multiple alerts without double-processing', async () => {
      const { testCheck, testChannel } = await setupTestData();

      // Register mock adapter
      const mockAdapter = new MockDeliveryAdapter('EMAIL', {
        shouldSucceed: true,
      });
      registerDeliveryAdapter('EMAIL', mockAdapter);

      // Create multiple checks with alerts (each check has 1 open incident per unique constraint)
      const check2 = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Alert Worker Test Check 2',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'DOWN',
          downSince: new Date(),
        },
      });
      const check3 = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Alert Worker Test Check 3',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          timezone: 'UTC',
          graceSeconds: 300,
          status: 'DOWN',
          downSince: new Date(),
        },
      });

      const { alert: a1 } = await createIncidentAndAlert(testCheck, testChannel);
      const { alert: a2 } = await createIncidentAndAlert(check2, testChannel);
      const { alert: a3 } = await createIncidentAndAlert(check3, testChannel);

      // Run worker
      const config: WorkerConfig = {
        pollIntervalMs: 100,
        leaseTimeoutSeconds: 60,
        batchSize: 10,
        maxRetries: 24,
      };

      const workerPromise = startAlertWorker(config);
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        const count = await prisma.alert.count({
          where: { id: { in: [a1.id, a2.id, a3.id] }, status: 'SENT' },
        });
        if (count === 3) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await stopAlertWorker();
      await workerPromise;

      // Verify all alerts were processed exactly once
      const alerts = await prisma.alert.findMany({
        where: { id: { in: [a1.id, a2.id, a3.id] } },
      });

      expect(alerts).toHaveLength(3);
      for (const alert of alerts) {
        expect(alert.status).toBe('SENT');
      }

      expect(mockAdapter.deliveryCalls).toHaveLength(3);
    });
  });
});
