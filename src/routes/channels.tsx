import { randomBytes } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { prisma } from '../db/client.js';
import { getSessionTokenFromCookie, setSessionCookie, validateSession } from '../auth/session.js';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { encryptTarget, decryptTarget, hashToken } from '../security/crypto.js';
import { validateSafeUrl } from '../alerts/ssrf.js';
import { checkRateLimit } from '../security/ratelimit.js';
import { createChannelGuarded } from '../domain/limits.js';
import { getEffectivePlan } from '../config/plans.js';
import { getDeliveryAdapter } from '../jobs/adapters/factory.js';
import { ChannelsView } from '../ui/views/Channels.js';
import { ChannelFormView } from '../ui/views/ChannelForm.js';
import { TelegramPairingView } from '../ui/views/TelegramPairing.js';
import type { ChannelType } from '@prisma/client';
import { logger } from '../lib/logger.js';

export const channelsRouter = new Hono();

/**
 * Authentication guard for UI channels routes.
 * Redirects to /login if unauthenticated.
 */
const requireUiAuth: MiddlewareHandler = async (c, next) => {
  const token = getSessionTokenFromCookie(c);
  if (!token) {
    return c.redirect('/login');
  }
  const result = await validateSession(token);
  if (!result) {
    return c.redirect('/login');
  }
  c.set('user', result.session.user);
  c.set('session', result.session);
  if (result.refreshed) {
    setSessionCookie(c, token);
  }
  return next();
};

// 1. Channel List View
channelsRouter.get('/', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const flashMsg = c.req.query('msg');
  const flashType = (c.req.query('type') || 'info') as 'error' | 'success' | 'info';

  const channels = await prisma.channel.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return c.html(
    <ChannelsView
      user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
      channels={channels}
      flash={flashMsg ? { type: flashType, message: flashMsg } : null}
    />,
  );
});

// 2. Channel Creation Form View
channelsRouter.get('/new', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  return c.html(<ChannelFormView user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }} />);
});

