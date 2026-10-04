import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { env } from '../../src/env.js';

describe('Billing Webhooks Integration (/webhooks/billing)', () => {
  const originalSecret = env.BILLING_WEBHOOK_SECRET;
  const originalProvider = env.BILLING_PROVIDER;
  const testSecret = 'whsec_test_secret_key_1234567890';
  let testUser: any;

  beforeEach(async () => {
    (env as any).BILLING_WEBHOOK_SECRET = testSecret;
    (env as any).BILLING_PROVIDER = 'polar';

    testUser = await prisma.user.create({
      data: {
        email: `billing_test_${Date.now()}@example.com`,
        plan: 'FREE',
        planStatus: 'NONE',
      },
    });
  });

  afterEach(async () => {
    (env as any).BILLING_WEBHOOK_SECRET = originalSecret;
    (env as any).BILLING_PROVIDER = originalProvider;

    if (testUser) {
      await prisma.billingEvent.deleteMany({ where: { userId: testUser.id } });
      await prisma.auditLog.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.deleteMany({ where: { id: testUser.id } });
    }
  });

  function signPayload(body: string): string {
    return crypto.createHmac('sha256', testSecret).update(body).digest('hex');
  }

  it('rejects webhooks with missing or invalid signature', async () => {
    const payload = JSON.stringify({ type: 'subscription.created', id: 'evt_no_sig' });

    // Missing signature
    const res1 = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    expect(res1.status).toBe(401);

    // Bad signature
    const res2 = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: payload,
    });
    expect(res2.status).toBe(401);
  });

  it('processes subscription.created event and activates user plan', async () => {
    const eventId = `evt_sub_created_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'subscription.created',
      data: {
        id: 'sub_polar_100',
        customer_id: 'cust_polar_100',
        metadata: {
          userId: testUser.id,
          plan: 'PRO',
          interval: 'MONTHLY',
        },
        current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      },
    });

    const sig = signPayload(payload);
    const res = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-signature': sig,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.received).toBe(true);
    expect(json.eventId).toBe(eventId);
    expect(json.duplicate).toBe(false);

    // Verify user record updated
    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(updatedUser?.plan).toBe('PRO');
    expect(updatedUser?.planStatus).toBe('ACTIVE');
    expect(updatedUser?.billingCustomerId).toBe('cust_polar_100');
    expect(updatedUser?.billingSubscriptionId).toBe('sub_polar_100');
    expect(updatedUser?.billingInterval).toBe('MONTHLY');
    expect(updatedUser?.planRenewsAt).not.toBeNull();

    // Verify BillingEvent recorded in DB
    const savedEvent = await prisma.billingEvent.findUnique({ where: { eventId } });
    expect(savedEvent).not.toBeNull();
    expect(savedEvent?.type).toBe('subscription.created');
    expect(savedEvent?.userId).toBe(testUser.id);
  });

  it('handles duplicate webhooks idempotently', async () => {
    const eventId = `evt_sub_dup_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'subscription.created',
      data: {
        id: 'sub_polar_dup',
        customer_id: 'cust_polar_dup',
        metadata: {
          userId: testUser.id,
          plan: 'PLUS',
          interval: 'YEARLY',
        },
      },
    });

    const sig = signPayload(payload);

    // First request
    const res1 = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-signature': sig,
      },
      body: payload,
    });
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as any;
    expect(json1.duplicate).toBe(false);

    // Second request with same event ID
    const res2 = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-signature': sig,
      },
      body: payload,
    });
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as any;
    expect(json2.received).toBe(true);
    expect(json2.duplicate).toBe(true);
  });

  it('updates planStatus to PAST_DUE and records pastDueSince on subscription.past_due', async () => {
    // Setup user with active PRO subscription
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        plan: 'PRO',
        planStatus: 'ACTIVE',
        billingSubscriptionId: 'sub_past_due_test',
      },
    });

    const eventId = `evt_sub_pastdue_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'subscription.past_due',
      data: {
        id: 'sub_past_due_test',
        metadata: { userId: testUser.id },
      },
    });

    const sig = signPayload(payload);
    const res = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-signature': sig,
      },
      body: payload,
    });

    expect(res.status).toBe(200);

    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(updatedUser?.planStatus).toBe('PAST_DUE');
    expect(updatedUser?.pastDueSince).not.toBeNull();
  });

  it('updates plan to FREE and status to CANCELED on subscription.canceled', async () => {
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        plan: 'PRO',
        planStatus: 'ACTIVE',
        billingSubscriptionId: 'sub_cancel_test',
      },
    });

    const eventId = `evt_sub_cancel_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'subscription.canceled',
      data: {
        id: 'sub_cancel_test',
        metadata: { userId: testUser.id },
      },
    });

    const sig = signPayload(payload);
    const res = await app.request('/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-signature': sig,
      },
      body: payload,
    });

    expect(res.status).toBe(200);

    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(updatedUser?.plan).toBe('FREE');
    expect(updatedUser?.planStatus).toBe('CANCELED');
  });
});
