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

export class LemonSqueezyBillingProvider implements BillingProvider {
  readonly name = 'lemonsqueezy';

  private getVariantId(plan: BillingPlan, interval: BillingInterval): string | undefined {
    if (plan === 'PRO') {
      return interval === 'MONTHLY' ? env.PRICE_ID_PRO_MONTHLY : env.PRICE_ID_PRO_YEARLY;
    }
    if (plan === 'PLUS') {
      return interval === 'MONTHLY' ? env.PRICE_ID_PLUS_MONTHLY : env.PRICE_ID_PLUS_YEARLY;
    }
    return undefined;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<{ url: string }> {
    const variantId = this.getVariantId(options.plan, options.interval);

    if (env.BILLING_API_KEY && variantId) {
      try {
        const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.BILLING_API_KEY}`,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json',
          },
          body: JSON.stringify({
            data: {
              type: 'checkouts',
              attributes: {
                checkout_data: {
                  email: options.userEmail,
                  custom: {
                    userId: options.userId,
                    plan: options.plan,
                    interval: options.interval,
                  },
                },
                product_options: {
                  redirect_url: options.successUrl || `${env.APP_URL}/app/billing?checkout=success`,
                },
              },
              relationships: {
                variant: {
                  data: {
                    type: 'variants',
                    id: variantId,
                  },
                },
              },
            },
          }),
        });

        if (response.ok) {
          const resJson = (await response.json()) as { data?: { attributes?: { url?: string } } };
          if (resJson.data?.attributes?.url) {
            return { url: resJson.data.attributes.url };
          }
        }
      } catch {
        // Fall back to hosted URL
      }
    }

    const params = new URLSearchParams();
    if (variantId) params.set('variant', variantId);
    params.set('checkout[email]', options.userEmail);
    params.set('checkout[custom][userId]', options.userId);
    params.set('checkout[custom][plan]', options.plan);
    params.set('checkout[custom][interval]', options.interval);
    params.set('redirect_url', options.successUrl || `${env.APP_URL}/app/billing?checkout=success`);

    return {
      url: `https://app.lemonsqueezy.com/checkout/buy/${variantId || 'default'}?${params.toString()}`,
    };
  }

  async createCustomerPortalSession(options: CustomerPortalSessionOptions): Promise<{ url: string }> {
    return {
      url: `https://app.lemonsqueezy.com/my-orders?customer_id=${encodeURIComponent(options.customerId)}`,
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string | undefined>): boolean {
    const secret = env.BILLING_WEBHOOK_SECRET;
    if (!secret) return false;

    const signature = headers['x-signature'];
    if (!signature) return false;

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const hmacHex = crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');

    try {
      if (signature.length === hmacHex.length) {
        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(hmacHex, 'hex'));
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

      const eventName = String(payload.meta?.event_name || '');
      const customData = payload.meta?.custom_data || {};
      const data = payload.data || {};
      const attributes = data.attributes || {};

      let kind: WebhookEventKind = 'other';
      if (eventName === 'subscription_created') {
        kind = 'subscription.created';
      } else if (eventName === 'subscription_payment_success' || eventName === 'order_created') {
        kind = 'subscription.active';
      } else if (eventName === 'subscription_updated' || eventName === 'subscription_resumed') {
        kind = 'subscription.updated';
      } else if (eventName === 'subscription_payment_failed') {
        kind = 'subscription.past_due';
      } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
        kind = 'subscription.canceled';
      }

      const id = String(
        payload.meta?.webhook_id ||
        data.id ||
        `ls_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      );

      const userId = customData.userId || customData.user_id;
      const customerEmail = attributes.user_email || attributes.customer_email || customData.email;
      const customerId = String(attributes.customer_id || '');
      const subscriptionId = String(data.id || attributes.subscription_id || '');

      let plan: BillingPlan | undefined = customData.plan;
      if (!plan && attributes.product_name) {
        const prod = String(attributes.product_name).toUpperCase();
        if (prod.includes('PLUS')) plan = 'PLUS';
        else if (prod.includes('PRO')) plan = 'PRO';
      }

      let interval: BillingInterval | undefined = customData.interval;
      if (!interval && attributes.variant_name) {
        const varName = String(attributes.variant_name).toLowerCase();
        interval = varName.includes('year') ? 'YEARLY' : 'MONTHLY';
      }

      const renewsAtRaw = attributes.renews_at || attributes.ends_at;
      const renewsAt = renewsAtRaw ? new Date(renewsAtRaw) : undefined;
      const cancelAtPeriodEnd = Boolean(attributes.cancelled);

      return {
        id,
        kind,
        userId,
        customerEmail,
        customerId: customerId || undefined,
        subscriptionId: subscriptionId || undefined,
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
