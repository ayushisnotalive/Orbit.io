import crypto from 'node:crypto';
import { env } from '../env.js';
import type {
  BillingPlan,
  BillingInterval,
  BillingProvider,
  CheckoutSessionOptions,
  CustomerPortalSessionOptions,
  StandardizedBillingEvent,
  WebhookEventKind,
} from './types.js';

export class PolarBillingProvider implements BillingProvider {
  readonly name = 'polar';

  private getPriceId(plan: BillingPlan, interval: BillingInterval): string | undefined {
    if (plan === 'PRO') {
      return interval === 'MONTHLY' ? env.PRICE_ID_PRO_MONTHLY : env.PRICE_ID_PRO_YEARLY;
    }
    if (plan === 'PLUS') {
      return interval === 'MONTHLY' ? env.PRICE_ID_PLUS_MONTHLY : env.PRICE_ID_PLUS_YEARLY;
    }
    return undefined;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<{ url: string }> {
    const priceId = this.getPriceId(options.plan, options.interval);
    
    // If Polar API Key is set, create checkout via API, otherwise build direct checkout URL
    if (env.BILLING_API_KEY) {
      try {
        const response = await fetch('https://api.polar.sh/v1/checkouts/custom/', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.BILLING_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_price_id: priceId,
            product_id: priceId,
            products: priceId ? [priceId] : undefined,
            customer_email: options.userEmail,
            metadata: {
              userId: options.userId,
              plan: options.plan,
              interval: options.interval,
            },
            success_url: options.successUrl || `${env.APP_URL}/app/billing?checkout=success`,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { url?: string };
          if (data.url) {
            return { url: data.url };
          }
        }
      } catch {
        // Fall back to direct checkout link
      }
    }

    const params = new URLSearchParams();
    if (priceId) {
      params.set('price_id', priceId);
      params.set('product_id', priceId);
    }
    params.set('customer_email', options.userEmail);
    params.set('metadata[userId]', options.userId);
    params.set('metadata[plan]', options.plan);
    params.set('metadata[interval]', options.interval);
    if (options.successUrl) {
      params.set('success_url', options.successUrl);
    } else {
      params.set('success_url', `${env.APP_URL}/app/billing?checkout=success`);
    }

    return {
      url: `https://polar.sh/checkout?${params.toString()}`,
    };
  }

  async createCustomerPortalSession(options: CustomerPortalSessionOptions): Promise<{ url: string }> {
    // Polar customer portal redirect
    const returnUrl = options.returnUrl || `${env.APP_URL}/app/billing`;
    return {
      url: `https://polar.sh/purchases/subscriptions?customer_id=${encodeURIComponent(options.customerId)}&return_url=${encodeURIComponent(returnUrl)}`,
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string | undefined>): boolean {
    const secret = env.BILLING_WEBHOOK_SECRET;
    if (!secret) return false;

    // Polar may send standard webhook-signature header or polar-webhook-signature
    const signature =
      headers['webhook-signature'] ||
      headers['polar-webhook-signature'] ||
      headers['x-polar-signature'];

    if (!signature) return false;

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

    // Extract all candidate signature tokens:
    // Supports:
    // - Space-separated Svix style: "v1,abc v1,def"
    // - Comma-separated: "v1=abc, v1=def" or "v1,abc, v1,def"
    // - Direct string: "abc", "v1=abc", "v1,abc"
    const rawParts = signature.split(/\s+/).flatMap((part) => part.split(','));
    const cleanTokens: string[] = [];
    for (const raw of rawParts) {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === 'v1') continue;
      if (trimmed.startsWith('v1=') || trimmed.startsWith('v1,')) {
        cleanTokens.push(trimmed.slice(3));
      } else {
        cleanTokens.push(trimmed);
      }
    }

    if (cleanTokens.length === 0) return false;

    const safeCompareHex = (token: string, hexDigest: string): boolean => {
      if (token.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(token)) return false;
      return crypto.timingSafeEqual(
        Buffer.from(token.toLowerCase(), 'utf8'),
        Buffer.from(hexDigest.toLowerCase(), 'utf8'),
      );
    };

    const safeCompareBase64 = (token: string, b64Digest: string): boolean => {
      if (token.length !== b64Digest.length) return false;
      return crypto.timingSafeEqual(
        Buffer.from(token, 'utf8'),
        Buffer.from(b64Digest, 'utf8'),
      );
    };

    // 1. Support Standard Webhooks (Svix/Polar specification with webhook-id and webhook-timestamp)
    const webhookId = headers['webhook-id'];
    const webhookTimestamp = headers['webhook-timestamp'];
    if (webhookId && webhookTimestamp) {
      const toSign = `${webhookId}.${webhookTimestamp}.${bodyBuffer.toString('utf8')}`;
      const svixKeys: (Buffer | string)[] = [];
      if (secret.startsWith('whsec_')) {
        try {
          svixKeys.push(Buffer.from(secret.slice(6), 'base64'));
        } catch {
          // Continue
        }
      }
      svixKeys.push(secret);

      for (const key of svixKeys) {
        const expectedBase64 = crypto.createHmac('sha256', key).update(toSign).digest('base64');
        const expectedHex = crypto.createHmac('sha256', key).update(toSign).digest('hex');
        for (const token of cleanTokens) {
          if (safeCompareBase64(token, expectedBase64) || safeCompareHex(token, expectedHex)) {
            return true;
          }
        }
      }
    }

    // 2. Support direct HMAC-SHA256 (hex and base64) over raw payload
    const directKeys: (Buffer | string)[] = [secret];
    if (secret.startsWith('whsec_')) {
      try {
        directKeys.push(Buffer.from(secret.slice(6), 'base64'));
      } catch {
        // Continue
      }
      directKeys.push(secret.slice(6));
    }

    for (const key of directKeys) {
      const hmacHex = crypto.createHmac('sha256', key).update(bodyBuffer).digest('hex');
      const hmacBase64 = crypto.createHmac('sha256', key).update(bodyBuffer).digest('base64');

      for (const token of cleanTokens) {
        if (safeCompareHex(token, hmacHex) || safeCompareBase64(token, hmacBase64)) {
          return true;
        }
      }
    }

    return false;
  }

  parseWebhookEvent(
    rawBody: string | Buffer,
    headers: Record<string, string | undefined>,
  ): StandardizedBillingEvent | null {
    try {
      const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
      const payload = JSON.parse(text);

      const type = String(payload.type || payload.event || '');
      const data = payload.data || payload;

      let kind: WebhookEventKind = 'other';
      if (type === 'subscription.created') {
        kind = 'subscription.created';
      } else if (type === 'subscription.active' || type === 'subscription.activated' || type === 'order.created') {
        kind = 'subscription.active';
      } else if (type === 'subscription.updated') {
        kind = 'subscription.updated';
      } else if (type === 'subscription.past_due' || type === 'payment.failed') {
        kind = 'subscription.past_due';
      } else if (type === 'subscription.canceled' || type === 'subscription.revoked') {
        kind = 'subscription.canceled';
      }

      const id = String(
        payload.id ||
        headers['webhook-id'] ||
        data.id ||
        `polar_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      );

      const metadata = data.metadata || data.custom_field_data || {};
      const userId = metadata.userId || metadata.user_id;

      const customerEmail =
        data.customer?.email ||
        data.customer_email ||
        data.user?.email ||
        metadata.customerEmail;

      const customerId = data.customer_id || data.user_id || data.customer?.id;
      const subscriptionId = data.subscription_id || (type.startsWith('subscription') ? data.id : undefined);

      let plan: BillingPlan | undefined = metadata.plan;
      if (!plan && data.product?.name) {
        const prodName = String(data.product.name).toUpperCase();
        if (prodName.includes('PLUS')) plan = 'PLUS';
        else if (prodName.includes('PRO')) plan = 'PRO';
      }

      let interval: BillingInterval | undefined = metadata.interval;
      if (!interval && (data.recurring_interval || data.price?.recurring_interval)) {
        const intv = String(data.recurring_interval || data.price?.recurring_interval).toLowerCase();
        interval = intv === 'year' || intv === 'yearly' ? 'YEARLY' : 'MONTHLY';
      }

      const renewsAtRaw = data.current_period_end || data.renews_at || data.ends_at;
      const renewsAt = renewsAtRaw ? new Date(renewsAtRaw) : undefined;
      const cancelAtPeriodEnd = Boolean(data.cancel_at_period_end);

      return {
        id,
        kind,
        userId,
        customerEmail,
        customerId,
        subscriptionId,
        plan,
        interval,
        renewsAt,
        cancelAtPeriodEnd,
        rawPayload: payload,
      };
    } catch {
      return null;
    }
  }
}
