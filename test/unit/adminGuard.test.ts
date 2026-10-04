import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requireAdminAuth } from '../../src/auth/adminGuard.js';
import { env } from '../../src/env.js';
import * as sessionModule from '../../src/auth/session.js';

describe('Admin Authorization Guard (requireAdminAuth)', () => {
  const originalAdminEmails = env.ADMIN_EMAILS;

  beforeEach(() => {
    (env as any).ADMIN_EMAILS = ['admin@orbitping.io', 'ops@orbitping.io'];
  });

  afterEach(() => {
    (env as any).ADMIN_EMAILS = originalAdminEmails;
    vi.restoreAllMocks();
  });

  function createMockContext(options: {
    token?: string;
    accept?: string;
  }) {
    const headers: Record<string, string> = {};
    if (options.accept) headers['Accept'] = options.accept;
    if (options.token) headers['Cookie'] = `orbitping_session=${options.token}`;

    const setVars = new Map<string, any>();
    let redirectUrl: string | null = null;
    let redirectStatus: number | null = null;

    return {
      req: {
        header: (name: string) => headers[name] || (name.toLowerCase() === 'cookie' ? headers['Cookie'] : undefined),
      },
      set: (key: string, val: any) => setVars.set(key, val),
      get: (key: string) => setVars.get(key),
      redirect: (url: string, status = 302) => {
        redirectUrl = url;
        redirectStatus = status;
        return { status, url };
      },
      getRedirect: () => ({ url: redirectUrl, status: redirectStatus }),
    } as any;
  }

  it('allows access for authenticated admin on whitelist with session < 12h', async () => {
    vi.spyOn(sessionModule, 'getSessionTokenFromCookie').mockReturnValue('valid_admin_token');
    vi.spyOn(sessionModule, 'validateSession').mockResolvedValue({
      session: {
        id: 'sess_1',
        createdAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours old
        user: {
          id: 'user_admin',
          email: 'admin@orbitping.io',
          isAdmin: true,
        },
      } as any,
      refreshed: false,
    });

    const c = createMockContext({ token: 'valid_admin_token' });
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    await requireAdminAuth(c, next);
    expect(nextCalled).toBe(true);
    expect(c.get('user')?.email).toBe('admin@orbitping.io');
  });

  it('redirects to /login if unauthenticated', async () => {
    vi.spyOn(sessionModule, 'getSessionTokenFromCookie').mockReturnValue(null);

    const c = createMockContext({});
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    const res = await requireAdminAuth(c, next);
    expect(nextCalled).toBe(false);
    expect(c.getRedirect().url).toBe('/login');
  });

  it('throws 403 if user is not marked as admin in database', async () => {
    vi.spyOn(sessionModule, 'getSessionTokenFromCookie').mockReturnValue('non_admin_token');
    vi.spyOn(sessionModule, 'validateSession').mockResolvedValue({
      session: {
        id: 'sess_2',
        createdAt: new Date(),
        user: {
          id: 'user_norm',
          email: 'admin@orbitping.io', // Whitelisted email, but isAdmin is false
          isAdmin: false,
        },
      } as any,
      refreshed: false,
    });

    const c = createMockContext({ token: 'non_admin_token' });
    const next = async () => {};

    await expect(requireAdminAuth(c, next)).rejects.toThrow(/Administrator access required/);
  });

  it('throws 403 if user is admin in DB but not in ADMIN_EMAILS whitelist', async () => {
    vi.spyOn(sessionModule, 'getSessionTokenFromCookie').mockReturnValue('unlisted_token');
    vi.spyOn(sessionModule, 'validateSession').mockResolvedValue({
      session: {
        id: 'sess_3',
        createdAt: new Date(),
        user: {
          id: 'user_hack',
          email: 'hacker@example.com',
          isAdmin: true, // isAdmin is true, but email is not whitelisted
        },
      } as any,
      refreshed: false,
    });

    const c = createMockContext({ token: 'unlisted_token' });
    const next = async () => {};

    await expect(requireAdminAuth(c, next)).rejects.toThrow(/Administrator access required/);
  });

  it('requires re-auth when session is older than 12 hours', async () => {
    vi.spyOn(sessionModule, 'getSessionTokenFromCookie').mockReturnValue('old_admin_token');
    vi.spyOn(sessionModule, 'validateSession').mockResolvedValue({
      session: {
        id: 'sess_4',
        createdAt: new Date(Date.now() - 13 * 3600 * 1000), // 13 hours old (> 12h)
        user: {
          id: 'user_admin',
          email: 'admin@orbitping.io',
          isAdmin: true,
        },
      } as any,
      refreshed: false,
    });

    const c = createMockContext({ token: 'old_admin_token' });
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    await requireAdminAuth(c, next);
    expect(nextCalled).toBe(false);
    expect(c.getRedirect().url).toBe('/login?admin_reauth=true');
  });
});
