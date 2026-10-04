import { randomBytes } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const CSRF_COOKIE_NAME = 'orbitping_csrf';

/**
 * Generates a random 32-byte hex CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Sets the CSRF cookie on the response.
 */
export function setCsrfCookie(c: Context, token?: string): string {
  const activeToken = token || generateCsrfToken();
  setCookie(c, CSRF_COOKIE_NAME, activeToken, {
    path: '/',
    httpOnly: false, // Accessible to client scripts/HTMX to send as header
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 86400, // 24 hours
  });
  return activeToken;
}

/**
 * Checks whether an incoming origin/referer matches the application URL.
 */
function isAllowedOrigin(originOrReferer: string): boolean {
  try {
    const requestOrigin = new URL(originOrReferer).origin;
    const appOrigin = new URL(env.APP_URL).origin;

    if (requestOrigin === appOrigin) {
      return true;
    }

    // In non-production environments, allow localhost variations
    if (env.NODE_ENV !== 'production') {
      const parsed = new URL(originOrReferer);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

const UUID_PATH_REGEX =
  /^\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\/.*)?$/;

/**
 * CSRF defense middleware protecting state-changing requests (AUTH-04).
 * Safe methods and whitelisted public webhooks/ping routes bypass this check.
 */
export const csrfProtection: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();

  // Safe HTTP methods do not mutate state
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const path = c.req.path;

  // Bypassed public endpoints: ping endpoints (both /ping and short-form /:uuid), webhooks, and magic-link entry
  if (
    path.startsWith('/ping') ||
    path.startsWith('/webhooks') ||
    path === '/auth/magic-link' ||
    UUID_PATH_REGEX.test(path)
  ) {
    return next();
  }

  // 1. Origin / Referer validation
  const origin = c.req.header('Origin');
  const referer = c.req.header('Referer');

  if (origin && !isAllowedOrigin(origin)) {
    logger.warn({ event: 'csrf.rejected', reason: 'disallowed_origin', origin });
    throw new AppError('forbidden', 'Cross-origin request blocked');
  }

  if (!origin && referer && !isAllowedOrigin(referer)) {
    logger.warn({ event: 'csrf.rejected', reason: 'disallowed_referer', referer });
    throw new AppError('forbidden', 'Cross-origin request blocked');
  }

  // 2. Token / AJAX header validation
  // Accept standard AJAX header or double-submit CSRF cookie
  const requestedWith = c.req.header('X-Requested-With');
  const csrfHeader = c.req.header('X-CSRF-Token') || c.req.header('X-OrbitPing-CSRF');
  const csrfCookie = getCookie(c, CSRF_COOKIE_NAME);

  if (requestedWith === 'XMLHttpRequest' || c.req.header('HX-Request') === 'true') {
    return next();
  }

  if (csrfHeader && csrfCookie && csrfHeader === csrfCookie) {
    return next();
  }

  // If origin/referer strictly matched the allowed origin
  if (origin && isAllowedOrigin(origin)) {
    return next();
  }

  if (!origin && referer && isAllowedOrigin(referer)) {
    return next();
  }

  logger.warn({
    event: 'csrf.blocked',
    path,
    method,
  });

  throw new AppError('forbidden', 'CSRF validation failed');
};