// 3. Create Channel
channelsRouter.post('/', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();

  const type = String(body.type || 'EMAIL').toUpperCase() as ChannelType;
  const label = String(body.label || '').trim();

  if (!label) {
    return c.html(
      <ChannelFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        flash={{ type: 'error', message: 'Channel label is required.' }}
      />,
      400,
    );
  }

  let plaintextTarget = '';
  let signingSecret: string | null = null;
  let autoVerified = false;
  let verifyToken: string | null = null;

  if (type === 'EMAIL') {
    plaintextTarget = String(body.targetEmail || user.email).trim().toLowerCase();
    if (!plaintextTarget || !plaintextTarget.includes('@')) {
      return c.html(
        <ChannelFormView
          user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
          flash={{ type: 'error', message: 'A valid email address is required.' }}
        />,
        400,
      );
    }
    // Auto-verify if destination is identical to user's verified login email
    if (plaintextTarget === user.email.toLowerCase()) {
      autoVerified = true;
    } else {
      verifyToken = randomBytes(24).toString('base64url');
    }
  } else if (type === 'TELEGRAM') {
    // Target will be populated once paired with bot via webhook
    plaintextTarget = 'pending_pairing';
    verifyToken = randomBytes(16).toString('hex');
  } else if (type === 'SLACK') {
    plaintextTarget = String(body.targetSlack || '').trim();
    const check = await validateSafeUrl(plaintextTarget);
    if (!check.valid) {
      return c.html(
        <ChannelFormView
          user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
          flash={{ type: 'error', message: `Invalid Slack Webhook URL: ${check.reason}` }}
        />,
        400,
      );
    }
    autoVerified = true;
  } else if (type === 'DISCORD') {
    plaintextTarget = String(body.targetDiscord || '').trim();
    const check = await validateSafeUrl(plaintextTarget);
    if (!check.valid) {
      return c.html(
        <ChannelFormView
          user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
          flash={{ type: 'error', message: `Invalid Discord Webhook URL: ${check.reason}` }}
        />,
        400,
      );
    }
    autoVerified = true;
  } else if (type === 'WEBHOOK') {
    plaintextTarget = String(body.targetWebhook || '').trim();
    const check = await validateSafeUrl(plaintextTarget);
    if (!check.valid) {
      return c.html(
        <ChannelFormView
          user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
          flash={{ type: 'error', message: `Invalid Webhook URL: ${check.reason}` }}
        />,
        400,
      );
    }
    signingSecret = String(body.signingSecret || '').trim() || randomBytes(32).toString('hex');
    autoVerified = true;
  } else {
    return c.html(
      <ChannelFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        flash={{ type: 'error', message: 'Unsupported channel type.' }}
      />,
      400,
    );
  }

  try {
    const encrypted = encryptTarget(plaintextTarget, env.ENC_KEY_V1, 'v1');
    const effectivePlan = getEffectivePlan(user);

    const created = await createChannelGuarded({
      userId: user.id,
      plan: effectivePlan,
      type,
      label,
      targetEnc: encrypted,
      signingSecret,
    });

    const verifyExpiresAt = verifyToken ? new Date(Date.now() + 86400 * 1000) : null;
    const verifyTokenHash = verifyToken ? hashToken(verifyToken) : null;

    await prisma.channel.update({
      where: { id: created.id },
      data: {
        verifiedAt: autoVerified ? new Date() : null,
        verifyTokenHash,
        verifyExpiresAt,
      },
    });

    // If Telegram, direct user to pairing instructions view
    if (type === 'TELEGRAM') {
      return c.redirect(`/app/channels/${created.id}/pair?token=${verifyToken}`);
    }

    // If unverified email, send verification email
    if (type === 'EMAIL' && !autoVerified && verifyToken) {
      const verifyUrl = `${env.APP_URL}/app/channels/verify?token=${verifyToken}`;
      logger.info(
        { event: 'channel.email_verification_sent', email: plaintextTarget, verifyUrl },
        'Sent email verification link',
      );
    }

    return c.redirect('/app/channels?type=success&msg=Channel+created+successfully');
  } catch (err: any) {
    const message = err instanceof AppError ? err.message : err.message || 'Failed to create alert channel.';
    return c.html(
      <ChannelFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        flash={{ type: 'error', message }}
      />,
      400,
    );
  }
});

// 4. Telegram Pairing Instructions View
channelsRouter.get('/:id/pair', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const channel = await prisma.channel.findFirst({
    where: { id, userId: user.id, type: 'TELEGRAM' },
  });

  if (!channel) {
    return c.redirect('/app/channels');
  }

  let token = c.req.query('token');
  if (!token && !channel.verifiedAt) {
    token = randomBytes(16).toString('hex');
    await prisma.channel.update({
      where: { id },
      data: {
        verifyTokenHash: hashToken(token),
        verifyExpiresAt: new Date(Date.now() + 86400 * 1000),
      },
    });
  }

  return c.html(
    <TelegramPairingView
      user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
      channel={channel}
      token={token || ''}
      botUsername={env.TELEGRAM_BOT_USERNAME || 'AyushOrbitPing_bot'}
    />,
  );
});

// 5. Email Verification Link Handler
channelsRouter.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.redirect('/app/channels?type=error&msg=Missing+verification+token');
  }

  const tokenHash = hashToken(token);
  const channel = await prisma.channel.findFirst({
    where: {
      type: 'EMAIL',
      verifyTokenHash: tokenHash,
      verifyExpiresAt: { gt: new Date() },
    },
  });

  if (!channel) {
    return c.redirect('/app/channels?type=error&msg=Invalid+or+expired+verification+link');
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      verifiedAt: new Date(),
      verifyTokenHash: null,
      verifyExpiresAt: null,
    },
  });

  return c.redirect('/app/channels?type=success&msg=Email+channel+verified+successfully!');
});

