import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { csrfProtection, setCsrfCookie, CSRF_COOKIE_NAME } from '../../src/auth/csrf.js';
import { AppError } from '../../src/lib/errors.js';
import { env } from '../../src/env.js';

describe('CSRF Defense (src/auth/csrf.ts)', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();

    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), { status: err.status as any });
      }
      return c.json({ error: 'Internal' }, 500);
    });

    app.use('*', csrfProtection);

    app.get('/safe-route', (c) => c.text('GET OK'));
    app.post('/protected-action', (c) => c.text('POST OK'));
    app.post('/ping/sample-uuid', (c) => c.text('PING OK'));
    app.post('/webhooks/telegram/secret', (c) => c.text('WEBHOOK OK'));
    app.post('/auth/magic-link', (c) => c.text('MAGIC LINK OK'));
  });

  it('allows safe GET requests without any CSRF tokens or origin checks', async () => {
    const res = await app.request('/safe-route', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('GET OK');
  });

  it('bypasses public endpoints like /ping, /webhooks, and /auth/magic-link', async () => {
    const r1 = await app.request('/ping/sample-uuid', { method: 'POST' });
    expect(r1.status).toBe(200);

    const r2 = await app.request('/webhooks/telegram/secret', { method: 'POST' });
    expect(r2.status).toBe(200);

    const r3 = await app.request('/auth/magic-link', { method: 'POST' });
    expect(r3.status).toBe(200);
  });

  it('allows requests with XMLHttpRequest custom header', async () => {
    const res = await app.request('/protected-action', {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST OK');
  });

  it('allows requests with matching double-submit CSRF cookie and header', async () => {
    const token = 'csrf-secret-token-12345';
    const res = await app.request('/protected-action', {
      method: 'POST',
      headers: {
        Cookie: `${CSRF_COOKIE_NAME}=${token}`,
        'X-CSRF-Token': token,
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST OK');
  });

  it('blocks cross-origin requests from untrusted origins', async () => {
    const res = await app.request('/protected-action', {
      method: 'POST',
      headers: {
        Origin: 'https://evil-attacker.example.com',
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('forbidden');
  });

  it('allows requests matching the configured APP_URL origin', async () => {
    const appOrigin = new URL(env.APP_URL).origin;
    const res = await app.request('/protected-action', {
      method: 'POST',
      headers: {
        Origin: appOrigin,
      },
    });

    expect(res.status).toBe(200);
  });
});
