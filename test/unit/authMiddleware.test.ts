import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Hono } from 'hono';
import { prisma } from '../../src/db/client.js';
import { createSession } from '../../src/auth/session.js';
import { requireAuth, optionalAuth } from '../../src/auth/middleware.js';
import { AppError } from '../../src/lib/errors.js';

describe('Auth Middleware (src/auth/middleware.ts)', () => {
  let testUser: { id: string; email: string };
  let app: Hono;

  beforeEach(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `middleware-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        plan: 'FREE',
      },
    });

    app = new Hono();

    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), { status: err.status as any });
      }
      return c.json({ error: 'Internal' }, 500);
    });

    app.get('/protected', requireAuth, (c) => {
      const user = c.get('user');
      const session = c.get('session');
      return c.json({ ok: true, userId: user.id, email: user.email, sessionId: session.idHash });
    });

    app.get('/optional', optionalAuth, (c) => {
      const user = c.get('user');
      return c.json({ ok: true, authenticated: Boolean(user), userId: user?.id || null });
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('requireAuth rejects unauthenticated requests with 401', async () => {
    const res = await app.request('/protected');
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('requireAuth rejects invalid session token with 401', async () => {
    const res = await app.request('/protected', {
      headers: {
        Cookie: 'orbitping_session=invalid-fake-token-12345',
      },
    });
    expect(res.status).toBe(401);
  });

  it('requireAuth accepts valid cookie session and sets user context', async () => {
    const { token } = await createSession(testUser.id);
    const res = await app.request('/protected', {
      headers: {
        Cookie: `orbitping_session=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.userId).toBe(testUser.id);
    expect(body.email).toBe(testUser.email);
  });

  it('requireAuth accepts valid Bearer authorization header', async () => {
    const { token } = await createSession(testUser.id);
    const res = await app.request('/protected', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(testUser.id);
  });

  it('optionalAuth allows unauthenticated request through without user', async () => {
    const res = await app.request('/optional');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.userId).toBeNull();
  });

  it('optionalAuth populates user when valid session is supplied', async () => {
    const { token } = await createSession(testUser.id);
    const res = await app.request('/optional', {
      headers: {
        Cookie: `orbitping_session=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.userId).toBe(testUser.id);
  });
});
