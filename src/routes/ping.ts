import { Hono } from 'hono';
import { handlePing, type PingKind } from '../domain/ping.js';
import { checkRateLimit, isNegativeCached } from '../security/ratelimit.js';
import { CONSTANTS } from '../config/constants.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const pingRouter = new Hono();

/**
 * Extract client IP from proxy headers or socket address.
 */
export function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf && cf.trim()) return cf.trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim()) {
    const first = forwarded.split(',')[0];
    if (first && first.trim()) return first.trim();
  }

  return '127.0.0.1';
}

/**
 * Stream request body up to 1,024 bytes (1 KB), discarding excess bytes.
 * Strips ASCII control characters and truncates to 256 characters for storage.
 */
export async function extractPingPayload(req: Request): Promise<string | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const MAX_READ = 1024; // 1 KB read limit (D-08)

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const remaining = MAX_READ - totalBytes;
        if (value.byteLength <= remaining) {
          chunks.push(value);
          totalBytes += value.byteLength;
        } else {
          chunks.push(value.subarray(0, remaining));
          totalBytes += remaining;
          await reader.cancel();
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) return null;
  const decoded = new TextDecoder().decode(Buffer.concat(chunks));
  // Strip ASCII control characters (0x00-0x1F excluding \n and \t) and DEL (0x7F)
  const sanitized = decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return sanitized.length > 0 ? sanitized.slice(0, 256) : null;
}

// IP rate limit and negative cache guard middleware
pingRouter.use('*', async (c, next) => {
  const ip = getClientIp(c.req.raw);
  const rl = checkRateLimit(`ip:${ip}`, CONSTANTS.RATE_LIMIT_PINGS_PER_IP_MINUTE, 60);
  if (!rl.allowed) {
    c.header('Retry-After', String(rl.retryAfter || 60));
    return c.text('Too Many Requests', 429);
  }

  const uuid = c.req.param('uuid');
  if (uuid && isNegativeCached(uuid)) {
    return c.text('Not Found', 404);
  }

  return next();
});

// Helper for executing handlePing with standard HTTP responses
async function dispatchPing(
  c: any,
  kind: PingKind,
  extraOpts: { runId?: string | null; body?: string | null; msg?: string | null; exitCode?: number | null } = {},
) {
  const uuid = c.req.param('uuid');
  const ip = getClientIp(c.req.raw);
  const rid = c.req.query('rid') || extraOpts.runId || null;

  try {
    await handlePing(uuid, kind, {
      ip,
      runId: rid,
      body: extraOpts.body,
      msg: extraOpts.msg,
      exitCode: extraOpts.exitCode,
    });

    if (c.req.method === 'HEAD') {
      return c.body(null, 200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
    }

    return c.text('OK', 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      if (err.code === 'not_found') {
        return c.text('Not Found', 404);
      }
      if (err.code === 'rate_limited') {
        c.header('Retry-After', '5');
        return c.text('Too Many Requests', 429);
      }
    }
    logger.error({ err, uuid, kind }, 'Ping ingestion exception');
    return c.text('Service Unavailable', 503);
  }
}

// 1. Success ping: GET/POST/HEAD /:uuid
pingRouter.on(['GET', 'POST', 'HEAD'], '/:uuid{[0-9a-fA-F-]{36}}', async (c) => {
  return dispatchPing(c, 'SUCCESS');
});

// 2. Start ping: GET/POST /:uuid/start
pingRouter.on(['GET', 'POST'], '/:uuid{[0-9a-fA-F-]{36}}/start', async (c) => {
  return dispatchPing(c, 'START');
});

// 3. Fail ping: GET/POST /:uuid/fail
pingRouter.on(['GET', 'POST'], '/:uuid{[0-9a-fA-F-]{36}}/fail', async (c) => {
  const payload = await extractPingPayload(c.req.raw);
  const msg = c.req.query('msg') || null;
  return dispatchPing(c, 'FAIL', { body: payload, msg, exitCode: 1 });
});

// 4. Exit code ping: GET/POST /:uuid/:exitCode
pingRouter.on(['GET', 'POST'], '/:uuid{[0-9a-fA-F-]{36}}/:exitCode', async (c) => {
  const exitCodeRaw = c.req.param('exitCode');
  if (!/^[0-9]+$/.test(exitCodeRaw)) {
    return c.text('Bad Request: Invalid exit code (0..255)', 400);
  }
  const code = parseInt(exitCodeRaw, 10);
  if (code < 0 || code > 255) {
    return c.text('Bad Request: Invalid exit code (0..255)', 400);
  }

  if (code === 0) {
    return dispatchPing(c, 'SUCCESS');
  }

  const payload = await extractPingPayload(c.req.raw);
  const msg = c.req.query('msg') || null;
  return dispatchPing(c, 'FAIL', { body: payload, msg, exitCode: code });
});

// Catch-all 405 for unsupported HTTP methods on ping routes
pingRouter.all('/:uuid{[0-9a-fA-F-]{36}}/*', (c) => {
  return c.text('Method Not Allowed', 405);
});

pingRouter.all('/:uuid{[0-9a-fA-F-]{36}}', (c) => {
  return c.text('Method Not Allowed', 405);
});
