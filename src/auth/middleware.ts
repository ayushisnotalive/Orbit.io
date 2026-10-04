import type { MiddlewareHandler } from 'hono';
import { AppError } from '../lib/errors.js';
import {
  getSessionTokenFromCookie,
  setSessionCookie,
  validateSession,
  type SessionWithUser,
} from './session.js';
import type { User } from '@prisma/client';

declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    session: SessionWithUser;
  }
}

/**
 * Extracts session token from cookie or Authorization header.
 */
function extractToken(c: Parameters<MiddlewareHandler>[0]): string | null {
  const cookieToken = getSessionTokenFromCookie(c);
  if (cookieToken) return cookieToken;

  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Mandatory authentication guard middleware.
 * Throws 401 AppError('unauthorized') if missing or invalid session.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = extractToken(c);
  if (!token) {
    throw new AppError('unauthorized', 'Authentication required');
  }

  const result = await validateSession(token);
  if (!result) {
    throw new AppError('unauthorized', 'Invalid or expired session');
  }

  c.set('user', result.session.user);
  c.set('session', result.session);

  // If session sliding window triggered, refresh the cookie
  if (result.refreshed) {
    setSessionCookie(c, token);
  }

  return next();
};

/**
 * Optional authentication middleware.
 * Populates c.get('user') and c.get('session') if a valid session exists,
 * but allows unauthenticated requests to proceed.
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const token = extractToken(c);
  if (token) {
    const result = await validateSession(token);
    if (result) {
      c.set('user', result.session.user);
      c.set('session', result.session);
      if (result.refreshed) {
        setSessionCookie(c, token);
      }
    }
  }

  return next();
};
