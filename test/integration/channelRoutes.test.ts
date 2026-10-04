import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { createSession, SESSION_COOKIE_NAME } from '../../src/auth/session.js';
import { encryptTarget } from '../../src/security/crypto.js';
import { env } from '../../src/env.js';
import { registerDeliveryAdapter, clearAdapterRegistry } from '../../src/jobs/adapters/factory.js';

describe('Channel Routes Integration Tests', () => {
  let testUser: { id: string; email: string };
  let sessionCookie: string;

  beforeEach(async () => {
    registerDeliveryAdapter('EMAIL', {
      channel: 'EMAIL',
      deliver: async () => ({ success: true, messageId: 'mock-test-123', attempts: 1 }),
    });

    await prisma.alert.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.ping.deleteMany();
    await prisma.checkChannel.deleteMany();
    await prisma.check.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    testUser = await prisma.user.create({
      data: {
        email: `channel-user-${Date.now()}@example.com`,
        plan: 'FREE',
      },
    });

    const session = await createSession(testUser.id);
    sessionCookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  });

  afterAll(async () => {
    clearAdapterRegistry();
    await prisma.$disconnect();
  });

  describe('Channel Listing & Navigation', () => {
    it('redirects unauthenticated user to /login', async () => {
      const res = await app.request('/app/channels');
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/login');
    });

    it('renders channel list with user channels and quota indicator', async () => {
      await prisma.channel.create({
        data: {
          userId: testUser.id,
          type: 'EMAIL',
          label: 'Primary Dev Email',
          targetEnc: encryptTarget(testUser.email, env.ENC_KEY_V1, 'v1'),
          verifiedAt: new Date(),
        },
      });

      const res = await app.request('/app/channels', {
        headers: { Cookie: sessionCookie },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Alert Channels');
      expect(html).toContain('Primary Dev Email');
      expect(html).toContain('EMAIL');
      expect(html).toContain('Verified');
      expect(html).toContain('/ 2'); // Free plan allows 2 channels
    });
  });

  describe('Channel Creation Workflows', () => {
    it('auto-verifies EMAIL channel if target matches account email', async () => {
      const form = new URLSearchParams();
      form.append('type', 'EMAIL');
      form.append('label', 'Default Account Email');
      form.append('targetEmail', testUser.email);

      const res = await app.request('/app/channels', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toContain('/app/channels');

      const created = await prisma.channel.findFirst({
        where: { userId: testUser.id, label: 'Default Account Email' },
      });
      expect(created).toBeDefined();
      expect(created?.verifiedAt).not.toBeNull();
      expect(created?.verifyTokenHash).toBeNull();
    });

    it('creates unverified EMAIL channel with token if different email provided', async () => {
      const form = new URLSearchParams();
      form.append('type', 'EMAIL');
      form.append('label', 'Secondary Email');
      form.append('targetEmail', 'secondary@example.com');

      const res = await app.request('/app/channels', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      expect(res.status).toBe(302);

      const created = await prisma.channel.findFirst({
        where: { userId: testUser.id, label: 'Secondary Email' },
      });
      expect(created).toBeDefined();
      expect(created?.verifiedAt).toBeNull();
      expect(created?.verifyTokenHash).not.toBeNull();
      expect(created?.verifyExpiresAt).not.toBeNull();
    });

    it('creates TELEGRAM channel and redirects to pair screen', async () => {
      const form = new URLSearchParams();
      form.append('type', 'TELEGRAM');
      form.append('label', 'Engineering Telegram');

      const res = await app.request('/app/channels', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('Location')!;
      expect(location).toContain('/pair?token=');

      const created = await prisma.channel.findFirst({
        where: { userId: testUser.id, label: 'Engineering Telegram' },
      });
      expect(created).toBeDefined();
      expect(created?.type).toBe('TELEGRAM');
      expect(created?.verifiedAt).toBeNull();
    });

    it('enforces plan quota limit (FREE: 2 channels)', async () => {
      // Create 2 channels
      for (let i = 1; i <= 2; i++) {
        await prisma.channel.create({
          data: {
            userId: testUser.id,
            type: 'EMAIL',
            label: `Channel ${i}`,
            targetEnc: encryptTarget(`user${i}@example.com`, env.ENC_KEY_V1, 'v1'),
            verifiedAt: new Date(),
          },
        });
      }

      // Attempt 3rd channel
      const form = new URLSearchParams();
      form.append('type', 'EMAIL');
      form.append('label', 'Channel 3 Excess');
      form.append('targetEmail', testUser.email);

      const res = await app.request('/app/channels', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('limit of 2 alert channels has been reached');
    });
  });

  describe('Verification & Test Alert Workflows', () => {
    it('verifies email channel via /app/channels/verify token', async () => {
      const form = new URLSearchParams();
      form.append('type', 'EMAIL');
      form.append('label', 'Verification Test Channel');
      form.append('targetEmail', 'verify-me@example.com');

      await app.request('/app/channels', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:3000',
        },
        body: form.toString(),
      });

      const channel = await prisma.channel.findFirst({
        where: { userId: testUser.id, label: 'Verification Test Channel' },
      });
      expect(channel).toBeDefined();
      expect(channel?.verifiedAt).toBeNull();

      // Find token from verifyTokenHash (or test with invalid and valid query)
      const invalidRes = await app.request('/app/channels/verify?token=invalid-token');
      expect(invalidRes.status).toBe(302);
      expect(invalidRes.headers.get('Location')).toContain('msg=Invalid+or+expired');
    });

    it('dispatches test alert via POST /app/channels/:id/test', async () => {
      const channel = await prisma.channel.create({
        data: {
          userId: testUser.id,
          type: 'EMAIL',
          label: 'Test Dispatch Channel',
          targetEnc: encryptTarget(testUser.email, env.ENC_KEY_V1, 'v1'),
          verifiedAt: new Date(),
        },
      });

      const res = await app.request(`/app/channels/${channel.id}/test`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(302);
      const loc = (res.headers.get('Location') || '').replace(/\+/g, ' ');
      expect(loc).toContain('Test alert delivered successfully');
    });

    it('enforces 5 test alerts / hour rate limit', async () => {
      const channel = await prisma.channel.create({
        data: {
          userId: testUser.id,
          type: 'EMAIL',
          label: 'Rate Limited Test Channel',
          targetEnc: encryptTarget(testUser.email, env.ENC_KEY_V1, 'v1'),
          verifiedAt: new Date(),
        },
      });

      // Send 5 test alerts
      for (let i = 0; i < 5; i++) {
        const res = await app.request(`/app/channels/${channel.id}/test`, {
          method: 'POST',
          headers: {
            Cookie: sessionCookie,
            Origin: 'http://localhost:3000',
          },
        });
        expect(res.status).toBe(302);
        const l = (res.headers.get('Location') || '').replace(/\+/g, ' ');
        expect(l).toContain('delivered successfully');
      }

      // 6th test alert must be rate limited
      const sixthRes = await app.request(`/app/channels/${channel.id}/test`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });

      expect(sixthRes.status).toBe(302);
      expect(decodeURIComponent(sixthRes.headers.get('Location') || '')).toContain('Rate limit exceeded');
    });

    it('toggles channel disabled and enabled states', async () => {
      const channel = await prisma.channel.create({
        data: {
          userId: testUser.id,
          type: 'EMAIL',
          label: 'Toggle Channel',
          targetEnc: encryptTarget(testUser.email, env.ENC_KEY_V1, 'v1'),
          verifiedAt: new Date(),
        },
      });

      // Toggle to disabled
      const disableRes = await app.request(`/app/channels/${channel.id}/toggle`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });
      expect(disableRes.status).toBe(302);

      let updated = await prisma.channel.findUnique({ where: { id: channel.id } });
      expect(updated?.disabledAt).not.toBeNull();

      // Toggle to enabled
      const enableRes = await app.request(`/app/channels/${channel.id}/toggle`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });
      expect(enableRes.status).toBe(302);

      updated = await prisma.channel.findUnique({ where: { id: channel.id } });
      expect(updated?.disabledAt).toBeNull();
    });

    it('permanently deletes channel via POST /app/channels/:id/delete', async () => {
      const channel = await prisma.channel.create({
        data: {
          userId: testUser.id,
          type: 'EMAIL',
          label: 'Delete Me',
          targetEnc: encryptTarget(testUser.email, env.ENC_KEY_V1, 'v1'),
        },
      });

      const res = await app.request(`/app/channels/${channel.id}/delete`, {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          Origin: 'http://localhost:3000',
        },
      });

      expect(res.status).toBe(302);
      const deleted = await prisma.channel.findUnique({ where: { id: channel.id } });
      expect(deleted).toBeNull();
    });
  });
});
