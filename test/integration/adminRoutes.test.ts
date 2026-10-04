import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { createSession } from '../../src/auth/session.js';
import { env } from '../../src/env.js';

describe('Admin Routes Integration (/admin)', () => {
  const originalAdminEmails = env.ADMIN_EMAILS;
  let adminUser: any;
  let normalUser: any;
  let adminSessionToken: string;
  let normalSessionToken: string;

  beforeEach(async () => {
    const adminEmail = `admin_test_${Date.now()}@orbitping.io`;
    const normalEmail = `normal_test_${Date.now()}@example.com`;

    (env as any).ADMIN_EMAILS = [adminEmail];

    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        isAdmin: true,
        plan: 'FREE',
      },
    });

    normalUser = await prisma.user.create({
      data: {
        email: normalEmail,
        isAdmin: false,
        plan: 'FREE',
      },
    });

    const adminSession = await createSession(adminUser.id);
    adminSessionToken = adminSession.token;

    const normalSession = await createSession(normalUser.id);
    normalSessionToken = normalSession.token;
  });

  afterEach(async () => {
    (env as any).ADMIN_EMAILS = originalAdminEmails;

    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ userId: adminUser?.id }, { targetUserId: normalUser?.id }],
      },
    });
    await prisma.session.deleteMany({
      where: {
        userId: { in: [adminUser?.id, normalUser?.id].filter(Boolean) },
      },
    });
    await prisma.check.deleteMany({
      where: {
        userId: { in: [adminUser?.id, normalUser?.id].filter(Boolean) },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [adminUser?.id, normalUser?.id].filter(Boolean) },
      },
    });
  });

  describe('Authorization Controls (ADM-01)', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await app.request('/admin', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      expect(res.status).toBe(401);
    });

    it('rejects authenticated non-admin users with 403', async () => {
      const res = await app.request('/admin', {
        method: 'GET',
        headers: {
          Cookie: `orbitping_session=${normalSessionToken}`,
          Accept: 'application/json',
        },
      });
      expect(res.status).toBe(403);
    });

    it('allows whitelisted admin users', async () => {
      const res = await app.request('/admin', {
        method: 'GET',
        headers: {
          Cookie: `orbitping_session=${adminSessionToken}`,
        },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Admin Operations');
      expect(html).toContain('Scanner Engine');
      expect(html).toContain('Alert Queue Backlog');
    });
  });

  describe('User Management & Search (ADM-02)', () => {
    it('lists users and filters with search query', async () => {
      const res = await app.request(`/admin/users?q=${encodeURIComponent(normalUser.email)}`, {
        method: 'GET',
        headers: {
          Cookie: `orbitping_session=${adminSessionToken}`,
        },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(normalUser.email);
    });

    it('applies plan override and writes audit log', async () => {
      const res = await app.request(`/admin/users/${normalUser.id}/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${adminSessionToken}`,
        },
        body: 'plan=PRO&durationDays=30',
      });

      expect(res.status).toBe(303);

      const updated = await prisma.user.findUnique({ where: { id: normalUser.id } });
      expect(updated?.plan).toBe('PRO');
      expect(updated?.planSource).toBe('ADMIN');
      expect(updated?.adminPlanUntil).not.toBeNull();

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          targetUserId: normalUser.id,
          event: 'admin.user_plan_override',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.userId).toBe(adminUser.id);
    });
  });

  describe('Account Disabling & Enabling (ADM-03)', () => {
    it('disables user account, revokes sessions, and prevents future logins', async () => {
      const res = await app.request(`/admin/users/${normalUser.id}/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${adminSessionToken}`,
        },
        body: 'reason=Violation+of+terms',
      });

      expect(res.status).toBe(303);

      // Verify user disabled
      const updated = await prisma.user.findUnique({ where: { id: normalUser.id } });
      expect(updated?.disabledAt).not.toBeNull();
      expect(updated?.disabledReason).toBe('Violation of terms');

      // Verify all sessions were deleted
      const sessionCount = await prisma.session.count({ where: { userId: normalUser.id } });
      expect(sessionCount).toBe(0);

      // Verify subsequent request using old token is rejected
      const protectedRes = await app.request('/dashboard', {
        method: 'GET',
        headers: {
          Cookie: `orbitping_session=${normalSessionToken}`,
        },
      });
      expect(protectedRes.status).toBe(302);
      expect(protectedRes.headers.get('Location')).toBe('/login');
    });

    it('prevents administrator from disabling their own account', async () => {
      const res = await app.request(`/admin/users/${adminUser.id}/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${adminSessionToken}`,
          Accept: 'application/json',
        },
        body: 'reason=Self+disable',
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.error.message).toContain('Administrators cannot disable their own account');
    });

    it('re-enables a disabled account', async () => {
      // Disable first
      await prisma.user.update({
        where: { id: normalUser.id },
        data: { disabledAt: new Date(), disabledReason: 'Temporary freeze' },
      });

      const res = await app.request(`/admin/users/${normalUser.id}/enable`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: `orbitping_session=${adminSessionToken}`,
        },
      });

      expect(res.status).toBe(303);

      const updated = await prisma.user.findUnique({ where: { id: normalUser.id } });
      expect(updated?.disabledAt).toBeNull();
      expect(updated?.disabledReason).toBeNull();
    });
  });
});
