import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { createSession, SESSION_COOKIE_NAME } from '../../src/auth/session.js';
import { env } from '../../src/env.js';

describe('Auth Routes (Integration)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Passwordless Magic Link Flow', () => {
    it('executes full magic link flow: request -> verify -> /auth/me -> logout', async () => {
      const email = `integration-flow-${Date.now()}@example.com`;

      // 1. Request magic link
      const requestRes = await app.request('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      expect(requestRes.status).toBe(200);
      const requestBody = await requestRes.json();
      expect(requestBody.ok).toBe(true);
      expect(requestBody.previewUrl).toBeDefined();

      const url = new URL(requestBody.previewUrl);
      const token = url.searchParams.get('token');
      expect(token).toBeDefined();

      // 2. Verify token
      const verifyRes = await app.request(`/auth/verify?token=${token}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.ok).toBe(true);
      expect(verifyBody.user.email).toBe(email);

      // Extract session cookie from Set-Cookie header
      const setCookie = verifyRes.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(SESSION_COOKIE_NAME);

      const cookieVal = setCookie!.split(';')[0]; // e.g. orbitping_session=...

      // 3. Access /auth/me with session cookie
      const meRes = await app.request('/auth/me', {
        method: 'GET',
        headers: {
          Cookie: cookieVal,
        },
      });

      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.ok).toBe(true);
      expect(meBody.user.email).toBe(email);
      expect(meBody.user.plan).toBe('FREE');
      expect(meBody.session.expiresAt).toBeDefined();

      // 4. Logout
      const logoutRes = await app.request('/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: cookieVal,
          'X-Requested-With': 'XMLHttpRequest', // CSRF bypass
        },
      });

      expect(logoutRes.status).toBe(200);

      // 5. Verify /auth/me is now 401 Unauthorized
      const meAfterLogout = await app.request('/auth/me', {
        method: 'GET',
        headers: {
          Cookie: cookieVal,
        },
      });
      expect(meAfterLogout.status).toBe(401);
    });
  });

  describe('Session Revocation (Sign Out Everywhere)', () => {
    it('invalidates all active sessions for a user upon /auth/logout-all', async () => {
      const email = `signout-all-${Date.now()}@example.com`;
      const user = await prisma.user.create({
        data: { email, plan: 'FREE' },
      });

      const s1 = await createSession(user.id);
      const s2 = await createSession(user.id);

      // Both sessions active
      const res1 = await app.request('/auth/me', {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${s1.token}` },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request('/auth/me', {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${s2.token}` },
      });
      expect(res2.status).toBe(200);

      // Call logout-all using session 1
      const logoutAllRes = await app.request('/auth/logout-all', {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${s1.token}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      expect(logoutAllRes.status).toBe(200);
      const body = await logoutAllRes.json();
      expect(body.revokedCount).toBeGreaterThanOrEqual(2);

      // Now both sessions are rejected
      const verifyS1 = await app.request('/auth/me', {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${s1.token}` },
      });
      expect(verifyS1.status).toBe(401);

      const verifyS2 = await app.request('/auth/me', {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${s2.token}` },
      });
      expect(verifyS2.status).toBe(401);
    });
  });

  describe('GitHub OAuth Routes', () => {
    it('/auth/github sets state cookie and redirects to GitHub', async () => {
      const origClientId = env.GITHUB_CLIENT_ID;
      const origClientSecret = env.GITHUB_CLIENT_SECRET;
      (env as any).GITHUB_CLIENT_ID = 'test-id';
      (env as any).GITHUB_CLIENT_SECRET = 'test-secret';

      try {
        const res = await app.request('/auth/github', { method: 'GET' });
        expect(res.status).toBe(302);

        const location = res.headers.get('location');
        expect(location).toContain('https://github.com/login/oauth/authorize');

        const setCookie = res.headers.get('set-cookie');
        expect(setCookie).toContain('orbitping_oauth_state');
      } finally {
        (env as any).GITHUB_CLIENT_ID = origClientId;
        (env as any).GITHUB_CLIENT_SECRET = origClientSecret;
      }
    });

    it('/auth/github/callback handles callback and provisions session', async () => {
      const origClientId = env.GITHUB_CLIENT_ID;
      const origClientSecret = env.GITHUB_CLIENT_SECRET;
      (env as any).GITHUB_CLIENT_ID = 'test-id';
      (env as any).GITHUB_CLIENT_SECRET = 'test-secret';

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://github.com/login/oauth/access_token') {
          return { ok: true, json: async () => ({ access_token: 'gho_dummy_token' }) };
        }
        if (url === 'https://api.github.com/user') {
          return { ok: true, json: async () => ({ id: 887766, login: 'octouser', name: 'Octo User' }) };
        }
        if (url === 'https://api.github.com/user/emails') {
          return {
            ok: true,
            json: async () => [{ email: 'octo@github.com', primary: true, verified: true }],
          };
        }
        throw new Error(`Unexpected url ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      try {
        const state = 'matching-test-state-123';
        const res = await app.request(`/auth/github/callback?code=mock-code&state=${state}`, {
          method: 'GET',
          headers: {
            Cookie: `orbitping_oauth_state=${state}`,
            Accept: 'application/json',
          },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.user.email).toBe('octo@github.com');
        expect(body.user.githubId).toBe('887766');

        const setCookie = res.headers.get('set-cookie');
        expect(setCookie).toContain(SESSION_COOKIE_NAME);
      } finally {
        (env as any).GITHUB_CLIENT_ID = origClientId;
        (env as any).GITHUB_CLIENT_SECRET = origClientSecret;
        vi.unstubAllGlobals();
      }
    });
  });
});
