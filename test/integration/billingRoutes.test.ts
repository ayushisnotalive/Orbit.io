import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { createSession } from '../../src/auth/session.js';
import { createCheckGuarded, assertPeriodAllowed } from '../../src/domain/limits.js';
import { getEffectivePlan } from '../../src/config/plans.js';

describe('Billing Routes & Downgrade Enforcement', () => {
  let testUser: any;
  let sessionToken: string;

  beforeEach(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `billing_routes_${Date.now()}@example.com`,
        plan: 'FREE',
        planStatus: 'NONE',
      },
    });

    const session = await createSession(testUser.id);
    sessionToken = session.token;
  });

  afterEach(async () => {
    if (testUser) {
      await prisma.check.deleteMany({ where: { userId: testUser.id } });
      await prisma.channel.deleteMany({ where: { userId: testUser.id } });
      await prisma.session.deleteMany({ where: { userId: testUser.id } });
      await prisma.auditLog.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.deleteMany({ where: { id: testUser.id } });
    }
  });

  describe('GET /app/billing', () => {
    it('redirects unauthenticated requests to /login', async () => {
      const res = await app.request('/app/billing', {
        method: 'GET',
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('renders billing page with plan details when authenticated', async () => {
      const res = await app.request('/app/billing', {
        method: 'GET',
        headers: {
          Cookie: `orbitping_session=${sessionToken}`,
        },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Subscription &amp; Plans');
      expect(html).toContain('Current Plan');
      expect(html).toContain('Available Plans');
      expect(html).toContain('Checks Quota');
    });
  });

  describe('POST /billing/checkout', () => {
    it('creates checkout session and redirects', async () => {
      const res = await app.request('/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${sessionToken}`,
        },
        body: 'plan=PRO&interval=MONTHLY',
      });

      expect(res.status).toBe(303);
      const redirectUrl = res.headers.get('Location');
      expect(redirectUrl).toContain('https://polar.sh/checkout');
      expect(redirectUrl).toContain('metadata%5Bplan%5D=PRO');
      expect(redirectUrl).toContain('metadata%5Binterval%5D=MONTHLY');
    });

    it('returns json checkout url when requested by API', async () => {
      const res = await app.request('/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${sessionToken}`,
        },
        body: JSON.stringify({ plan: 'PLUS', interval: 'YEARLY' }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.url).toContain('https://polar.sh/checkout');
      expect(json.url).toContain('metadata%5Bplan%5D=PLUS');
      expect(json.url).toContain('metadata%5Binterval%5D=YEARLY');
    });
  });

  describe('POST /billing/portal', () => {
    it('redirects to /app/billing with error when user has no customer ID', async () => {
      const res = await app.request('/billing/portal', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${sessionToken}`,
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/app/billing?error=no_customer');
    });

    it('redirects to customer portal when billingCustomerId exists', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { billingCustomerId: 'cust_polar_test_99' },
      });

      const res = await app.request('/billing/portal', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${sessionToken}`,
        },
      });

      expect(res.status).toBe(303);
      const portalUrl = res.headers.get('Location');
      expect(portalUrl).toContain('https://polar.sh/purchases/subscriptions');
      expect(portalUrl).toContain('cust_polar_test_99');
    });
  });

  describe('Downgrade Data Preservation & Limit Enforcement (BILL-04)', () => {
    it('preserves existing checks on downgrade while blocking new checks exceeding Free limits', async () => {
      // 1. Upgrade user to PRO and create 12 checks (exceeding Free limit of 10)
      await prisma.user.update({
        where: { id: testUser.id },
        data: { plan: 'PRO', planStatus: 'ACTIVE' },
      });

      for (let i = 1; i <= 12; i++) {
        await createCheckGuarded({
          userId: testUser.id,
          plan: 'PRO',
          name: `Pro Check ${i}`,
          scheduleType: 'PERIOD',
          periodSeconds: 600, // 10 min
        });
      }

      // Verify all 12 checks exist
      let checkCount = await prisma.check.count({ where: { userId: testUser.id } });
      expect(checkCount).toBe(12);

      // 2. Downgrade user back to FREE
      const downgradedUser = await prisma.user.update({
        where: { id: testUser.id },
        data: { plan: 'FREE', planStatus: 'CANCELED' },
      });

      // 3. Existing 12 checks must remain preserved (NOT deleted)
      checkCount = await prisma.check.count({ where: { userId: testUser.id } });
      expect(checkCount).toBe(12);

      // 4. Attempting to create a 13th check must be rejected by quota
      const effectivePlan = getEffectivePlan(downgradedUser);
      expect(effectivePlan).toBe('FREE');

      await expect(
        createCheckGuarded({
          userId: testUser.id,
          plan: effectivePlan,
          name: 'Excess Free Check',
          scheduleType: 'PERIOD',
          periodSeconds: 900,
        }),
      ).rejects.toThrow(/limit of 10 checks has been reached/i);
    });

    it('honors 7-day past-due grace period before downgrading effective plan to FREE', async () => {
      // 1. User with PAST_DUE within 7-day window retains PRO privileges
      const userWithinGrace = await prisma.user.update({
        where: { id: testUser.id },
        data: {
          plan: 'PRO',
          planStatus: 'PAST_DUE',
          pastDueSince: new Date(Date.now() - 3 * 86400 * 1000), // 3 days ago
        },
      });

      const effectivePlanWithinGrace = getEffectivePlan(userWithinGrace);
      expect(effectivePlanWithinGrace).toBe('PRO');

      // 60-second period is allowed on PRO
      expect(() => assertPeriodAllowed(effectivePlanWithinGrace, 60)).not.toThrow();

      // 2. User with PAST_DUE past 7-day window falls back to FREE
      const userPastGrace = await prisma.user.update({
        where: { id: testUser.id },
        data: {
          plan: 'PRO',
          planStatus: 'PAST_DUE',
          pastDueSince: new Date(Date.now() - 8 * 86400 * 1000), // 8 days ago
        },
      });

      const effectivePlanPastGrace = getEffectivePlan(userPastGrace);
      expect(effectivePlanPastGrace).toBe('FREE');

      // 60-second period is rejected on FREE (minimum allowed is 900s)
      expect(() => assertPeriodAllowed(effectivePlanPastGrace, 60)).toThrow(/minimum period of 900s/i);
    });
  });
});
