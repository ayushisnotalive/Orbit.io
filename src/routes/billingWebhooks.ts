import { Hono } from 'hono';
import { handleBillingWebhook } from '../billing/service.js';

export const billingWebhooksRouter = new Hono();

billingWebhooksRouter.post('/', async (c) => {
  const rawBody = await c.req.text();
  const headers = c.req.header();

  const result = await handleBillingWebhook(rawBody, headers);

  if (!result.success) {
    if (result.error === 'invalid_signature') {
      return c.json({ error: 'invalid_signature' }, 401);
    }
    return c.json({ error: result.error || 'invalid_payload' }, 400);
  }

  return c.json({
    received: true,
    duplicate: result.duplicate ?? false,
    eventId: result.eventId,
  });
});
