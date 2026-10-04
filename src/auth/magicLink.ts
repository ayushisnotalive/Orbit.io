import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db/client.js';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { hashToken } from '../security/crypto.js';
import { checkRateLimit } from '../security/ratelimit.js';
import { verifyTurnstileToken } from './turnstile.js';
import { createSession } from './session.js';
import type { User, Session } from '@prisma/client';

export const MAGIC_LINK_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes

export interface RequestMagicLinkInput {
  email: string;
  clientIp?: string;
  turnstileToken?: string | null;
}

export interface VerifyMagicLinkResult {
  user: User;
  sessionToken: string;
  session: Session;
}

/**
 * Sends a passwordless login email containing a single-use 15-minute verification token.
 * Rate-limited per IP and email. Always succeeds silently to prevent email enumeration.
 */
export async function requestMagicLink(input: RequestMagicLinkInput): Promise<{ success: boolean; previewUrl?: string }> {
  const email = input.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('invalid_input', 'Invalid email address', undefined, { field: 'email' });
  }

  // Rate limiting: 5 requests per 15 min per email; 20 per hour per IP
  const emailRl = checkRateLimit(`magic-link:email:${email}`, 5, 15 * 60);
  if (!emailRl.allowed) {
    throw new AppError('rate_limited', 'Too many login attempts. Please try again later.');
  }

  if (input.clientIp) {
    const ipRl = checkRateLimit(`magic-link:ip:${input.clientIp}`, 20, 60 * 60);
    if (!ipRl.allowed) {
      throw new AppError('rate_limited', 'Too many requests from this IP. Please try again later.');
    }
  }

  // Turnstile bot verification
  if (input.turnstileToken !== undefined) {
    const turnstileResult = await verifyTurnstileToken(input.turnstileToken, input.clientIp);
    if (!turnstileResult.success) {
      throw new AppError('invalid_input', 'Bot protection verification failed', undefined, { field: 'turnstile' });
    }
  }

  // Generate 32-byte secure random token
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_EXPIRATION_MS);
  const ipHash = input.clientIp ? createHash('sha256').update(input.clientIp).digest('hex') : null;

  // Clean up old expired tokens for this email
  await prisma.loginToken.deleteMany({
    where: {
      email,
      OR: [
        { expiresAt: { lte: now } },
        { usedAt: { not: null } },
      ],
    },
  }).catch(() => null);

  // Store token hash in database
  await prisma.loginToken.create({
    data: {
      tokenHash,
      email,
      ipHash,
      createdAt: now,
      expiresAt,
    },
  });

  const verifyUrl = `${env.APP_URL}/auth/verify?token=${rawToken}`;

  // Deliver magic link email
  if (env.RESEND_API_KEY) {
    try {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: email,
          subject: 'Your OrbitPing Login Link',
          text: `Click the link below to sign in to OrbitPing:\n\n${verifyUrl}\n\nThis link is valid for 15 minutes and can only be used once.\n\nIf you did not request this email, you can safely ignore it.`,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text().catch(() => 'Unknown error');
        logger.error({ event: 'magic_link.email_send_failed', status: emailResponse.status, error: errorText });
      }
    } catch (err) {
      logger.error(err, 'Failed to dispatch magic link email via Resend');
    }
  } else {
    // In local development or test environments without Resend API key, log the link
    logger.info({
      event: 'magic_link.local_delivery',
      email,
      verifyUrl,
    });
  }

  logger.info({
    event: 'auth.magic_link_requested',
    emailMasked: email.replace(/(^.{2})(.*)(@.*$)/, '$1***$3'),
  });

  return {
    success: true,
    previewUrl: env.NODE_ENV !== 'production' ? verifyUrl : undefined,
  };
}

/**
 * Validates a single-use magic link token, marks it used, upserts the user record,
 * and provisions a new 30-day session.
 */
export async function verifyMagicLink(
  rawToken: string,
  opts?: { userAgent?: string; ip?: string },
): Promise<VerifyMagicLinkResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AppError('invalid_input', 'Missing or invalid verification token', undefined, { field: 'token' });
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Find token record
  const tokenRecord = await prisma.loginToken.findUnique({
    where: { tokenHash },
  });

  if (!tokenRecord) {
    throw new AppError('invalid_input', 'Invalid or expired login link');
  }

  if (tokenRecord.usedAt) {
    throw new AppError('invalid_input', 'This login link has already been used');
  }

  if (tokenRecord.expiresAt <= now) {
    throw new AppError('invalid_input', 'This login link has expired');
  }

  // Mark token as used atomically
  await prisma.loginToken.update({
    where: { tokenHash },
    data: { usedAt: now },
  });

  // Upsert user account
  let user = await prisma.user.findUnique({
    where: { email: tokenRecord.email },
  });

  if (user) {
    if (user.disabledAt || user.deletedAt) {
      throw new AppError('account_disabled', 'This account has been disabled or removed');
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt || now,
        lastLoginAt: now,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: tokenRecord.email,
        emailVerifiedAt: now,
        lastLoginAt: now,
        plan: 'FREE',
      },
    });
  }

  // Issue 30-day session
  const { token: sessionToken, session } = await createSession(user.id, opts);

  logger.info({
    event: 'auth.magic_link_verified',
    userId: user.id,
  });

  return {
    user,
    sessionToken,
    session,
  };
}
