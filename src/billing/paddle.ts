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

export class PaddleBillingProvider implements BillingProvider {
  readonly name = 'paddle';

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

    const params = new URLSearchParams();
    if (priceId) params.set('items[0][price_id]', priceId);
    params.set('customer[email]', options.userEmail);
    params.set('custom_data[userId]', options.userId);
    params.set('custom_data[plan]', options.plan);
    params.set('custom_data[interval]', options.interval);
    params.set('return_url', options.successUrl || `${env.APP_URL}/app/billing?checkout=success`);

    return {
      url: `https://checkout.paddle.com/checkout?${params.toString()}`,
    };
  }

  async createCustomerPortalSession(options: CustomerPortalSessionOptions): Promise<{ url: string }> {
    return {
      url: `https://customer.paddle.com/portal/${encodeURIComponent(options.customerId)}`,
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string | undefined>): boolean {
    const secret = env.BILLING_WEBHOOK_SECRET;
    if (!secret) return false;

    const signatureHeader = headers['paddle-signature'];
    if (!signatureHeader) return false;

    // Format: ts=1690000000;h1=hash
    const parts = signatureHeader.split(';').map((p) => p.trim());
    let ts = '';
    let h1 = '';

    for (const part of parts) {
      if (part.startsWith('ts=')) ts = part.slice(3);
      if (part.startsWith('h1=')) h1 = part.slice(3);
    }

    if (!ts || !h1) return false;

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const signedPayload = `${ts}:${bodyStr}`;
    const hmacHex = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    try {
      if (h1.length === hmacHex.length) {
        return crypto.timingSafeEqual(Buffer.from(h1, 'hex'), Buffer.from(hmacHex, 'hex'));
      }
    } catch {
      return false;
    }

    return false;
  }

  parseWebhookEvent(
    rawBody: string | Buffer,
    _headers: Record<string, string | undefined>,
  ): StandardizedBillingEvent | null {
    try {
      const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
      const payload = JSON.parse(text);

      const eventType = String(payload.event_type || '');
      const data = payload.data || {};
      const customData = data.custom_data || {};

      let kind: WebhookEventKind = 'other';
      if (eventType === 'subscription.created') {
        kind = 'subscription.created';
      } else if (eventType === 'subscription.activated') {
        kind = 'subscription.active';
      } else if (eventType === 'subscription.updated') {
        kind = 'subscription.updated';
      } else if (eventType === 'subscription.past_due') {
        kind = 'subscription.past_due';
      } else if (eventType === 'subscription.canceled') {
        kind = 'subscription.canceled';
      }

      const id = String(
        payload.event_id ||
        data.id ||
        `paddle_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      );

      const userId = customData.userId || customData.user_id;
      const customerEmail = data.customer?.email || customData.email;
      const customerId = data.customer_id || data.customer?.id;
      const subscriptionId = data.id || data.subscription_id;

      let plan: BillingPlan | undefined = customData.plan;
      if (!plan && data.items?.[0]?.price?.name) {
        const pName = String(data.items[0].price.name).toUpperCase();
        if (pName.includes('PLUS')) plan = 'PLUS';
        else if (pName.includes('PRO')) plan = 'PRO';
      }

      let interval: BillingInterval | undefined = customData.interval;
      if (!interval && data.billing_cycle?.interval) {
        interval = String(data.billing_cycle.interval).toLowerCase() === 'year' ? 'YEARLY' : 'MONTHLY';
      }

      const renewsAtRaw = data.next_billed_at || data.current_billing_period?.ends_at;
      const renewsAt = renewsAtRaw ? new Date(renewsAtRaw) : undefined;
      const cancelAtPeriodEnd = Boolean(data.scheduled_change?.action === 'cancel');

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
