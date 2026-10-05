import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../auth/middleware.js';
import {
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  destroyAllUserSessions,
  getSessionTokenFromCookie,
} from '../auth/session.js';
import { requestMagicLink, verifyMagicLink } from '../auth/magicLink.js';
import { getGitHubAuthorizationUrl, handleGitHubCallback } from '../auth/github.js';

export const authRouter = new Hono();

const OAUTH_STATE_COOKIE = 'orbitping_oauth_state';

/**
 * Extracts client IP from standard proxy headers or socket.
 */
function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '127.0.0.1';
}

/**
 * Initiates GitHub OAuth authorization flow
 */
authRouter.get('/github', (c) => {
  const state = randomBytes(32).toString('hex');

  setCookie(c, OAUTH_STATE_COOKIE, state, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 600, // 10 minutes
  });

  const authUrl = getGitHubAuthorizationUrl(state);
  return c.redirect(authUrl);
});

/**
 * Handles GitHub OAuth callback
 */
authRouter.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    const errorDesc = c.req.query('error_description') || error;
    logger.warn({ event: 'auth.github_oauth_error', error: errorDesc });
    throw new AppError('unauthorized', `GitHub authorization failed: ${errorDesc}`);
  }

  if (!code || !state) {
    throw new AppError('invalid_input', 'Missing code or state parameter from GitHub callback');
  }

  const expectedState = getCookie(c, OAUTH_STATE_COOKIE) || '';
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

  const clientIp = getClientIp(c.req.raw);
  const userAgent = c.req.header('user-agent');

  const result = await handleGitHubCallback({
    code,
    state,
    expectedState,
    ip: clientIp,
    userAgent,
  });

  setSessionCookie(c, result.sessionToken);

  if (c.req.header('accept')?.includes('application/json')) {
    return c.json({ ok: true, user: result.user });
  }

  return c.redirect('/dashboard');
});

/**
 * Requests a passwordless login magic link email
 */
authRouter.post('/magic-link', async (c) => {
  let email: string | undefined;
  let turnstileToken: string | undefined;

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await c.req.json();
      email = body.email;
      turnstileToken = body.turnstileToken;
    } catch {
      throw new AppError('invalid_input', 'Invalid JSON body');
    }
  } else {
    const body = await c.req.parseBody();
    email = typeof body.email === 'string' ? body.email : undefined;
    turnstileToken =
      typeof body['cf-turnstile-response'] === 'string'
        ? body['cf-turnstile-response']
        : typeof body.turnstileToken === 'string'
        ? body.turnstileToken
        : undefined;
  }

  if (!email) {
    throw new AppError('invalid_input', 'Email is required', undefined, { field: 'email' });
  }

  const clientIp = getClientIp(c.req.raw);
  const result = await requestMagicLink({
    email,
    clientIp,
    turnstileToken,
  });

  const wantsJson =
    c.req.header('accept')?.includes('application/json') ||
    contentType.includes('application/json') ||
    c.req.header('x-requested-with') === 'XMLHttpRequest';

  if (wantsJson) {
    return c.json({
      ok: true,
      message: 'If the email is valid, a login link has been sent.',
      previewUrl: result.previewUrl,
    });
  }

  return c.redirect('/login?sent=true');
});

/**
 * Verifies single-use magic link token and provisions session
 */
authRouter.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    throw new AppError('invalid_input', 'Missing token query parameter', undefined, { field: 'token' });
  }

  const clientIp = getClientIp(c.req.raw);
  const userAgent = c.req.header('user-agent');

  const result = await verifyMagicLink(token, {
    ip: clientIp,
    userAgent,
  });

  setSessionCookie(c, result.sessionToken);

  if (c.req.header('accept')?.includes('application/json')) {
    return c.json({ ok: true, user: result.user });
  }

  return c.redirect('/dashboard');
});

/**
 * Logs out current active session
 */
authRouter.post('/logout', requireAuth, async (c) => {
  const token = getSessionTokenFromCookie(c);
  if (token) {
    await destroySession(token);
  }

  clearSessionCookie(c);

  logger.info({ event: 'auth.logout', userId: c.get('user').id });

  const wantsJson =
    c.req.header('accept')?.includes('application/json') ||
    c.req.header('x-requested-with') === 'XMLHttpRequest' ||
    (c.req.header('content-type') || '').includes('application/json') ||
    !(c.req.header('accept') || '').includes('text/html');

  if (wantsJson) {
    return c.json({ ok: true });
  }

  return c.redirect('/login');
});

/**
 * Revokes all sessions for current user ("sign out everywhere")
 */
authRouter.post('/logout-all', requireAuth, async (c) => {
  const user = c.get('user');
  const count = await destroyAllUserSessions(user.id);

  clearSessionCookie(c);

  logger.info({ event: 'auth.logout_all', userId: user.id, revokedCount: count });

  const wantsJson =
    c.req.header('accept')?.includes('application/json') ||
    c.req.header('x-requested-with') === 'XMLHttpRequest' ||
    (c.req.header('content-type') || '').includes('application/json') ||
    !(c.req.header('accept') || '').includes('text/html');

  if (wantsJson) {
    return c.json({ ok: true, revokedCount: count });
  }

  return c.redirect('/login');
});

/**
 * Returns current authenticated user and session information
 */
authRouter.get('/me', requireAuth, (c) => {
  const user = c.get('user');
  const session = c.get('session');

  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      planStatus: user.planStatus,
      isAdmin: user.isAdmin,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    session: {
      idHash: session.idHash,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    },
  });
});
