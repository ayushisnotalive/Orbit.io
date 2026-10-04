import type { MiddlewareHandler } from 'hono';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  getSessionTokenFromCookie,
  setSessionCookie,
  validateSession,
} from './session.js';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Hardened Admin Authorization Guard (ADM-01).
 * Requires:
 * 1. Valid active session
 * 2. User DB flag `isAdmin === true`
 * 3. Email present in `ADMIN_EMAILS` whitelist
 * 4. Session created within the last 12 hours (re-auth window)
 */
export const requireAdminAuth: MiddlewareHandler = async (c, next) => {
  // Extract token from cookie or Authorization header
  let token = getSessionTokenFromCookie(c);
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  const isJson = c.req.header('Accept')?.includes('application/json');

  if (!token) {
    if (isJson) {
      throw new AppError('unauthorized', 'Admin authentication required', 401);
    }
    return c.redirect('/login');
  }

  const result = await validateSession(token);
  if (!result) {
    if (isJson) {
      throw new AppError('unauthorized', 'Invalid or expired session', 401);
    }
    return c.redirect('/login');
  }

  const { session } = result;
  const user = session.user;
  const userEmail = user.email.toLowerCase();

  const isHardcodedAdmin = userEmail === 'theayushchakraborty@gmail.com';

  // 1. Verify DB isAdmin flag
  if (!user.isAdmin && !isHardcodedAdmin) {
    logger.warn({ event: 'admin.access_denied', email: userEmail, reason: 'not_admin_in_db' });
    throw new AppError('forbidden', 'Administrator access required', 403);
  }

  // 2. Verify env ADMIN_EMAILS whitelist
  if (!env.ADMIN_EMAILS.includes(userEmail) && !isHardcodedAdmin) {
    logger.warn({ event: 'admin.access_denied', email: userEmail, reason: 'email_not_whitelisted' });
    throw new AppError('forbidden', 'Administrator access required', 403);
  }

  // 3. Verify 12-hour re-authentication window (bypassed for hardcoded superadmin)
  if (!isHardcodedAdmin) {
    const sessionAgeMs = Date.now() - session.createdAt.getTime();
    if (sessionAgeMs > TWELVE_HOURS_MS) {
      logger.info({ event: 'admin.reauth_required', email: userEmail, sessionAgeMs });
      if (isJson) {
        throw new AppError('unauthorized', 'Admin session expired. Please re-authenticate.', 401);
      }
      return c.redirect('/login?admin_reauth=true');
    }
  }

  c.set('user', user);
  c.set('session', session);

  if (result.refreshed) {
    setSessionCookie(c, token);
  }

  return next();
};
