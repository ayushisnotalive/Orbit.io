import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { createCheckGuarded, createChannelGuarded } from '../../src/domain/limits.js';
import { AppError } from '../../src/lib/errors.js';
import { ScheduleType, ChannelType } from '@prisma/client';

describe('Advisory Locked Plan Limits (Integration)', () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `limits-test-${Date.now()}@orbitping.example`,
        name: 'Limits Test User',
        plan: 'FREE',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it('should successfully create checks up to the Free plan limit (10)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await createCheckGuarded({
        userId: testUserId,
        plan: 'FREE',
        name: `Check ${i + 1}`,
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
      });
      expect(res.id).toBeDefined();
      expect(res.pingUuid).toBeDefined();
    }

    const count = await prisma.check.count({ where: { userId: testUserId } });
    expect(count).toBe(10);
  });

  it('should reject check creation beyond the Free plan limit', async () => {
    await expect(
      createCheckGuarded({
        userId: testUserId,
        plan: 'FREE',
        name: 'Over Limit Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
      }),
    ).rejects.toThrow(AppError);
  });

  it('should enforce minimum period limit for Free plan (min 900s)', async () => {
    await expect(
      createCheckGuarded({
        userId: testUserId,
        plan: 'FREE',
        name: 'Fast Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 60, // 1 min (not allowed on Free)
      }),
    ).rejects.toThrow(/minimum period of 900s/);
  });

  it('should enforce channel limits for Free plan (3 channels max)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await createChannelGuarded({
        userId: testUserId,
        plan: 'FREE',
        type: ChannelType.EMAIL,
        label: `Channel ${i + 1}`,
        targetEnc: 'v1.test_target',
      });
      expect(res.id).toBeDefined();
    }

    await expect(
      createChannelGuarded({
        userId: testUserId,
        plan: 'FREE',
        type: ChannelType.SLACK,
        label: 'Over Limit Channel',
        targetEnc: 'v1.test_target',
      }),
    ).rejects.toThrow(/limit of 3 alert channels has been reached/);
  });
});
