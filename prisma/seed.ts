import {
  PrismaClient,
  Plan,
  PlanStatus,
  ScheduleType,
  CheckStatus,
  ChannelType,
} from '@prisma/client';
import { env } from '../src/env.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding OrbitPing database...');

  // 1. Admin user from ADMIN_EMAILS
  const adminEmail = env.ADMIN_EMAILS[0] || 'admin@orbitping.example';
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { isAdmin: true },
    create: {
      email: adminEmail,
      emailVerifiedAt: new Date(),
      name: 'System Admin',
      plan: Plan.PLUS,
      planStatus: PlanStatus.ACTIVE,
      isAdmin: true,
      timezone: 'UTC',
    },
  });
  console.log(`Admin user seeded: ${adminUser.email}`);

  // 2. Demo users for FREE, PRO, PLUS plans
  const demoUsers = [
    { email: 'free-demo@orbitping.example', name: 'Free Tier User', plan: Plan.FREE },
    { email: 'pro-demo@orbitping.example', name: 'Pro Tier User', plan: Plan.PRO },
    { email: 'plus-demo@orbitping.example', name: 'Plus Tier User', plan: Plan.PLUS },
  ];

  for (const item of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {},
      create: {
        email: item.email,
        emailVerifiedAt: new Date(),
        name: item.name,
        plan: item.plan,
        planStatus: item.plan === Plan.FREE ? PlanStatus.NONE : PlanStatus.ACTIVE,
        timezone: 'UTC',
      },
    });

    // Seed sample checks in each status for the demo user
    const checkConfigs = [
      { name: 'Nightly Database Backup', status: CheckStatus.UP, period: 86400 },
      { name: 'Billing Synchronization Job', status: CheckStatus.DOWN, period: 3600 },
      { name: 'Hourly Analytics Aggregation', status: CheckStatus.NEW, period: 3600 },
      { name: 'Archival Export Task', status: CheckStatus.PAUSED, period: 86400 },
    ];

    for (const chk of checkConfigs) {
      await prisma.check.create({
        data: {
          userId: user.id,
          name: chk.name,
          scheduleType: ScheduleType.PERIOD,
          periodSeconds: chk.period,
          graceSeconds: 300,
          status: chk.status,
          alertAfter: new Date(Date.now() + chk.period * 1000),
          lastPingAt: chk.status === CheckStatus.UP ? new Date() : null,
        },
      });
    }

    // Seed sample channel of each type (dummy encrypted targets)
    await prisma.channel.create({
      data: {
        userId: user.id,
        type: ChannelType.EMAIL,
        label: 'Default Operations Email',
        targetEnc: 'v1.dummy_encrypted_target',
        verifiedAt: new Date(),
      },
    });
  }

  // 3. Synthetic self-monitoring check
  if (env.SYNTHETIC_CHECK_UUID) {
    await prisma.check.upsert({
      where: { pingUuid: env.SYNTHETIC_CHECK_UUID },
      update: {},
      create: {
        userId: adminUser.id,
        name: 'OrbitPing Synthetic Heartbeat Probe',
        pingUuid: env.SYNTHETIC_CHECK_UUID,
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900, // 15 min
        graceSeconds: 300,
        status: CheckStatus.UP,
        alertAfter: new Date(Date.now() + 1200 * 1000),
      },
    });
    console.log(`Synthetic self-monitoring check seeded: ${env.SYNTHETIC_CHECK_UUID}`);
  }

  console.log('Database seeding successfully completed.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
