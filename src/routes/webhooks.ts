import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { prisma } from '../db/client.js';
import { encryptTarget } from '../security/crypto.js';
import { hashToken } from '../security/crypto.js';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';

const webhooksRouter = new Hono();

/**
 * Telegram Bot webhook endpoint for channel verification
 * Handles /start <token> commands from users
 */
webhooksRouter.post('/telegram/:secret', async (c) => {
  // Verify secret matches environment configuration
  const secret = c.req.param('secret');
  if (!isValidSecret(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    logger.warn({ event: 'telegram.webhook.unauthorized' });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Parse Telegram update
  let update: { message?: { text?: string; chat: { id: number | string } } };
  try {
    update = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const message = update.message;

  // Only process /start commands
  if (!message?.text?.startsWith('/start ')) {
    // Ignore other messages/commands
    return c.json({ ok: true });
  }

  // Extract verification token from /start command
  const parts = message.text.split(' ');
  if (parts.length < 2) {
    await sendTelegramMessage(message.chat.id.toString(), '❌ Missing verification code.');
    return c.json({ ok: true });
  }

  const token = parts[1];
  const chatId = message.chat.id.toString();

  logger.info({
    event: 'telegram.verification_attempt',
    chatId: chatId.slice(0, 3) + '***',
  });

  // Find channel with matching token hash
  const tokenHash = hashToken(token);
  const channel = await prisma.channel.findFirst({
    where: {
      type: 'TELEGRAM',
      verifyTokenHash: tokenHash,
      verifyExpiresAt: { gt: new Date() },
    },
  });

  if (!channel) {
    logger.warn({
      event: 'telegram.verification_failed',
      chatId: chatId.slice(0, 3) + '***',
      reason: 'invalid_or_expired_token',
    });

    await sendTelegramMessage(
      chatId,
      '❌ Invalid or expired verification code.\n\n' +
      'Please generate a new verification link from the OrbitPing dashboard.'
    );
    return c.json({ ok: true });
  }

  // Get encryption key for storing chatId
  const keyHex = env.ENC_KEY_V1;

  // Store encrypted chatId and mark channel as verified
  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      targetEnc: encryptTarget(chatId, keyHex, 'v1'),
      verifiedAt: new Date(),
      verifyTokenHash: null,
      verifyExpiresAt: null,
    },
  });

  logger.info({
    event: 'telegram.verification_success',
    channelId: channel.id,
    chatId: chatId.slice(0, 3) + '***',
  });

  await sendTelegramMessage(
    chatId,
    '✅ Successfully linked!\n\n' +
    'You will now receive alerts from OrbitPing in this chat.'
  );

  return c.json({ ok: true });
});

/**
 * Constant-time comparison of the path secret; fails closed when unconfigured.
 */
function isValidSecret(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Helper function to send a message via Telegram Bot API
 */
async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.error({ event: 'telegram.send_failed', reason: 'no_bot_token' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error({
        event: 'telegram.send_failed',
        status: response.status,
        error: errorText,
      });
    }
  } catch (error) {
    logger.error({
      event: 'telegram.send_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export { webhooksRouter };
