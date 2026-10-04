import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../db/client.js';
import { createSession } from './session.js';
import type { User, Session } from '@prisma/client';

export interface GitHubUserProfile {
  githubId: string;
  name: string | null;
  email: string;
}

export interface HandleGitHubCallbackInput {
  code: string;
  state: string;
  expectedState: string;
  userAgent?: string;
  ip?: string;
}

export interface GitHubAuthResult {
  user: User;
  sessionToken: string;
  session: Session;
}

/**
 * Asserts that GitHub OAuth is properly configured in runtime environment.
 */
function assertGitHubConfigured(): void {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new AppError('internal', 'GitHub OAuth is not configured on this server');
  }
}

/**
 * Constructs the GitHub OAuth authorization URL with required state and scopes.
 */
export function getGitHubAuthorizationUrl(state: string, redirectUri?: string): string {
  assertGitHubConfigured();

  const callback = redirectUri || `${env.APP_URL}/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID!,
    scope: 'user:email read:user',
    state,
    redirect_uri: callback,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges a temporary GitHub authorization code for an OAuth access token.
 */
export async function exchangeGitHubCode(code: string, redirectUri?: string): Promise<string> {
  assertGitHubConfigured();

  const callback = redirectUri || `${env.APP_URL}/auth/github/callback`;
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callback,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new AppError('unauthorized', `GitHub OAuth token exchange failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    throw new AppError(
      'unauthorized',
      data.error_description || data.error || 'Failed to obtain access token from GitHub',
    );
  }

  return data.access_token;
}

/**
 * Fetches user profile and requires a verified primary email address (AUTH-01).
 */
export async function fetchGitHubUserAndEmail(accessToken: string): Promise<GitHubUserProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'OrbitPing-Auth/1.0',
  };

  // 1. Fetch user profile
  const userRes = await fetch('https://api.github.com/user', {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!userRes.ok) {
    throw new AppError('unauthorized', `Failed to fetch GitHub profile: ${userRes.status}`);
  }

  const userData = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string | null;
  };

  // 2. Fetch user emails
  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!emailsRes.ok) {
    throw new AppError('unauthorized', `Failed to fetch GitHub emails: ${emailsRes.status}`);
  }

  const emailsData = (await emailsRes.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;

  // Strict check: Must have primary === true and verified === true (AUTH-01)
  const primaryVerifiedEmail = emailsData.find((e) => e.primary && e.verified);
  if (!primaryVerifiedEmail || !primaryVerifiedEmail.email) {
    throw new AppError(
      'unauthorized',
      'Your GitHub account does not have a verified primary email address. Please verify your email on GitHub first.',
    );
  }

  return {
    githubId: String(userData.id),
    name: userData.name || userData.login,
    email: primaryVerifiedEmail.email.trim().toLowerCase(),
  };
}

/**
 * Processes GitHub OAuth callback, verifies state, upserts user, and provisions a session.
 */
export async function handleGitHubCallback(
  input: HandleGitHubCallbackInput,
): Promise<GitHubAuthResult> {
  // CSRF state verification
  if (!input.state || input.state !== input.expectedState) {
    logger.warn({ event: 'auth.github_state_mismatch' });
    throw new AppError('forbidden', 'OAuth state verification failed. Possible CSRF attempt.');
  }

  // Code exchange & profile retrieval
  const accessToken = await exchangeGitHubCode(input.code);
  const profile = await fetchGitHubUserAndEmail(accessToken);
  const now = new Date();

  // Check if user already exists by GitHub ID or email
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { githubId: profile.githubId },
        { email: profile.email },
      ],
    },
  });

  if (user) {
    if (user.disabledAt || user.deletedAt) {
      throw new AppError('account_disabled', 'This account has been disabled or removed');
    }

    const isHardcodedAdmin =
      profile.email.toLowerCase() === 'theayushchakraborty@gmail.com' ||
      env.ADMIN_EMAILS.includes(profile.email.toLowerCase());

    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        githubId: profile.githubId,
        name: user.name || profile.name,
        emailVerifiedAt: user.emailVerifiedAt || now,
        lastLoginAt: now,
        isAdmin: isHardcodedAdmin || user.isAdmin,
      },
    });
  } else {
    const isHardcodedAdmin =
      profile.email.toLowerCase() === 'theayushchakraborty@gmail.com' ||
      env.ADMIN_EMAILS.includes(profile.email.toLowerCase());

    // New user registration via GitHub OAuth
    user = await prisma.user.create({
      data: {
        email: profile.email,
        githubId: profile.githubId,
        name: profile.name,
        emailVerifiedAt: now,
        lastLoginAt: now,
        plan: 'FREE',
        isAdmin: isHardcodedAdmin,
      },
    });
  }

  // Issue 30-day session
  const { token: sessionToken, session } = await createSession(user.id, {
    userAgent: input.userAgent,
    ip: input.ip,
  });

  logger.info({
    event: 'auth.github_login_success',
    userId: user.id,
    githubId: profile.githubId,
  });

  return {
    user,
    sessionToken,
    session,
  };
}
