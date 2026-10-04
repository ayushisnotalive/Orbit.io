import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';

const execFileAsync = promisify(execFile);

describe('CLI Tooling Integration (cli/orbitping.sh)', () => {
  let server: any;
  const testPort = 3399;
  const scriptPath = path.resolve(process.cwd(), 'cli/orbitping.sh');
  let testUser: any;
  let testCheck: any;

  beforeAll(async () => {
    // Start local HTTP server
    server = serve({
      fetch: app.fetch,
      port: testPort,
    });

    testUser = await prisma.user.create({
      data: {
        email: `cli_test_${Date.now()}@example.com`,
        plan: 'PRO',
      },
    });
  });

  beforeEach(async () => {
    testCheck = await prisma.check.create({
      data: {
        userId: testUser.id,
        name: `CLI Check ${Date.now()}`,
        scheduleType: 'PERIOD',
        periodSeconds: 60,
      },
    });
  });

  afterEach(async () => {
    if (testCheck) {
      await prisma.ping.deleteMany({ where: { checkId: testCheck.id } });
      await prisma.incident.deleteMany({ where: { checkId: testCheck.id } });
      await prisma.check.deleteMany({ where: { id: testCheck.id } });
    }
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (testUser) {
      await prisma.user.deleteMany({ where: { id: testUser.id } });
    }
  });

  it('runs a successful command, outputs to stdout, and reports start + success pings', async () => {
    const env = {
      ...process.env,
      ORBITPING_HOST: `http://localhost:${testPort}`,
    };

    const { stdout, stderr } = await execFileAsync(
      scriptPath,
      ['run', testCheck.pingUuid, '--', 'echo', 'Hello from OrbitPing CLI'],
      { env },
    );

    expect(stdout).toContain('Hello from OrbitPing CLI');
    expect(stderr).toBe('');

    // Verify pings recorded in DB
    const pings = await prisma.ping.findMany({
      where: { checkId: testCheck.id },
      orderBy: { ts: 'desc' },
      take: 2,
    });

    expect(pings.length).toBeGreaterThanOrEqual(2);
    const kinds = pings.map((p) => p.kind);
    expect(kinds).toContain('START');
    expect(kinds).toContain('SUCCESS');
  });

  it('preserves non-zero exit code and sends failure tail to OrbitPing', async () => {
    const env = {
      ...process.env,
      ORBITPING_HOST: `http://localhost:${testPort}`,
    };

    let exitCode = 0;
    try {
      await execFileAsync(
        scriptPath,
        ['run', testCheck.pingUuid, '--', 'sh', '-c', 'echo "Database connection failed"; exit 7'],
        { env },
      );
    } catch (err: any) {
      exitCode = err.code;
    }

    expect(exitCode).toBe(7);

    // Verify failure ping recorded
    const failPing = await prisma.ping.findFirst({
      where: {
        checkId: testCheck.id,
        kind: 'FAIL',
        exitCode: 7,
      },
    });

    expect(failPing).not.toBeNull();
    expect(failPing?.body).toContain('Database connection failed');
  });

  it('provides crontab setup instructions with install command', async () => {
    const { stdout } = await execFileAsync(scriptPath, ['install', testCheck.pingUuid]);
    expect(stdout).toContain('Add this line to your crontab (crontab -e):');
    expect(stdout).toContain(`orbitping run ${testCheck.pingUuid}`);
  });
});
