import { prisma } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { getBillingProvider, type BillingProvider } from './index.js';
import type { Prisma } from '@prisma/client';

export interface WebhookResult {
  success: boolean;
  duplicate?: boolean;
  eventId?: string;
  error?: string;
  userId?: string;
}

/**
 * Handles incoming webhook from Merchant of Record providers with idempotency
 * and state transition execution.
 */
export async function handleBillingWebhook(
  rawBody: string | Buffer,
  headers: Record<string, string | undefined>,
  providerOverride?: BillingProvider,
): Promise<WebhookResult> {
  const provider = providerOverride || getBillingProvider();

  // 1. Verify signature
  const isValid = provider.verifyWebhookSignature(rawBody, headers);
  if (!isValid) {
    logger.warn({ provider: provider.name }, 'Billing webhook signature verification failed');
    return { success: false, error: 'invalid_signature' };
  }

  // 2. Parse standardized event
  const event = provider.parseWebhookEvent(rawBody, headers);
  if (!event || !event.id) {
    logger.warn({ provider: provider.name }, 'Failed to parse standardized billing event');
    return { success: false, error: 'invalid_payload' };
  }

  // 3. Idempotency check using BillingEvent table
  const existingEvent = await prisma.billingEvent.findUnique({
    where: { eventId: event.id },
  });

  if (existingEvent) {
    logger.info({ eventId: event.id, type: existingEvent.type }, 'Duplicate billing webhook ignored');
    return { success: true, duplicate: true, eventId: event.id, userId: existingEvent.userId ?? undefined };
  }

  // 4. Resolve target user
  let targetUser = null;
  if (event.userId) {
    targetUser = await prisma.user.findUnique({ where: { id: event.userId } });
  }

  if (!targetUser && event.customerId) {
    targetUser = await prisma.user.findFirst({
      where: { billingCustomerId: event.customerId },
    });
  }

  if (!targetUser && event.subscriptionId) {
    targetUser = await prisma.user.findFirst({
      where: { billingSubscriptionId: event.subscriptionId },
    });
  }

  if (!targetUser && event.customerEmail) {
    targetUser = await prisma.user.findUnique({
      where: { email: event.customerEmail.toLowerCase().trim() },
    });
  }

  // 5. Execute state transition within transaction
  await prisma.$transaction(async (tx) => {
    // Record idempotency log first or alongside
    await tx.billingEvent.create({
      data: {
        eventId: event.id,
        type: event.kind,
        userId: targetUser?.id ?? null,
        payload: event.rawPayload as Prisma.InputJsonValue,
      },
    });

    if (targetUser) {
      const now = new Date();
      const updateData: Prisma.UserUpdateInput = {};

      if (event.kind === 'subscription.created' || event.kind === 'subscription.active') {
        updateData.plan = event.plan ?? 'PRO';
        updateData.planStatus = 'ACTIVE';
        updateData.planSource = 'PROVIDER';
        if (event.customerId) updateData.billingCustomerId = event.customerId;
        if (event.subscriptionId) updateData.billingSubscriptionId = event.subscriptionId;
        if (event.renewsAt) updateData.planRenewsAt = event.renewsAt;
        if (event.interval) updateData.billingInterval = event.interval;
        updateData.cancelAtPeriodEnd = event.cancelAtPeriodEnd ?? false;
        updateData.pastDueSince = null;
      } else if (event.kind === 'subscription.updated') {
        if (event.plan) updateData.plan = event.plan;
        if (event.renewsAt) updateData.planRenewsAt = event.renewsAt;
        if (event.cancelAtPeriodEnd !== undefined) {
          updateData.cancelAtPeriodEnd = event.cancelAtPeriodEnd;
        }
        updateData.planStatus = 'ACTIVE';
      } else if (event.kind === 'subscription.past_due') {
        updateData.planStatus = 'PAST_DUE';
        if (!targetUser.pastDueSince) {
          updateData.pastDueSince = now;
        }
      } else if (event.kind === 'subscription.canceled') {
        updateData.planStatus = 'CANCELED';
        updateData.plan = 'FREE';
        updateData.cancelAtPeriodEnd = false;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: targetUser.id },
          data: updateData,
        });

        await tx.auditLog.create({
          data: {
            userId: targetUser.id,
            event: `billing.${event.kind}`,
            meta: {
              eventId: event.id,
              provider: provider.name,
              plan: event.plan,
              status: updateData.planStatus,
            },
          },
        });
      }
    }
  }, { maxWait: 10000, timeout: 20000 });

  logger.info(
    { eventId: event.id, kind: event.kind, userId: targetUser?.id, provider: provider.name },
    'Billing webhook processed successfully',
  );

  return {
    success: true,
    eventId: event.id,
    userId: targetUser?.id,
  };
}
