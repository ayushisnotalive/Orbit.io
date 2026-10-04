import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { createSession } from '../../src/auth/session.js';

describe('Public Marketing & Informational Pages', () => {
  let testUser: any;
  let sessionToken: string;

  beforeEach(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `public_test_${Date.now()}@example.com`,
        plan: 'FREE',
      },
    });

    const session = await createSession(testUser.id);
    sessionToken = session.token;
  });

  afterEach(async () => {
    if (testUser) {
      await prisma.session.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.deleteMany({ where: { id: testUser.id } });
    }
  });

  describe('Root Landing Page (GET /)', () => {
    it('serves public landing page for visitors', async () => {
      const res = await app.request('/', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Never let a silent background cron failure slip by');
      expect(html).toContain('Dead-Man');
      expect(html).toContain('Start Monitoring for Free');
      expect(html).toContain('/pricing');
      expect(html).toContain('/docs');
    });

    it('redirects authenticated users to /dashboard', async () => {
      const res = await app.request('/', {
        method: 'GET',
        headers: {
          Cookie: `orbitping_session=${sessionToken}`,
        },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/dashboard');
    });
  });

  describe('Pricing Page (GET /pricing)', () => {
    it('renders plan comparisons and FAQs', async () => {
      const res = await app.request('/pricing', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Simple, Transparent Pricing');
      expect(html).toContain('Free');
      expect(html).toContain('Pro');
      expect(html).toContain('Plus');
      expect(html).toContain('Frequently Asked Questions');
    });
  });

  describe('Documentation Page (GET /docs)', () => {
    it('renders quickstart guides and code examples', async () => {
      const res = await app.request('/docs', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('OrbitPing Documentation');
      expect(html).toContain('Ping Ingestion Endpoints');
      expect(html).toContain('The Zero-Dependency CLI');
      expect(html).toContain('Webhook HMAC-SHA256 Signature');
    });
  });

  describe('Legal Pages', () => {
    it('renders Terms of Service (GET /terms)', async () => {
      const res = await app.request('/terms', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Terms of Service');
      expect(html).toContain('Service Scope');
    });

    it('renders Privacy Policy (GET /privacy)', async () => {
      const res = await app.request('/privacy', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Privacy Policy');
      expect(html).toContain('Information We Collect');
    });

    it('renders Refund Policy (GET /refunds)', async () => {
      const res = await app.request('/refunds', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Refund Policy');
      expect(html).toContain('14-Day Money-Back Guarantee');
    });
  });

  describe('System Status Page (GET /status)', () => {
    it('renders subsystem operational health', async () => {
      const res = await app.request('/status', { method: 'GET' });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('OrbitPing System Status');
      expect(html).toContain('Ping Ingestion API');
      expect(html).toContain('Scanner CTE Engine');
      expect(html).toContain('Alert Worker Queue');
      expect(html).toContain('All Systems Operational');
    });
  });
});
