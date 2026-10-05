import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { secureHeaders } from 'hono/secure-headers';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/client.js';
import { pingRouter } from './routes/ping.js';
import { webhooksRouter } from './routes/webhooks.js';
import { authRouter } from './routes/auth.js';
import { uiRouter } from './routes/ui.js';
import { channelsRouter } from './routes/channels.js';
import { billingWebhooksRouter } from './routes/billingWebhooks.js';
import { billingRouter } from './routes/billing.js';
import { adminRouter } from './routes/admin.js';
import { csrfProtection } from './auth/csrf.js';

export const app = new Hono();

// Defense-in-depth Security Headers
app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginResourcePolicy: false,
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
    },
  }),
);

// Global request logger and error handler
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
    },
    'HTTP Request',
  );
});

// Static assets (CSS, JS, icons)
app.use(
  '/static/*',
  serveStatic({
    root: './public',
    rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
  }),
);

// CSRF Defense middleware (mutating browser routes)
app.use('*', csrfProtection);

// Operational health checks
app.get('/healthz', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.text('OK 200', 200, {
      'Cache-Control': 'no-store',
    });
  } catch (error) {
    logger.error(error, 'Database health check failed');
    return c.text('Service Unavailable', 503);
  }
});

app.get('/readyz', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // In Phase 4, we also verify scanner heartbeat freshness
    return c.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    return c.text('Not Ready', 503);
  }
});

// Ping Ingestion Routes
app.route('/ping', pingRouter);

// Authentication Routes
app.route('/auth', authRouter);

// Webhook Routes (Telegram, Billing, etc.)
app.route('/webhooks/billing', billingWebhooksRouter);
app.route('/webhooks/biling', billingWebhooksRouter);
app.route('/webhooks', webhooksRouter);

// Admin Operations Console
app.route('/admin', adminRouter);

// UI Routes (Dashboard, Checks, Channels, Billing, Login)
app.route('/app/channels', channelsRouter);
app.route('/', billingRouter);
app.route('/', uiRouter);

// Short-form ping endpoint (/:uuid)
app.route('/', pingRouter);

// Default 404 handler
app.notFound((c) => {
  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json(
      {
        error: {
          code: 'not_found',
          message: 'The requested resource was not found.',
          field: null,
        },
      },
      404,
    );
  }
  return c.text('Not Found', 404);
});

// Global error handler
app.onError((err, c) => {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, status: err.status, message: err.message }, 'Application Error');
    return c.json(err.toJSON(), {
      status: err.status as 400 | 401 | 402 | 403 | 404 | 409 | 429 | 500,
    });
  }

  logger.error(err, 'Unhandled Exception');
  return c.json(
    {
      error: {
        code: 'internal',
        message: 'An unexpected internal error occurred.',
        field: null,
      },
    },
    500,
  );
});
