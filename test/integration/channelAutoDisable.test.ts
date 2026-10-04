import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { encryptTarget } from '../../src/security/crypto.js';
import { env } from '../../src/env.js';
import { pollAndProcessAlerts } from '../../src/jobs/alertWorker.js';
import { registerDeliveryAdapter, clearAdapterRegistry } from '../../src/jobs/adapters/factory.js';
import type { AlertDeliveryAdapter } from '../../src/jobs/adapters/base.js';

describe('Channel Auto-Disable on 10 Consecutive Failures (CHANM-03)', () => {
  let testUser: { id: string; email: string };

  beforeEach(async () => {
    clearAdapterRegistry();
    await prisma.alert.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.ping.deleteMany();
    await prisma.checkChannel.deleteMany();
    await prisma.check.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    testUser = await prisma.user.create({
      data: {
        email: `autodisable-${Date.now()}@example.com`,
        plan: 'FREE',
      },
    });
  });

  afterAll(async () => {
    clearAdapterRegistry();
    await prisma.$disconnect();
  });

  it('increments consecutiveFailures and auto-disables channel after 10 consecutive delivery failures', async () => {
    // Register mock adapter that always fails
    const failingAdapter: AlertDeliveryAdapter = {
      channel: 'WEBHOOK',
      deliver: async () => ({
        success: false,
        error: 'Connection refused 500',
        attempts: 1,
      }),
    };
    registerDeliveryAdapter('WEBHOOK', failingAdapter);

    const channel = await prisma.channel.create({
      data: {
        userId: testUser.id,
        type: 'WEBHOOK',
        label: 'Failing Webhook Endpoint',
        targetEnc: encryptTarget('https://example.com/webhook', env.ENC_KEY_V1, 'v1'),
        verifiedAt: new Date(),
        consecutiveFailures: 9, // Pre-set to 9
      },
    });

    const check = await prisma.check.create({
      data: {
        userId: testUser.id,
        name: 'Check with Failing Channel',
        scheduleType: 'PERIOD',
        periodSeconds: 300,
        status: 'DOWN',
      },
    });

    const incident = await prisma.incident.create({
      data: {
        checkId: check.id,
        reason: 'MISSED',
        startedAt: new Date(),
      },
    });

    await prisma.alert.create({
      data: {
        incidentId: incident.id,
        channelId: channel.id,
        kind: 'DOWN',
        seq: 0,
        checkName: check.name,
        reason: 'MISSED',
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(Date.now() - 5000), // Ready to process
      },
    });

    // Execute one poll loop
    await pollAndProcessAlerts({
      pollIntervalMs: 1000,
      leaseTimeoutSeconds: 60,
      batchSize: 10,
    });

    // Verify channel reached 10 failures and was auto-disabled
    const updatedChannel = await prisma.channel.findUnique({ where: { id: channel.id } });
    expect(updatedChannel?.consecutiveFailures).toBe(10);
    expect(updatedChannel?.disabledAt).not.toBeNull();
    expect(updatedChannel?.disabledReason).toBe('consecutive_delivery_failures');
  });

  it('resets consecutiveFailures to 0 on successful alert delivery', async () => {
    // Register mock adapter that succeeds
    const successAdapter: AlertDeliveryAdapter = {
      channel: 'WEBHOOK',
      deliver: async () => ({
        success: true,
        messageId: 'mock-msg-123',
        attempts: 1,
      }),
    };
    registerDeliveryAdapter('WEBHOOK', successAdapter);

    const channel = await prisma.channel.create({
      data: {
        userId: testUser.id,
        type: 'WEBHOOK',
        label: 'Recovered Webhook',
        targetEnc: encryptTarget('https://example.com/webhook', env.ENC_KEY_V1, 'v1'),
        verifiedAt: new Date(),
        consecutiveFailures: 4, // had previous failures
        lastError: 'Temporary 503',
      },
    });

    const check = await prisma.check.create({
      data: {
        userId: testUser.id,
        name: 'Recovered Check',
        scheduleType: 'PERIOD',
        periodSeconds: 300,
        status: 'DOWN',
      },
    });

    const incident = await prisma.incident.create({
      data: {
        checkId: check.id,
        reason: 'MISSED',
        startedAt: new Date(),
      },
    });

    await prisma.alert.create({
      data: {
        incidentId: incident.id,
        channelId: channel.id,
        kind: 'DOWN',
        seq: 0,
        checkName: check.name,
        reason: 'MISSED',
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(Date.now() - 5000),
      },
    });

    await pollAndProcessAlerts({
      pollIntervalMs: 1000,
      leaseTimeoutSeconds: 60,
      batchSize: 10,
    });

    const updatedChannel = await prisma.channel.findUnique({ where: { id: channel.id } });
    expect(updatedChannel?.consecutiveFailures).toBe(0);
    expect(updatedChannel?.lastError).toBeNull();
  });
});
