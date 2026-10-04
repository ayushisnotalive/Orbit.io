import { Hono } from 'hono';
import { prisma } from '../db/client.js';
import { requireAdminAuth } from '../auth/adminGuard.js';
import { getSystemTelemetry } from '../admin/telemetry.js';
import { AdminDashboardView } from '../ui/views/admin/AdminDashboard.js';
import { AdminUsersView } from '../ui/views/admin/AdminUsers.js';
import { AppError } from '../lib/errors.js';
import type { Plan } from '@prisma/client';

export const adminRouter = new Hono();

// Enforce admin guard across all /admin routes
adminRouter.use('*', requireAdminAuth);

/**
 * 1. Admin Telemetry Dashboard (ADM-03)
 */
adminRouter.get('/', async (c) => {
  const user = c.get('user')!;
  const telemetry = await getSystemTelemetry();

  return c.html(
    <AdminDashboardView
      user={{ email: user.email, plan: user.plan, isAdmin: true }}
      telemetry={telemetry}
    />,
  );
});

/**
 * 2. User Management Listing (ADM-02)
 */
adminRouter.get('/users', async (c) => {
  const adminUser = c.get('user')!;
  const q = String(c.req.query('q') || '').trim();
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const whereClause: any = {
    deletedAt: null,
  };

  if (q) {
    whereClause.email = {
      contains: q,
      mode: 'insensitive',
    };
  }

  const [totalCount, users] = await Promise.all([
    prisma.user.count({ where: whereClause }),
    prisma.user.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            checks: true,
            channels: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const formattedUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    plan: u.plan,
    planSource: u.planSource,
    planStatus: u.planStatus,
    adminPlanUntil: u.adminPlanUntil,
    disabledAt: u.disabledAt,
    disabledReason: u.disabledReason,
    createdAt: u.createdAt,
    checksCount: u._count.checks,
    channelsCount: u._count.channels,
  }));

  const flashMsg = c.req.query('flash');
  const flash = flashMsg ? { type: 'success' as const, message: flashMsg } : undefined;

  return c.html(
    <AdminUsersView
      user={{ email: adminUser.email, plan: adminUser.plan, isAdmin: true }}
      users={formattedUsers}
      query={q}
      page={page}
      totalPages={totalPages}
      flash={flash}
    />,
  );
});

/**
 * 3. Plan Override Action (ADM-02)
 */
adminRouter.post('/users/:id/plan', async (c) => {
  const adminUser = c.get('user')!;
  const targetId = c.req.param('id');
  const body = await c.req.parseBody();

  const plan = String(body.plan || 'FREE').toUpperCase() as Plan;
  const durationDays = parseInt(String(body.durationDays || '0'), 10);

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!targetUser) {
    throw new AppError('not_found', 'Target user not found', 404);
  }

  const adminPlanUntil = durationDays > 0 ? new Date(Date.now() + durationDays * 86400 * 1000) : null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: {
        plan,
        planSource: 'ADMIN',
        adminPlanUntil,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        targetUserId: targetId,
        event: 'admin.user_plan_override',
        meta: {
          previousPlan: targetUser.plan,
          newPlan: plan,
          durationDays,
          adminPlanUntil,
        },
      },
    });
  });

  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json({ ok: true, plan, adminPlanUntil });
  }

  return c.redirect(
    `/admin/users?flash=${encodeURIComponent(`Plan successfully updated to ${plan} for ${targetUser.email}`)}`,
    303,
  );
});

/**
 * 4. Account Disable Action (ADM-03)
 */
adminRouter.post('/users/:id/disable', async (c) => {
  const adminUser = c.get('user')!;
  const targetId = c.req.param('id');
  const body = await c.req.parseBody();
  const reason = String(body.reason || '').trim() || 'Suspended by administrator';

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!targetUser) {
    throw new AppError('not_found', 'Target user not found', 404);
  }

  // Prevent disabling oneself
  if (targetUser.id === adminUser.id) {
    throw new AppError('forbidden', 'Administrators cannot disable their own account', 400);
  }

  await prisma.$transaction(async (tx) => {
    // 1. Mark user disabled
    await tx.user.update({
      where: { id: targetId },
      data: {
        disabledAt: new Date(),
        disabledReason: reason,
      },
    });

    // 2. Immediately revoke all active sessions for that user
    await tx.session.deleteMany({
      where: { userId: targetId },
    });

    // 3. Record audit log
    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        targetUserId: targetId,
        event: 'admin.user_disabled',
        meta: { reason },
      },
    });
  });

  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json({ ok: true, disabled: true, reason });
  }

  return c.redirect(
    `/admin/users?flash=${encodeURIComponent(`Account ${targetUser.email} has been disabled and sessions revoked.`)}`,
    303,
  );
});

/**
 * 5. Account Enable Action (ADM-03)
 */
adminRouter.post('/users/:id/enable', async (c) => {
  const adminUser = c.get('user')!;
  const targetId = c.req.param('id');

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!targetUser) {
    throw new AppError('not_found', 'Target user not found', 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: {
        disabledAt: null,
        disabledReason: null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        targetUserId: targetId,
        event: 'admin.user_enabled',
      },
    });
  });

  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json({ ok: true, enabled: true });
  }

  return c.redirect(
    `/admin/users?flash=${encodeURIComponent(`Account ${targetUser.email} has been re-enabled.`)}`,
    303,
  );
});
