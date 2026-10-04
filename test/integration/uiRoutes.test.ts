import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { createSession } from '../../src/auth/session.js';
import { SESSION_COOKIE_NAME } from '../../src/auth/session.js';

describe('UI Routes Integration Tests', () => {
  let testUser: { id: string; email: string };
  let sessionCookie: string;

  beforeEach(async () => {
    await prisma.alert.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.ping.deleteMany();
    await prisma.checkChannel.deleteMany();
    await prisma.check.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    testUser = await prisma.user.create({
      data: {
        email: `ui-user-${Date.now()}@example.com`,
        plan: 'FREE',
      },
    });

    const session = await createSession(testUser.id);
    sessionCookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Static Asset Serving', () => {
    it('serves public/css/app.css via /static/css/app.css', async () => {
      const res = await app.request('/static/css/app.css');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('OrbitPing Design System');
      expect(text).toContain('--bg-app');
    });

    it('serves public/js/htmx.min.js via /static/js/htmx.min.js', async () => {
      const res = await app.request('/static/js/htmx.min.js');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.length).toBeGreaterThan(1000);
    });
  });

  describe('Unauthenticated Navigation', () => {
    it('renders login page on GET /login without session', async () => {
      const res = await app.request('/login');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Welcome to OrbitPing');
      expect(html).toContain('/auth/magic-link');
      expect(html).toContain('/auth/github');
    });

    it('redirects to /login when requesting protected /dashboard without session', async () => {
      const res = await app.request('/dashboard');
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });
  });

  describe('Authenticated Dashboard & Check Listing', () => {
    it('renders dashboard with user checks and metrics', async () => {
      await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Nightly Sync Job',
          scheduleType: 'PERIOD',
          periodSeconds: 3600,
          status: 'UP',
        },
      });

      const res = await app.request('/dashboard', {
        headers: {
          Cookie: sessionCookie,
        },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Monitored Checks');
      expect(html).toContain('Nightly Sync Job');
      expect(html).toContain(testUser.email);
      expect(html).toContain('Healthy (Up)');
    });

    it('filters checks by status parameter', async () => {
      await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Healthy Service',
          scheduleType: 'PERIOD',
          periodSeconds: 300,
          status: 'UP',
        },
      });

      await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Failing Daemon',
          scheduleType: 'PERIOD',
          periodSeconds: 300,
          status: 'DOWN',
        },
      });

      const res = await app.request('/dashboard?filter=down', {
        headers: {
          Cookie: sessionCookie,
        },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Failing Daemon');
      expect(html).not.toContain('Healthy Service');
    });
  });

  describe('Schedule Preview HTMX Endpoint', () => {
    it('translates interval into human-readable description', async () => {
      const res = await app.request(
        '/checks/preview-schedule?scheduleType=PERIOD&periodMinutes=45',
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Every 45 minutes');
      expect(html).toContain('Next expected run');
    });

    it('translates cron expression with cronstrue', async () => {
      const res = await app.request(
        '/checks/preview-schedule?scheduleType=CRON&cronExpr=0+3+*+*+*&timezone=UTC',
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('At 03:00 AM');
      expect(html).toContain('Next expected run');
    });

    it('returns error message on invalid cron syntax', async () => {
      const res = await app.request(
        '/checks/preview-schedule?scheduleType=CRON&cronExpr=not-a-cron&timezone=UTC',
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Invalid Cron Schedule');
    });
  });

  describe('Check CRUD Lifecycle', () => {
    it('creates a new check via POST /checks and redirects to details', async () => {
      const form = new URLSearchParams();
      form.append('name', 'Stripe Webhook Worker');
      form.append('scheduleType', 'PERIOD');
      form.append('periodMinutes', '15');
      form.append('graceMinutes', '5');
      form.append('tags', 'payments, stripe');

      const res = await app.request('/checks', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('Location');
      expect(location).toMatch(/^\/checks\/[0-9a-f-]{36}$/);

      const checkId = location!.replace('/checks/', '');
      const created = await prisma.check.findUnique({ where: { id: checkId } });
      expect(created).toBeDefined();
      expect(created?.name).toBe('Stripe Webhook Worker');
      expect(created?.periodSeconds).toBe(900);
      expect(created?.graceSeconds).toBe(300);
      expect(created?.tags).toEqual(['payments', 'stripe']);
    });

    it('renders check detail view on GET /checks/:id', async () => {
      const check = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Redis Cache Warmup',
          scheduleType: 'PERIOD',
          periodSeconds: 1800,
          status: 'UP',
        },
      });

      const res = await app.request(`/checks/${check.id}`, {
        headers: {
          Cookie: sessionCookie,
        },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Redis Cache Warmup');
      expect(html).toContain(check.pingUuid);
      expect(html).toContain('Integration Code Snippets');
      expect(html).toContain('Recent Pings');
      expect(html).toContain('Incident History');
    });

    it('updates check settings via POST /checks/:id/edit', async () => {
      const check = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Original Check Name',
          scheduleType: 'PERIOD',
          periodSeconds: 600,
        },
      });

      const form = new URLSearchParams();
      form.append('name', 'Renamed Check');
      form.append('scheduleType', 'CRON');
      form.append('cronExpr', '0 12 * * *');
      form.append('timezone', 'Europe/London');
      form.append('graceMinutes', '10');

      const res = await app.request(`/checks/${check.id}/edit`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(`/checks/${check.id}`);

      const updated = await prisma.check.findUnique({ where: { id: check.id } });
      expect(updated?.name).toBe('Renamed Check');
      expect(updated?.scheduleType).toBe('CRON');
      expect(updated?.cronExpr).toBe('0 12 * * *');
      expect(updated?.timezone).toBe('Europe/London');
    });

    it('pauses and resumes a check via POST /checks/:id/pause', async () => {
      const check = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'Pausable Check',
          scheduleType: 'PERIOD',
          periodSeconds: 300,
          status: 'UP',
        },
      });

      // Pause
      const pauseRes = await app.request(`/checks/${check.id}/pause`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });
      expect(pauseRes.status).toBe(302);

      let updated = await prisma.check.findUnique({ where: { id: check.id } });
      expect(updated?.status).toBe('PAUSED');
      expect(updated?.pausedAt).not.toBeNull();

      // Resume
      const resumeRes = await app.request(`/checks/${check.id}/pause`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });
      expect(resumeRes.status).toBe(302);

      updated = await prisma.check.findUnique({ where: { id: check.id } });
      expect(updated?.status).toBe('NEW');
      expect(updated?.pausedAt).toBeNull();
    });

    it('permanently deletes check via POST /checks/:id/delete', async () => {
      const check = await prisma.check.create({
        data: {
          userId: testUser.id,
          name: 'To Be Deleted',
          scheduleType: 'PERIOD',
          periodSeconds: 300,
        },
      });

      const res = await app.request(`/checks/${check.id}/delete`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/dashboard');

      const deleted = await prisma.check.findUnique({ where: { id: check.id } });
      expect(deleted).toBeNull();
    });
  });
});
