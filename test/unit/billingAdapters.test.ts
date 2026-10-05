import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  getBillingProvider,
  PolarBillingProvider,
  LemonSqueezyBillingProvider,
  PaddleBillingProvider,
} from '../../src/billing/index.js';
import { env } from '../../src/env.js';

describe('Billing Provider Adapters', () => {
  const originalSecret = env.BILLING_WEBHOOK_SECRET;

  beforeEach(() => {
    (env as any).BILLING_WEBHOOK_SECRET = 'test_webhook_secret_key_12345';
  });

  afterEach(() => {
    (env as any).BILLING_WEBHOOK_SECRET = originalSecret;
  });

  describe('Provider Factory', () => {
    it('returns polar by default', () => {
      const provider = getBillingProvider();
      expect(provider.name).toBe('polar');
    });

    it('returns lemonsqueezy when requested', () => {
      const provider = getBillingProvider('lemonsqueezy');
      expect(provider.name).toBe('lemonsqueezy');
    });

    it('returns paddle when requested', () => {
      const provider = getBillingProvider('paddle');
      expect(provider.name).toBe('paddle');
    });

    it('falls back to polar for unknown provider', () => {
      const provider = getBillingProvider('stripe_unknown');
      expect(provider.name).toBe('polar');
    });
  });

  describe('Polar Provider', () => {
    const provider = new PolarBillingProvider();

    it('verifies valid hex webhook signature', () => {
      const body = JSON.stringify({ type: 'subscription.created', id: 'evt_123' });
      const hash = crypto.createHmac('sha256', 'test_webhook_secret_key_12345').update(body).digest('hex');

      const isValid = provider.verifyWebhookSignature(body, {
        'webhook-signature': hash,
      });
      expect(isValid).toBe(true);
    });

    it('verifies valid Standard Webhooks (whsec_) signature', () => {
      const rawSecretBytes = Buffer.from('01234567890123456789012345678901', 'utf8');
      const whsecSecret = `whsec_${rawSecretBytes.toString('base64')}`;
      (env as any).BILLING_WEBHOOK_SECRET = whsecSecret;

      const body = JSON.stringify({ type: 'subscription.created', id: 'evt_standard' });
      const webhookId = 'msg_2rX89q1X5K6W4L8M';
      const webhookTimestamp = '1735700000';
      const toSign = `${webhookId}.${webhookTimestamp}.${body}`;
      const expectedBase64 = crypto.createHmac('sha256', rawSecretBytes).update(toSign).digest('base64');

      const isValid = provider.verifyWebhookSignature(body, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': `v1,${expectedBase64}`,
      });
      expect(isValid).toBe(true);
    });

    it('verifies Standard Webhooks with space-separated signatures', () => {
      const rawSecretBytes = Buffer.from('01234567890123456789012345678901', 'utf8');
      const whsecSecret = `whsec_${rawSecretBytes.toString('base64')}`;
      (env as any).BILLING_WEBHOOK_SECRET = whsecSecret;

      const body = JSON.stringify({ type: 'subscription.updated', id: 'evt_multi' });
      const webhookId = 'msg_multi_123';
      const webhookTimestamp = '1735700100';
      const toSign = `${webhookId}.${webhookTimestamp}.${body}`;
      const expectedBase64 = crypto.createHmac('sha256', rawSecretBytes).update(toSign).digest('base64');

      const isValid = provider.verifyWebhookSignature(body, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': `v1,dummy_invalid_sig v1,${expectedBase64}`,
      });
      expect(isValid).toBe(true);
    });

    it('rejects invalid signature', () => {
      const body = JSON.stringify({ type: 'subscription.created' });
      const isValid = provider.verifyWebhookSignature(body, {
        'webhook-signature': 'bad_signature_000000000000000000000000000000000000000000000000000000000000',
      });
      expect(isValid).toBe(false);
    });

    it('parses subscription.created event with metadata', () => {
      const payload = {
        id: 'evt_polar_1',
        type: 'subscription.created',
        data: {
          id: 'sub_123',
          customer_id: 'cust_abc',
          customer_email: 'user@example.com',
          metadata: {
            userId: '00000000-0000-0000-0000-000000000001',
            plan: 'PRO',
            interval: 'MONTHLY',
          },
          current_period_end: '2026-11-01T00:00:00.000Z',
        },
      };

      const event = provider.parseWebhookEvent(JSON.stringify(payload), {});
      expect(event).not.toBeNull();
      expect(event?.id).toBe('evt_polar_1');
      expect(event?.kind).toBe('subscription.created');
      expect(event?.userId).toBe('00000000-0000-0000-0000-000000000001');
      expect(event?.plan).toBe('PRO');
      expect(event?.interval).toBe('MONTHLY');
      expect(event?.customerId).toBe('cust_abc');
      expect(event?.subscriptionId).toBe('sub_123');
    });

    it('generates checkout session URL with query parameters', async () => {
      const session = await provider.createCheckoutSession({
        userId: 'user_123',
        userEmail: 'dev@orbitping.io',
        plan: 'PLUS',
        interval: 'YEARLY',
        successUrl: 'http://localhost:3000/app/billing?success=true',
      });
      expect(session.url).toContain('https://polar.sh/checkout');
      expect(session.url).toContain('metadata%5BuserId%5D=user_123');
      expect(session.url).toContain('metadata%5Bplan%5D=PLUS');
    });
  });

  describe('Lemon Squeezy Provider', () => {
    const provider = new LemonSqueezyBillingProvider();

    it('verifies valid x-signature HMAC header', () => {
      const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });
      const hash = crypto.createHmac('sha256', 'test_webhook_secret_key_12345').update(body).digest('hex');

      const isValid = provider.verifyWebhookSignature(body, {
        'x-signature': hash,
      });
      expect(isValid).toBe(true);
    });

    it('parses subscription_created and extracts custom_data', () => {
      const payload = {
        meta: {
          event_name: 'subscription_created',
          webhook_id: 'ls_wh_999',
          custom_data: {
            userId: '00000000-0000-0000-0000-000000000002',
            plan: 'PLUS',
            interval: 'YEARLY',
          },
        },
        data: {
          id: 'ls_sub_777',
          attributes: {
            customer_id: 8881,
            user_email: 'buyer@lemon.io',
            renews_at: '2027-01-01T00:00:00.000Z',
          },
        },
      };

      const event = provider.parseWebhookEvent(JSON.stringify(payload), {});
      expect(event).not.toBeNull();
      expect(event?.id).toBe('ls_wh_999');
      expect(event?.kind).toBe('subscription.created');
      expect(event?.userId).toBe('00000000-0000-0000-0000-000000000002');
      expect(event?.plan).toBe('PLUS');
      expect(event?.interval).toBe('YEARLY');
      expect(event?.customerId).toBe('8881');
      expect(event?.subscriptionId).toBe('ls_sub_777');
    });

    it('generates customer portal URL', async () => {
      const portal = await provider.createCustomerPortalSession({
        customerId: 'cust_ls_555',
      });
      expect(portal.url).toBe('https://app.lemonsqueezy.com/my-orders?customer_id=cust_ls_555');
    });
  });

  describe('Paddle Provider', () => {
    const provider = new PaddleBillingProvider();

    it('verifies valid paddle-signature header', () => {
      const body = JSON.stringify({ event_type: 'subscription.activated' });
      const ts = '1700000000';
      const signedPayload = `${ts}:${body}`;
      const hash = crypto.createHmac('sha256', 'test_webhook_secret_key_12345').update(signedPayload).digest('hex');

      const isValid = provider.verifyWebhookSignature(body, {
        'paddle-signature': `ts=${ts};h1=${hash}`,
      });
      expect(isValid).toBe(true);
    });

    it('parses subscription.updated event', () => {
      const payload = {
        event_id: 'evt_pad_444',
        event_type: 'subscription.updated',
        data: {
          id: 'sub_pad_001',
          customer_id: 'ctm_pad_10',
          next_billed_at: '2026-12-15T12:00:00.000Z',
          custom_data: {
            userId: '00000000-0000-0000-0000-000000000003',
            plan: 'PRO',
            interval: 'MONTHLY',
          },
        },
      };

      const event = provider.parseWebhookEvent(JSON.stringify(payload), {});
      expect(event).not.toBeNull();
      expect(event?.id).toBe('evt_pad_444');
      expect(event?.kind).toBe('subscription.updated');
      expect(event?.userId).toBe('00000000-0000-0000-0000-000000000003');
      expect(event?.plan).toBe('PRO');
      expect(event?.customerId).toBe('ctm_pad_10');
    });
  });
});