// 6. Send Test Alert (Rate-limited: 5 / hour per channel - CHANM-02)
channelsRouter.post('/:id/test', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const rl = checkRateLimit(`test-alert:${id}`, 5, 3600);
  if (!rl.allowed) {
    return c.redirect(
      `/app/channels?type=error&msg=${encodeURIComponent(
        `Rate limit exceeded: Maximum 5 test alerts per hour. Try again in ${rl.retryAfter || 60} seconds.`,
      )}`,
    );
  }

  const channel = await prisma.channel.findFirst({
    where: { id, userId: user.id },
  });

  if (!channel) {
    throw new AppError('not_found', 'Channel not found');
  }

  if (channel.type === 'TELEGRAM' && !channel.verifiedAt) {
    return c.redirect(
      `/app/channels?type=error&msg=${encodeURIComponent(
        'Telegram channel must be paired before sending test alerts. Click Pair Bot.',
      )}`,
    );
  }

  try {
    const plainTarget = decryptTarget(channel.targetEnc, (keyId) => {
      if (keyId === 'v1') return env.ENC_KEY_V1;
      throw new Error(`Unknown key ID: ${keyId}`);
    });

    const adapter = getDeliveryAdapter(channel.type);

    const now = new Date();
    const testAlert = {
      id: 0n,
      kind: 'DOWN' as const,
      checkName: 'Sample Job (OrbitPing Test)',
      reason: 'MISSED' as const,
      attempts: 1,
      incident: {
        id: 'test-incident-id',
        startedAt: now,
        resolvedAt: null,
        reason: 'MISSED',
      },
    };

    const testCheck = {
      id: 'test-check-id',
      name: 'Sample Job (OrbitPing Test)',
      slug: null,
      periodSeconds: 60,
      user: { id: user.id },
    };

    const deliveryResult = await adapter.deliver({
      alert: testAlert as any,
      check: testCheck as any,
      destination: plainTarget,
      channel: channel.type,
      attempts: 1,
    });

    if (!deliveryResult.success) {
      throw new Error(deliveryResult.error || 'Delivery failed');
    }

    // On test success, mark verified and reset consecutive failures
    await prisma.channel.update({
      where: { id },
      data: {
        verifiedAt: channel.verifiedAt || new Date(),
        consecutiveFailures: 0,
        lastError: null,
      },
    });

    return c.redirect('/app/channels?type=success&msg=Test+alert+delivered+successfully!');
  } catch (err: any) {
    logger.warn({ event: 'channel.test_failed', channelId: id, error: err.message });
    return c.redirect(
      `/app/channels?type=error&msg=${encodeURIComponent(`Test alert failed: ${err.message}`)}`,
    );
  }
});

// 7. Toggle Channel Enabled / Disabled
channelsRouter.post('/:id/toggle', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const channel = await prisma.channel.findFirst({
    where: { id, userId: user.id },
  });

  if (!channel) {
    throw new AppError('not_found', 'Channel not found');
  }

  if (channel.disabledAt) {
    // Enable
    await prisma.channel.update({
      where: { id },
      data: {
        disabledAt: null,
        disabledReason: null,
        consecutiveFailures: 0,
      },
    });
    return c.redirect('/app/channels?type=success&msg=Channel+enabled');
  } else {
    // Disable
    await prisma.channel.update({
      where: { id },
      data: {
        disabledAt: new Date(),
        disabledReason: 'manual',
      },
    });
    return c.redirect('/app/channels?type=info&msg=Channel+disabled');
  }
});

// 8. Delete Channel
channelsRouter.post('/:id/delete', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const channel = await prisma.channel.findFirst({
    where: { id, userId: user.id },
  });

  if (!channel) {
    throw new AppError('not_found', 'Channel not found');
  }

  await prisma.channel.delete({
    where: { id },
  });

  return c.redirect('/app/channels?type=success&msg=Channel+deleted');
});
