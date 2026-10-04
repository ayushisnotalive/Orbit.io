import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { resetRateLimits } from '../../src/security/ratelimit.js';
import { ScheduleType } from '@prisma/client';

describe('Public Ping Ingestion API (Integration)', () => {
  let testUserId: string;
  let testCheckId: string;
  let testCheckUuid: string;

  beforeAll(async () => {
    // 1. Create test user
    const user = await prisma.user.create({
      data: {
        email: `ping-route-test-${Date.now()}@orbitping.example`,
        name: 'Route Test User',
        plan: 'FREE',
      },
    });
    testUserId = user.id;

    // 2. Create test check
    const check = await prisma.check.create({
      data: {
        userId: testUserId,
        name: 'Ping Ingest Check',
        scheduleType: ScheduleType.PERIOD,
        periodSeconds: 900,
        graceSeconds: 300,
        status: 'UP',
      },
    });
    testCheckId = check.id;
    testCheckUuid = check.pingUuid;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  it('GET /ping/:uuid returns 200 OK with text/plain, Cache-Control: no-store, body OK', async () => {
    const res = await app.request(`/ping/${testCheckUuid}`, {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('OK');
  });

  it('POST /ping/:uuid returns 200 OK', async () => {
    const res = await app.request(`/ping/${testCheckUuid}`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('HEAD /ping/:uuid returns 200 OK with headers but empty body', async () => {
    const res = await app.request(`/ping/${testCheckUuid}`, {
      method: 'HEAD',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).toBe('');
  });

  it('Dual mount short-form /:uuid works identically to /ping/:uuid', async () => {
    const res = await app.request(`/${testCheckUuid}`, {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('OK');
  });

  it('POST /ping/:uuid/start records start with ?rid=', async () => {
    const runId = 'integration-run-456';
    const res = await app.request(`/ping/${testCheckUuid}/start?rid=${runId}`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');

    const check = await prisma.check.findUnique({ where: { id: testCheckId } });
    expect(check?.lastRunId).toBe(runId);
    expect(check?.lastStartAt).toBeDefined();
  });

  it('POST /ping/:uuid/fail records failure message and body up to 256 bytes', async () => {
    const bodyText = 'Fatal error: disk space exhausted\x07\x08'; // with control chars
    const res = await app.request(`/ping/${testCheckUuid}/fail`, {
      method: 'POST',
      body: bodyText,
      headers: {
        'content-type': 'text/plain',
      },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');

    const failPing = await prisma.ping.findFirst({
      where: { checkId: testCheckId, kind: 'FAIL' },
      orderBy: { ts: 'desc' },
    });
    expect(failPing?.body).toBe('Fatal error: disk space exhausted');
  });

  it('POST /ping/:uuid/fail falls back to ?msg= query parameter when body is empty', async () => {
    const res = await app.request(`/ping/${testCheckUuid}/fail?msg=QueryMessageFallback`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');

    const failPing = await prisma.ping.findFirst({
      where: { checkId: testCheckId, kind: 'FAIL' },
      orderBy: { ts: 'desc' },
    });
    expect(failPing?.body).toBe('QueryMessageFallback');
  });

  it('handles exit code route /ping/:uuid/:exitCode correctly', async () => {
    // 0 -> SUCCESS
    const resSuccess = await app.request(`/ping/${testCheckUuid}/0`, {
      method: 'GET',
    });
    expect(resSuccess.status).toBe(200);

    // 1..255 -> FAIL
    const resFail = await app.request(`/ping/${testCheckUuid}/127`, {
      method: 'GET',
      headers: { 'x-real-ip': '10.0.0.2' },
    });
    expect(resFail.status).toBe(200);

    const failPing = await prisma.ping.findFirst({
      where: { checkId: testCheckId, exitCode: 127 },
    });
    expect(failPing).toBeDefined();

    // Out of range > 255 -> 400
    const resOver = await app.request(`/ping/${testCheckUuid}/256`, {
      method: 'GET',
    });
    expect(resOver.status).toBe(400);

    // Non-numeric -> 400
    const resAlpha = await app.request(`/ping/${testCheckUuid}/notanumber`, {
      method: 'GET',
    });
    expect(resAlpha.status).toBe(400);
  });

  it('caps body reading at 1 KB (1024 bytes)', async () => {
    // Large payload (>2 KB)
    const largeBody = 'A'.repeat(2048);
    const res = await app.request(`/ping/${testCheckUuid}/fail`, {
      method: 'POST',
      body: largeBody,
      headers: { 'x-real-ip': '10.0.0.3' },
    });

    expect(res.status).toBe(200);

    const lastPing = await prisma.ping.findFirst({
      where: { checkId: testCheckId, kind: 'FAIL' },
      orderBy: { ts: 'desc' },
    });
    expect(lastPing?.body?.length).toBeLessThanOrEqual(256);
  });

  it('enforces IP rate limiting (120 req/min) returning 429 with Retry-After header', async () => {
    const clientIp = '198.51.100.55';

    // Send 120 requests
    for (let i = 0; i < 120; i++) {
      const res = await app.request(`/ping/${testCheckUuid}`, {
        method: 'GET',
        headers: { 'cf-connecting-ip': clientIp },
      });
      expect(res.status).toBe(200);
    }

    // 121st request should be blocked
    const resBlocked = await app.request(`/ping/${testCheckUuid}`, {
      method: 'GET',
      headers: { 'cf-connecting-ip': clientIp },
    });

    expect(resBlocked.status).toBe(429);
    expect(resBlocked.headers.get('retry-after')).toBe('60');
    expect(await resBlocked.text()).toBe('Too Many Requests');
  });

  it('unknown UUID returns 404 and is shielded by negative cache', async () => {
    const nonExistentUuid = '99999999-9999-9999-9999-999999999999';

    // 1st request -> DB miss, cached in negative cache
    const res1 = await app.request(`/ping/${nonExistentUuid}`, {
      method: 'GET',
    });
    expect(res1.status).toBe(404);

    // 2nd request -> Negative cache hit
    const res2 = await app.request(`/ping/${nonExistentUuid}`, {
      method: 'GET',
    });
    expect(res2.status).toBe(404);
  });

  it('unsupported HTTP methods return 405 Method Not Allowed', async () => {
    const resPut = await app.request(`/ping/${testCheckUuid}`, {
      method: 'PUT',
    });
    expect(resPut.status).toBe(405);

    const resDelete = await app.request(`/${testCheckUuid}`, {
      method: 'DELETE',
    });
    expect(resDelete.status).toBe(405);
  });
});
