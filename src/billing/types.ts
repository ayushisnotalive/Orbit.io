export type BillingPlan = 'PRO' | 'PLUS';
export type BillingInterval = 'MONTHLY' | 'YEARLY';

export interface CheckoutSessionOptions {
  userId: string;
  userEmail: string;
  plan: BillingPlan;
  interval: BillingInterval;
  successUrl?: string;
}

export interface CustomerPortalSessionOptions {
  customerId: string;
  returnUrl?: string;
}

export type WebhookEventKind =
  | 'subscription.created'
  | 'subscription.active'
  | 'subscription.updated'
  | 'subscription.past_due'
  | 'subscription.canceled'
  | 'other';

export interface StandardizedBillingEvent {
  id: string;
  kind: WebhookEventKind;
  userId?: string;
  customerEmail?: string;
  customerId?: string;
  subscriptionId?: string;
  plan?: BillingPlan;
  interval?: BillingInterval;
  renewsAt?: Date;
  cancelAtPeriodEnd?: boolean;
  rawPayload: unknown;
}

export interface BillingProvider {
  readonly name: string;
  createCheckoutSession(options: CheckoutSessionOptions): Promise<{ url: string }>;
  createCustomerPortalSession(options: CustomerPortalSessionOptions): Promise<{ url: string }>;
  verifyWebhookSignature(rawBody: string | Buffer, headers: Record<string, string | undefined>): boolean;
  parseWebhookEvent(
    rawBody: string | Buffer,
    headers: Record<string, string | undefined>,
  ): StandardizedBillingEvent | null;
}
