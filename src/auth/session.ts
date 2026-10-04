import { randomBytes, createHash } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Session, User } from '@prisma/client';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { hashToken } from '../security/crypto.js';

export const SESSION_COOKIE_NAME = 'orbitping_session';
export const SESSION_DURATION_DAYS = 30;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
export const SLIDING_WINDOW_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SessionWithUser extends Session {
  user: User;
}

export interface SessionValidationResult {
  session: SessionWithUser;
  refreshed: boolean;
}

/**
 * Creates a new session for a user, returning the raw secret token and created Session record.
 * The raw token is stored in client cookies; only its SHA-256 hash is saved to `sessions.id_hash`.
 */
export async function createSession(
  userId: string,
  opts?: { userAgent?: string; ip?: string },
): Promise<{ token: string; session: Session }> {
  const token = randomBytes(32).toString('base64url');
  const idHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  const ipHash = opts?.ip ? createHash('sha256').update(opts.ip).digest('hex') : null;

  const session = await prisma.session.create({
    data: {
      idHash,
      userId,
      userAgent: opts?.userAgent ? opts.userAgent.slice(0, 255) : null,
      ipHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    },
  });

  return { token, session };
}

/**
 * Validates a raw session token. Checks expiration, user suspension/deletion,
 * and slides the expiration window forward by 30 days if last seen > 24 hours ago.
 */
export async function validateSession(token: string): Promise<SessionValidationResult | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const idHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { idHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  const now = new Date();

  // Expired session check
  if (session.expiresAt <= now) {
    // Proactively clean up expired session
    await prisma.session.delete({ where: { idHash } }).catch(() => null);
    return null;
  }

  // Suspended or soft-deleted user check
  if (session.user.disabledAt || session.user.deletedAt) {
    return null;
  }

  // Sliding window extension: if last seen > 24 hours ago, extend for another 30 days
  const timeSinceLastSeen = now.getTime() - session.lastSeenAt.getTime();
  if (timeSinceLastSeen > SLIDING_WINDOW_THRESHOLD_MS) {
    const newExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
    const updated = await prisma.session.update({
      where: { idHash },
      data: {
        lastSeenAt: now,
        expiresAt: newExpiresAt,
      },
      include: { user: true },
    });

    return { session: updated, refreshed: true };
  }

  return { session, refreshed: false };
}

/**
 * Revokes a single session by its raw token.
 */
export async function destroySession(token: string): Promise<boolean> {
  if (!token) return false;
  const idHash = hashToken(token);
  try {
    await prisma.session.delete({ where: { idHash } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Revokes all active sessions for a user ("sign out everywhere").
 */
export async function destroyAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId },
  });
  return result.count;
}

/**
 * Extracts raw session token from HTTP request cookies.
 */
export function getSessionTokenFromCookie(c: Context): string | null {
  return getCookie(c, SESSION_COOKIE_NAME) || null;
}

/**
 * Sets the secure, HttpOnly 30-day session cookie.
 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });
}

/**
 * Clears the session cookie from the client.
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
  });
}
