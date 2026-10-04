import { Hono, type MiddlewareHandler } from 'hono';
import { prisma } from '../db/client.js';
import { getSessionTokenFromCookie, setSessionCookie, validateSession } from '../auth/session.js';
import { getEffectivePlan } from '../config/plans.js';
import { getBillingProvider } from '../billing/index.js';
import { BillingView } from '../ui/views/Billing.js';
import { AppError } from '../lib/errors.js';
import type { BillingPlan, BillingInterval } from '../billing/types.js';

export const billingRouter = new Hono();

/**
 * UI Authentication guard.
 */
const requireUiAuth: MiddlewareHandler = async (c, next) => {
  const token = getSessionTokenFromCookie(c);
  if (!token) {
    if (c.req.header('Accept')?.includes('application/json')) {
      throw new AppError('unauthorized', 'Authentication required', 401);
    }
    return c.redirect('/login');
  }

  const result = await validateSession(token);
  if (!result) {
    if (c.req.header('Accept')?.includes('application/json')) {
      throw new AppError('unauthorized', 'Invalid or expired session', 401);
    }
    return c.redirect('/login');
  }

  c.set('user', result.session.user);
  c.set('session', result.session);

  if (result.refreshed) {
    setSessionCookie(c, token);
  }

  return next();
};

/**
 * Render Billing Dashboard View
 */
billingRouter.get('/app/billing', requireUiAuth, async (c) => {
  const sessionUser = c.get('user')!;

  // Fetch fresh user data with latest subscription metadata
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });

  if (!user) {
    return c.redirect('/login');
  }

  const effectivePlan = getEffectivePlan(user);

  // Count active checks and channels for usage meters
  const [checkCount, channelCount] = await Promise.all([
    prisma.check.count({ where: { userId: user.id } }),
    prisma.channel.count({ where: { userId: user.id } }),
  ]);

  const query = c.req.query();
  let flash: { type: 'success' | 'error' | 'warning'; message: string } | undefined;
  if (query.checkout === 'success') {
    flash = {
      type: 'success',
      message: 'Subscription successfully initiated! Your account will be upgraded within a few moments.',
    };
  } else if (query.error === 'no_customer') {
    flash = {
      type: 'error',
      message: 'No active billing customer found for your account. Please subscribe to a plan first.',
    };
  }

  return c.html(
    <BillingView
      user={{
        email: user.email,
        plan: user.plan,
        effectivePlan,
        planStatus: user.planStatus,
        planRenewsAt: user.planRenewsAt,
        billingInterval: user.billingInterval,
        billingCustomerId: user.billingCustomerId,
        pastDueSince: user.pastDueSince,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd,
        isAdmin: user.isAdmin,
      }}
      checkCount={checkCount}
      channelCount={channelCount}
      flash={flash}
    />,
  );
});

/**
 * Initiate Checkout Session Redirect
 */
billingRouter.post('/billing/checkout', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  let body: Record<string, any> = {};

  try {
    const contentType = c.req.header('Content-Type') || '';
    if (contentType.includes('application/json')) {
      body = await c.req.json();
    } else {
      body = await c.req.parseBody();
    }
  } catch {
    body = {};
  }

  const rawPlan = String(body.plan || 'PRO').toUpperCase();
  const rawInterval = String(body.interval || 'MONTHLY').toUpperCase();

  const plan: BillingPlan = rawPlan === 'PLUS' ? 'PLUS' : 'PRO';
  const interval: BillingInterval = rawInterval === 'YEARLY' ? 'YEARLY' : 'MONTHLY';

  const provider = getBillingProvider();
  const session = await provider.createCheckoutSession({
    userId: user.id,
    userEmail: user.email,
    plan,
    interval,
  });

  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json({ url: session.url });
  }

  return c.redirect(session.url, 303);
});

/**
 * Customer Billing Portal Redirect
 */
billingRouter.post('/billing/portal', requireUiAuth, async (c) => {
  const sessionUser = c.get('user')!;
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });

  if (!user || !user.billingCustomerId) {
    if (c.req.header('Accept')?.includes('application/json')) {
      throw new AppError('invalid_input', 'No active billing customer found', 400);
    }
    return c.redirect('/app/billing?error=no_customer');
  }

  const provider = getBillingProvider();
  const portal = await provider.createCustomerPortalSession({
    customerId: user.billingCustomerId,
  });

  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json({ url: portal.url });
  }

  return c.redirect(portal.url, 303);
});
