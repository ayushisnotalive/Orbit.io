import { Hono, type MiddlewareHandler } from 'hono';
import { prisma } from '../db/client.js';
import { optionalAuth } from '../auth/middleware.js';
import { getSessionTokenFromCookie, setSessionCookie, validateSession } from '../auth/session.js';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { computeNextExpected, describeSchedule } from '../domain/schedule.js';
import { createCheckGuarded, assertPeriodAllowed } from '../domain/limits.js';
import { getEffectivePlan } from '../config/plans.js';
import { LoginView } from '../ui/views/Login.js';
import { DashboardView } from '../ui/views/Dashboard.js';
import { CheckFormView } from '../ui/views/CheckForm.js';
import { CheckDetailView } from '../ui/views/CheckDetail.js';
import { LandingView } from '../ui/views/public/Landing.js';
import { PricingView } from '../ui/views/public/Pricing.js';
import { DocsView } from '../ui/views/public/Docs.js';
import { LegalView } from '../ui/views/public/Legal.js';
import { StatusView } from '../ui/views/public/Status.js';
import type { ScheduleType } from '@prisma/client';

export const uiRouter = new Hono();

/**
 * Authentication guard for UI routes.
 * Redirects to /login if unauthenticated instead of returning 401 JSON.
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

// 1. Root landing page (CLI-02)
uiRouter.get('/', optionalAuth, async (c) => {
  const user = c.get('user');
  if (user) {
    return c.redirect('/dashboard');
  }
  return c.html(<LandingView />);
});

// App redirect alias
uiRouter.get('/app', (c) => {
  return c.redirect('/dashboard');
});

// Public Pricing page (CLI-02)
uiRouter.get('/pricing', async (c) => {
  return c.html(<PricingView />);
});

// Public Documentation page (CLI-02)
uiRouter.get('/docs', async (c) => {
  return c.html(<DocsView />);
});

// Public Terms of Service (CLI-03)
uiRouter.get('/terms', async (c) => {
  return c.html(
    <LegalView
      title="Terms of Service"
      lastUpdated="October 2026"
      sections={[
        {
          heading: '1. Service Scope & Nature of Monitoring',
          content: 'OrbitPing provides dead-man\'s switch and heartbeat monitoring services for background cron jobs, daemons, and scheduled tasks. OrbitPing does not host, manage, execute, or inspect customer source code or business logic; it strictly listens for authenticated HTTPS telemetry pings sent by the customer\'s own workloads.',
        },
        {
          heading: '2. Acceptable Use & Fair Quotas',
          content: 'You agree not to abuse, reverse-engineer, probe for vulnerabilities, or execute denial-of-service attempts against OrbitPing ingestion endpoints. Ingestion requests must respect rate limits and minimum interval thresholds corresponding to your active subscription plan. Malicious payloads or automated abuse will result in immediate API key revocation and account termination.',
        },
        {
          heading: '3. Compliance with Digital Personal Data Protection (DPDP) Act, 2023',
          content: 'By accessing or using OrbitPing, you consent to the processing of specified digital personal data (email address, session identifiers, and notification channel endpoints) strictly for service provisioning, authentication, and security monitoring in accordance with the Digital Personal Data Protection Act, 2023 (India) and international privacy standards.',
        },
        {
          heading: '4. Service Availability & Limitation of Liability',
          content: 'OrbitPing is architected for high availability with automated multi-container failover and fail-safe outage compensation. However, the service is provided on an "as is" and "as available" basis without express or implied warranties. OrbitPing shall not be liable for direct, indirect, incidental, or consequential damages resulting from missed alerts or undetected customer infrastructure downtime.',
        },
      ]}
    />,
  );
});

// Public Privacy Policy (CLI-03 - DPDP Act 2023 Compliant)
uiRouter.get('/privacy', async (c) => {
  return c.html(
    <LegalView
      title="Privacy Policy & Data Protection Notice"
      lastUpdated="October 2026"
      sections={[
        {
          heading: '1. Commitment to DPDP Act, 2023 & GDPR',
          content: 'This Privacy Policy sets out how OrbitPing (Data Fiduciary) processes, protects, and respects your personal digital data in strict compliance with the Digital Personal Data Protection Act, 2023 (India) and global data protection principles. We practice strict data minimization: we collect only what is strictly necessary to monitor your background tasks and alert you when they fail.',
        },
        {
          heading: '2. Information We Collect & Processing Purposes',
          content: '• Account Identification: Email address and GitHub ID/Profile strictly for authentication and account security.\n• Notification Endpoints: Webhook URLs (Discord, Slack, custom), Telegram chat IDs, or alert email destinations strictly for incident dispatch.\n• Telemetry Logs: Timestamp of pings, runtime duration in milliseconds, process exit code, and failure error tails strictly capped at 256 bytes.\n• We DO NOT collect, store, or process user passwords, credit card numbers, or internal task payloads.',
        },
        {
          heading: '3. Technical Safeguards & Cryptography',
          content: 'All notification channel credentials and webhook destination targets are encrypted at rest using versioned AES-256-GCM symmetric encryption. Outbound webhooks are rigorously filtered against private, loopback, and link-local IP addresses to prevent Server-Side Request Forgery (SSRF). Session tokens are stored in the database exclusively as irreversible SHA-256 cryptographic hashes.',
        },
        {
          heading: '4. Data Principal Rights under DPDP Act, 2023',
          content: 'As a Data Principal under Chapter III of the DPDP Act, 2023, you hold the following statutory rights:\n• Right to Information: Inquire about the summary of personal data processed.\n• Right to Correction & Updating: Modify your email and notification endpoints at any time in your dashboard.\n• Right to Erasure ("Right to be Forgotten"): Delete checks, purge incident histories, or terminate your account, triggering automatic irreversible removal from our databases.\n• Right to Grievance Redressal: Lodge complaints regarding data handling directly with our Grievance Officer.',
        },
        {
          heading: '5. Data Retention & Automatic Purging',
          content: 'Historical telemetry records, ping timestamps, and incident timelines are automatically purged by scheduled database maintenance jobs upon expiry of your plan retention window (30 days for Free, 90 days for Pro, 180 days for Plus). Revoked sessions are permanently deleted immediately.',
        },
        {
          heading: '6. Data Protection Grievance Officer',
          content: 'In accordance with Rule requirements under the DPDP Act, 2023, any privacy inquiries, data subject requests, or grievances may be addressed to our designated Data Protection Grievance Officer at:\n\nEmail: privacy@ayushisalive.me / theayushchakraborty@gmail.com\nData Fiduciary: OrbitPing Platforms, ayushisalive.me',
        },
      ]}
    />,
  );
});

// Public Refund Policy (CLI-03)
uiRouter.get('/refunds', async (c) => {
  return c.html(
    <LegalView
      title="Refund Policy"
      lastUpdated="October 2026"
      sections={[
        {
          heading: '1. 14-Day Money-Back Guarantee',
          content: 'If you are unsatisfied with OrbitPing Pro or Plus within the first 14 days of your initial subscription, contact support for a full refund.',
        },
        {
          heading: '2. Cancellation & Downgrades',
          content: 'You can cancel your subscription at any time via the Customer Billing Portal. Your account remains active on your paid tier until the end of your billing period, after which it smoothly transitions to the Free tier without deleting your checks.',
        },
      ]}
    />,
  );
});

// Public Real-Time System Status (CLI-03)
uiRouter.get('/status', async (c) => {
  const [lastScanState, notices] = await Promise.all([
    prisma.systemState.findUnique({ where: { key: 'last_scan_at' } }),
    prisma.statusNotice.findMany({
      where: { resolvedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  let scannerStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
  let scannerAgeSeconds: number | null = null;

  if (lastScanState) {
    const scanDate = new Date(lastScanState.value);
    scannerAgeSeconds = Math.max(0, Math.floor((Date.now() - scanDate.getTime()) / 1000));
    if (scannerAgeSeconds > 180) scannerStatus = 'CRITICAL';
    else if (scannerAgeSeconds > 90) scannerStatus = 'DEGRADED';
  } else {
    scannerStatus = 'HEALTHY';
  }

  const overallStatus =
    notices.some((n) => n.level === 'OUTAGE') || scannerStatus === 'CRITICAL'
      ? 'OUTAGE'
      : notices.some((n) => n.level === 'DEGRADED') || scannerStatus === 'DEGRADED'
      ? 'DEGRADED'
      : 'OPERATIONAL';

  return c.html(
    <StatusView
      overallStatus={overallStatus}
      scannerStatus={scannerStatus}
      scannerAgeSeconds={scannerAgeSeconds}
      notices={notices}
    />,
  );
});

// 2. Login page
uiRouter.get('/login', optionalAuth, async (c) => {
  const isReauth = c.req.query('admin_reauth') === 'true';
  const user = c.get('user');
  if (user && !isReauth) {
    return c.redirect('/dashboard');
  }
  return c.html(<LoginView turnstileSiteKey={env.TURNSTILE_SITE_KEY} />);
});

// 3. Authenticated Dashboard view
uiRouter.get('/dashboard', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const filter = c.req.query('filter') || 'all';
  const search = c.req.query('search') || '';

  const checks = await prisma.check.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      pingUuid: true,
      status: true,
      scheduleType: true,
      periodSeconds: true,
      cronExpr: true,
      timezone: true,
      lastPingAt: true,
      lastDurationMs: true,
      consecutiveFails: true,
      tags: true,
    },
  });

  return c.html(
    <DashboardView
      user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
      checks={checks}
      appUrl={env.APP_URL}
      filter={filter}
      search={search}
    />,
  );
});

// 4. Check Creation Form
uiRouter.get('/checks/new', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const channels = await prisma.channel.findMany({
    where: { userId: user.id, disabledAt: null },
    orderBy: { createdAt: 'asc' },
  });

  return c.html(
    <CheckFormView
      user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
      availableChannels={channels.map((ch) => ({
        id: ch.id,
        type: ch.type,
        label: ch.label,
      }))}
      selectedChannelIds={channels.map((ch) => ch.id)}
      isEdit={false}
    />,
  );
});

// 5. Schedule Preview HTMX Endpoint
uiRouter.get('/checks/preview-schedule', async (c) => {
  const type = (c.req.query('scheduleType') || 'PERIOD') as ScheduleType;
  const periodMinutesRaw = c.req.query('periodMinutes');
  const cronExpr = c.req.query('cronExpr') || '0 0 * * *';
  const timezone = c.req.query('timezone') || 'UTC';

  if (type === 'PERIOD') {
    const minutes = parseInt(periodMinutesRaw || '60', 10);
    const periodSeconds = isNaN(minutes) || minutes <= 0 ? 3600 : minutes * 60;
    const desc = describeSchedule('PERIOD', periodSeconds);
    const now = new Date();
    const nextRun = new Date(now.getTime() + periodSeconds * 1000);

    return c.html(
      <div>
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">
          Schedule Interpretation
        </div>
        <div style="font-size: 0.9375rem; color: #38bdf8; font-weight: 500;">
          {desc}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
          Next expected run: {nextRun.toLocaleString()}
        </div>
      </div>,
    );
  }

  // Type is CRON
  try {
    const desc = describeSchedule('CRON', cronExpr, timezone);
    const result = computeNextExpected({
      type: 'CRON',
      cron: cronExpr,
      timezone,
    });

    return c.html(
      <div>
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 0.25rem;">
          Schedule Interpretation
        </div>
        <div style="font-size: 0.9375rem; color: #38bdf8; font-weight: 500;">
          {desc} ({timezone})
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
          Next expected run: {result.nextExpectedAt.toLocaleString()}
        </div>
      </div>,
    );
  } catch (err: any) {
    return c.html(
      <div>
        <div style="font-size: 0.75rem; text-transform: uppercase; color: #f87171; font-weight: 600; margin-bottom: 0.25rem;">
          Invalid Cron Schedule
        </div>
        <div style="font-size: 0.875rem; color: #fca5a5;">
          {err.message || 'Please check cron expression syntax.'}
        </div>
      </div>,
    );
  }
});

// 6. Handle Check Creation
uiRouter.post('/checks', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody({ all: true });

  const name = String(body.name || '').trim();
  const scheduleType = (String(body.scheduleType || 'PERIOD').toUpperCase()) as ScheduleType;
  const periodMinutes = parseInt(String(body.periodMinutes || '60'), 10);
  const cronExpr = String(body.cronExpr || '').trim() || null;
  const timezone = String(body.timezone || 'UTC').trim();
  const graceMinutes = parseInt(String(body.graceMinutes || '5'), 10);
  const tagsRaw = String(body.tags || '').trim();

  const userChannels = await prisma.channel.findMany({
    where: { userId: user.id, disabledAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const availableChannelOptions = userChannels.map((ch) => ({
    id: ch.id,
    type: ch.type,
    label: ch.label,
  }));

  const rawChannelIds = (body as any).channelIds;
  const selectedChannelIds = (
    Array.isArray(rawChannelIds)
      ? rawChannelIds
      : rawChannelIds
        ? [rawChannelIds]
        : []
  ).map(String);

  if (!name) {
    return c.html(
      <CheckFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        availableChannels={availableChannelOptions}
        selectedChannelIds={selectedChannelIds}
        isEdit={false}
        flash={{ type: 'error', message: 'Check name is required.' }}
      />,
      400,
    );
  }

  const periodSeconds = scheduleType === 'PERIOD' ? Math.max(1, periodMinutes * 60) : null;
  const graceSeconds = Math.max(60, graceMinutes * 60);
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

  try {
    const effectivePlan = getEffectivePlan(user);
    assertPeriodAllowed(effectivePlan, periodSeconds);

    const created = await createCheckGuarded({
      userId: user.id,
      plan: effectivePlan,
      name,
      scheduleType,
      periodSeconds,
      cronExpr: scheduleType === 'CRON' ? cronExpr : null,
      timezone,
      graceSeconds,
    });

    // Update tags and calculate initial schedule deadline
    const sched = computeNextExpected({
      type: scheduleType,
      periodSeconds,
      cron: cronExpr,
      timezone,
      graceSeconds,
    });

    await prisma.check.update({
      where: { id: created.id },
      data: {
        tags,
        nextExpectedAt: sched.nextExpectedAt,
        alertAfter: sched.alertAfter,
      },
    });

    // Attach selected alert channels
    const validSelected = userChannels.filter((c) => selectedChannelIds.includes(c.id));
    if (validSelected.length > 0) {
      await prisma.checkChannel.createMany({
        data: validSelected.map((ch) => ({
          checkId: created.id,
          channelId: ch.id,
        })),
      });
    }

    return c.redirect(`/checks/${created.id}`);
  } catch (err: any) {
    const errorMsg =
      err instanceof AppError
        ? err.message
        : err.message || 'Failed to create check. Please verify schedule settings.';

    return c.html(
      <CheckFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        isEdit={false}
        availableChannels={availableChannelOptions}
        selectedChannelIds={selectedChannelIds}
        check={{
          name,
          scheduleType,
          periodSeconds,
          cronExpr,
          timezone,
          graceSeconds,
          tags,
        }}
        flash={{ type: 'error', message: errorMsg }}
      />,
      400,
    );
  }
});

// 7. Check Detail View
uiRouter.get('/checks/:id', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const check = await prisma.check.findFirst({
    where: { id, userId: user.id },
    include: {
      pings: {
        orderBy: { ts: 'desc' },
        take: 20,
      },
      incidents: {
        orderBy: { startedAt: 'desc' },
        take: 20,
      },
      channels: {
        include: {
          channel: true,
        },
      },
    },
  });

  if (!check) {
    throw new AppError('not_found', 'Check not found');
  }

  return c.html(
    <CheckDetailView
      user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
      check={check}
      appUrl={env.APP_URL}
    />,
  );
});

// 8. Edit Check Form
uiRouter.get('/checks/:id/edit', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const check = await prisma.check.findFirst({
    where: { id, userId: user.id },
  });

  if (!check) {
    throw new AppError('not_found', 'Check not found');
  }

  const [channels, checkChannels] = await Promise.all([
    prisma.channel.findMany({
      where: { userId: user.id, disabledAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.checkChannel.findMany({
      where: { checkId: id },
    }),
  ]);

  const selectedChannelIds = checkChannels.map((cc) => cc.channelId);

  return c.html(
    <CheckFormView
      user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
      check={check}
      availableChannels={channels.map((ch) => ({
        id: ch.id,
        type: ch.type,
        label: ch.label,
      }))}
      selectedChannelIds={selectedChannelIds}
      isEdit={true}
    />,
  );
});

// 9. Update Check
uiRouter.post('/checks/:id/edit', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const existing = await prisma.check.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    throw new AppError('not_found', 'Check not found');
  }

  const body = await c.req.parseBody({ all: true });
  const name = String(body.name || '').trim();
  const scheduleType = (String(body.scheduleType || 'PERIOD').toUpperCase()) as ScheduleType;
  const periodMinutes = parseInt(String(body.periodMinutes || '60'), 10);
  const cronExpr = String(body.cronExpr || '').trim() || null;
  const timezone = String(body.timezone || 'UTC').trim();
  const graceMinutes = parseInt(String(body.graceMinutes || '5'), 10);
  const tagsRaw = String(body.tags || '').trim();

  const userChannels = await prisma.channel.findMany({
    where: { userId: user.id, disabledAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const availableChannelOptions = userChannels.map((ch) => ({
    id: ch.id,
    type: ch.type,
    label: ch.label,
  }));

  const rawChannelIds = (body as any).channelIds;
  const selectedChannelIds = (
    Array.isArray(rawChannelIds)
      ? rawChannelIds
      : rawChannelIds
        ? [rawChannelIds]
        : []
  ).map(String);

  if (!name) {
    return c.html(
      <CheckFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        check={existing}
        availableChannels={availableChannelOptions}
        selectedChannelIds={selectedChannelIds}
        isEdit={true}
        flash={{ type: 'error', message: 'Check name is required.' }}
      />,
      400,
    );
  }

  const periodSeconds = scheduleType === 'PERIOD' ? Math.max(1, periodMinutes * 60) : null;
  const graceSeconds = Math.max(60, graceMinutes * 60);
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

  try {
    assertPeriodAllowed(user.plan, periodSeconds);

    const sched = computeNextExpected({
      type: scheduleType,
      periodSeconds,
      cron: cronExpr,
      timezone,
      graceSeconds,
    });

    await prisma.$transaction(async (tx) => {
      await tx.check.update({
        where: { id },
        data: {
          name,
          scheduleType,
          periodSeconds,
          cronExpr: scheduleType === 'CRON' ? cronExpr : null,
          timezone,
          graceSeconds,
          tags,
          nextExpectedAt: sched.nextExpectedAt,
          alertAfter: existing.status === 'PAUSED' ? null : sched.alertAfter,
        },
      });

      // Sync alert channels
      await tx.checkChannel.deleteMany({
        where: { checkId: id },
      });

      const validSelected = userChannels.filter((c) => selectedChannelIds.includes(c.id));
      if (validSelected.length > 0) {
        await tx.checkChannel.createMany({
          data: validSelected.map((ch) => ({
            checkId: id,
            channelId: ch.id,
          })),
        });
      }
    });

    return c.redirect(`/checks/${id}`);
  } catch (err: any) {
    return c.html(
      <CheckFormView
        user={{ email: user.email, plan: user.plan, isAdmin: user.isAdmin }}
        check={{
          id,
          name,
          scheduleType,
          periodSeconds,
          cronExpr,
          timezone,
          graceSeconds,
          tags,
        }}
        availableChannels={availableChannelOptions}
        selectedChannelIds={selectedChannelIds}
        isEdit={true}
        flash={{ type: 'error', message: err.message || 'Failed to update check.' }}
      />,
      400,
    );
  }
});

// 10. Pause / Resume Check
uiRouter.post('/checks/:id/pause', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const check = await prisma.check.findFirst({
    where: { id, userId: user.id },
  });

  if (!check) {
    throw new AppError('not_found', 'Check not found');
  }

  if (check.status === 'PAUSED') {
    // Resume
    const sched = computeNextExpected({
      type: check.scheduleType,
      periodSeconds: check.periodSeconds,
      cron: check.cronExpr,
      timezone: check.timezone,
      graceSeconds: check.graceSeconds,
    });

    await prisma.check.update({
      where: { id },
      data: {
        status: check.lastPingAt ? 'UP' : 'NEW',
        pausedAt: null,
        nextExpectedAt: sched.nextExpectedAt,
        alertAfter: sched.alertAfter,
      },
    });
  } else {
    // Pause
    await prisma.check.update({
      where: { id },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
        alertAfter: null,
      },
    });
  }

  const referer = c.req.header('Referer');
  if (referer && referer.includes('/dashboard')) {
    return c.redirect('/dashboard');
  }
  return c.redirect(`/checks/${id}`);
});

// 11. Delete Check
uiRouter.post('/checks/:id/delete', requireUiAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const check = await prisma.check.findFirst({
    where: { id, userId: user.id },
  });

  if (!check) {
    throw new AppError('not_found', 'Check not found');
  }

  await prisma.check.delete({
    where: { id },
  });

  return c.redirect('/dashboard');
});
