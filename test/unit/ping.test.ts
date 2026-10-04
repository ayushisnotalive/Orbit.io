import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { handlePing } from '../../src/domain/ping.js';
import { resetRateLimits, isNegativeCached } from '../../src/security/ratelimit.js';
import { AppError } from '../../src/lib/errors.js';
import { ScheduleType, ChannelType } from '@prisma/client';

describe('Core Domain Ping Handler (handlePing)', () => {
  let activeUserId: string;
  let disabledUserId: string;
  let activeChannelId: string;
  let standardCheckId: string;
  let standardCheckUuid: string;
  let pausedCheckUuid: string;
  let disabledCheckUuid: string;
  let failEscalateCheckUuid: string;

  beforeAll(async () => {
    // 1. Create active test user
    const activeUser = await prisma.user.create({
      data: {
        email: `ping-test-active-${Date.now()}@orbitping.example`,
        name: 'Active Test User',
        plan: 'FREE',
      },
    });
    activeUserId = activeUser.id;

    // 2. Create disabled test user
    const disabledUser = await prisma.user.create({
      data: {
        email: `ping-test-disabled-${Date.now()}@orbitping.example`,
        name: 'Disabled Test User',
        plan: 'FREE',
        disabledAt: new Date(),
      },
    });
    disabledUserId = disabledUser.id;

    // 3. Create active verified channel for alert staging
    const channel = await prisma.channel.create({
      data: {
        userId: activeUserId,
        type: ChannelType.EMAIL,
        label: 'Primary Ops Email',
        targetEnc: 'v1.fakeencryptedtarget',
        verifiedAt: new Date(),
      },
    });
    activeChannelId = channel.id;

    // 4. Create standard active check
    const standardCheck = await prisma.check.create({
      data: {
        userId: activeUserId,
        name: 'Daily Backup Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
        graceSeconds: 300,
        failThreshold: 2,
        status: 'NEW',
        channels: {
          create: [{ channelId: activeChannelId }],
        },
      },
    });
    standardCheckId = standardCheck.id;
    standardCheckUuid = standardCheck.pingUuid;

    // 5. Create paused check
    const pausedCheck = await prisma.check.create({
      data: {
        userId: activeUserId,
        name: 'Paused Maintenance Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
        status: 'PAUSED',
        pausedAt: new Date(),
      },
    });
    pausedCheckUuid = pausedCheck.pingUuid;

    // 6. Create check owned by disabled user
    const disabledCheck = await prisma.check.create({
      data: {
        userId: disabledUserId,
        name: 'Disabled User Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
        status: 'NEW',
      },
    });
    disabledCheckUuid = disabledCheck.pingUuid;

    // 7. Create check specifically for testing fail escalation
    const failCheck = await prisma.check.create({
      data: {
        userId: activeUserId,
        name: 'Escalation Test Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
        graceSeconds: 300,
        failThreshold: 2,
        status: 'UP',
        channels: {
          create: [{ channelId: activeChannelId }],
        },
      },
    });
    failEscalateCheckUuid = failCheck.pingUuid;
  });

  afterAll(async () => {
    // Cascade cleanup
    await prisma.user.deleteMany({
      where: { id: { in: [activeUserId, disabledUserId] } },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  it('throws 404 for unknown UUID and records in negative cache', async () => {
    const unknownUuid = '00000000-0000-0000-0000-000000000001';
    await expect(handlePing(unknownUuid, 'SUCCESS')).rejects.toThrow(AppError);
    expect(isNegativeCached(unknownUuid)).toBe(true);
  });

  it('silently ignores pings for paused check with 200 OK and no DB mutations', async () => {
    const result = await handlePing(pausedCheckUuid, 'SUCCESS');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.action).toBe('ignored');

    const check = await prisma.check.findUnique({ where: { pingUuid: pausedCheckUuid } });
    expect(check?.status).toBe('PAUSED');
    expect(check?.lastPingAt).toBeNull();
  });

  it('silently ignores pings for disabled user account with 200 OK and no DB mutations', async () => {
    const result = await handlePing(disabledCheckUuid, 'SUCCESS');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.action).toBe('ignored');

    const check = await prisma.check.findUnique({ where: { pingUuid: disabledCheckUuid } });
    expect(check?.lastPingAt).toBeNull();
  });

  it('records START ping and updates lastStartAt and lastRunId', async () => {
    const runId = 'job-run-abc';
    const now = new Date('2026-09-29T12:00:00Z');

    const result = await handlePing(standardCheckUuid, 'START', { runId, now });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.action).toBe('recorded');

    const check = await prisma.check.findUnique({ where: { id: standardCheckId } });
    expect(check?.lastStartAt).toEqual(now);
    expect(check?.lastRunId).toBe(runId);

    const startPing = await prisma.ping.findFirst({
      where: { checkId: standardCheckId, kind: 'START' },
      orderBy: { ts: 'desc' },
    });
    expect(startPing?.runId).toBe(runId);
  });

  it('rate-limits START pings to 1 per 5 seconds per check', async () => {
    await handlePing(standardCheckUuid, 'START');
    await expect(handlePing(standardCheckUuid, 'START')).rejects.toThrow(AppError);
  });

  it('records SUCCESS ping, sets status UP, advances deadlines, and computes duration', async () => {
    const startTime = new Date('2026-09-29T12:00:00Z');
    const finishTime = new Date('2026-09-29T12:05:00Z'); // 5 min after start
    await handlePing(standardCheckUuid, 'START', { now: startTime });

    const result = await handlePing(standardCheckUuid, 'SUCCESS', { now: finishTime });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.action).toBe('recorded');
    expect(result.durationMs).toBe(300000); // 5 min = 300,000 ms

    const check = await prisma.check.findUnique({ where: { id: standardCheckId } });
    expect(check?.status).toBe('UP');
    expect(check?.lastPingAt).toEqual(finishTime);
    expect(check?.lastDurationMs).toBe(300000);
    expect(check?.consecutiveFails).toBe(0);
    expect(check?.pingCount).toBe(1);
    expect(check?.nextExpectedAt).toBeDefined();
    expect(check?.alertAfter).toBeDefined();
  });

  it('acknowledges min-gap hits with 200 OK without writing rows', async () => {
    // FREE plan minGapSec is 300s (5 min). Ping 60s later should hit minGap
    const tooSoonTime = new Date('2026-09-29T12:06:00Z');
    const result = await handlePing(standardCheckUuid, 'SUCCESS', { now: tooSoonTime });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.action).toBe('min_gap_ignored');

    // Check count of success pings in db remains 1
    const pingsCount = await prisma.ping.count({
      where: { checkId: standardCheckId, kind: 'SUCCESS' },
    });
    expect(pingsCount).toBe(1);
  });

  it('resolves execution duration using matching runId', async () => {
    const runId = 'specific-run-xyz';
    const startTime = new Date('2026-09-29T13:00:00Z');
    const finishTime = new Date('2026-09-29T13:02:30Z'); // 150 seconds = 150,000 ms

    await handlePing(standardCheckUuid, 'START', { runId, now: startTime });

    // Success with matching rid
    const result = await handlePing(standardCheckUuid, 'SUCCESS', {
      runId,
      now: finishTime,
    });

    expect(result.durationMs).toBe(150000);
  });

  it('records FAIL ping, increments consecutiveFails, and escalates to DOWN when threshold reached', async () => {
    // 1st failure (below failThreshold of 2)
    const fail1Time = new Date('2026-09-29T14:00:00Z');
    const res1 = await handlePing(failEscalateCheckUuid, 'FAIL', {
      exitCode: 1,
      body: 'Job failed: database connection timeout',
      now: fail1Time,
    });
    expect(res1.consecutiveFails).toBe(1);

    let check = await prisma.check.findUnique({ where: { pingUuid: failEscalateCheckUuid } });
    expect(check?.status).toBe('UP'); // Still UP after 1st failure
    expect(check?.consecutiveFails).toBe(1);

    // 2nd failure (reaches failThreshold of 2 -> transition to DOWN)
    const fail2Time = new Date('2026-09-29T14:05:00Z');
    const res2 = await handlePing(failEscalateCheckUuid, 'FAIL', {
      exitCode: 2,
      body: 'Fatal memory exhaustion',
      now: fail2Time,
    });
    expect(res2.consecutiveFails).toBe(2);

    check = await prisma.check.findUnique({ where: { pingUuid: failEscalateCheckUuid } });
    expect(check?.status).toBe('DOWN');
    expect(check?.downSince).toEqual(fail2Time);

    // Verify incident was created
    const incident = await prisma.incident.findFirst({
      where: { checkId: check!.id, resolvedAt: null },
    });
    expect(incident).toBeDefined();
    expect(incident?.reason).toBe('FAIL');

    // Verify DOWN alerts were staged
    const alerts = await prisma.alert.findMany({
      where: { incidentId: incident!.id },
    });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].kind).toBe('DOWN');
    expect(alerts[0].channelId).toBe(activeChannelId);
  });

  it('resolves open incident and stages RECOVERED alerts on subsequent SUCCESS ping', async () => {
    const recoveryTime = new Date('2026-09-29T14:15:00Z');
    const checkBefore = await prisma.check.findUnique({ where: { pingUuid: failEscalateCheckUuid } });
    expect(checkBefore?.status).toBe('DOWN');

    const res = await handlePing(failEscalateCheckUuid, 'SUCCESS', { now: recoveryTime });
    expect(res.ok).toBe(true);

    const checkAfter = await prisma.check.findUnique({ where: { pingUuid: failEscalateCheckUuid } });
    expect(checkAfter?.status).toBe('UP');
    expect(checkAfter?.downSince).toBeNull();
    expect(checkAfter?.consecutiveFails).toBe(0);

    // Verify incident was resolved
    const openIncidents = await prisma.incident.findMany({
      where: { checkId: checkAfter!.id, resolvedAt: null },
    });
    expect(openIncidents.length).toBe(0);

    const resolvedIncident = await prisma.incident.findFirst({
      where: { checkId: checkAfter!.id, resolvedAt: recoveryTime },
    });
    expect(resolvedIncident).toBeDefined();
    expect(resolvedIncident?.resolvedBy).toBe('ping');

    // Verify RECOVERED alerts were staged
    const recoveredAlerts = await prisma.alert.findMany({
      where: { incidentId: resolvedIncident!.id, kind: 'RECOVERED' },
    });
    expect(recoveredAlerts.length).toBeGreaterThan(0);
    expect(recoveredAlerts[0].channelId).toBe(activeChannelId);
  });
});
