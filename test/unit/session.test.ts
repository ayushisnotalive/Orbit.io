import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/db/client.js';
import {
  createSession,
  validateSession,
  destroySession,
  destroyAllUserSessions,
  SESSION_DURATION_MS,
  SLIDING_WINDOW_THRESHOLD_MS,
} from '../../src/auth/session.js';
import { hashToken } from '../../src/security/crypto.js';

describe('Session Engine (src/auth/session.ts)', () => {
  let testUser: { id: string; email: string };

  beforeEach(async () => {
    // Create unique user for each test
    testUser = await prisma.user.create({
      data: {
        email: `session-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        plan: 'FREE',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a session with a hashed token in database and 30-day expiration', async () => {
    const { token, session } = await createSession(testUser.id, {
      userAgent: 'Mozilla/5.0 Test Agent',
      ip: '192.168.1.50',
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(32);

    // Verify database row
    const idHash = hashToken(token);
    const dbSession = await prisma.session.findUnique({
      where: { idHash },
    });

    expect(dbSession).toBeDefined();
    expect(dbSession?.idHash).toBe(idHash);
    expect(dbSession?.userId).toBe(testUser.id);
    expect(dbSession?.userAgent).toBe('Mozilla/5.0 Test Agent');
    expect(dbSession?.ipHash).toBeDefined();

    // Verify ~30 day expiration
    const diffMs = dbSession!.expiresAt.getTime() - dbSession!.createdAt.getTime();
    expect(diffMs).toBeCloseTo(SESSION_DURATION_MS, -3);
  });

  it('validates a valid session and returns associated user', async () => {
    const { token } = await createSession(testUser.id);
    const result = await validateSession(token);

    expect(result).not.toBeNull();
    expect(result?.session.userId).toBe(testUser.id);
    expect(result?.session.user.email).toBe(testUser.email);
    expect(result?.refreshed).toBe(false);
  });

  it('returns null for an invalid or non-existent token', async () => {
    const result = await validateSession('completely-bogus-token-xyz');
    expect(result).toBeNull();
  });

  it('returns null and purges expired sessions', async () => {
    const { token } = await createSession(testUser.id);
    const idHash = hashToken(token);

    // Force expiration into the past
    await prisma.session.update({
      where: { idHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await validateSession(token);
    expect(result).toBeNull();

    // Verify row was deleted
    const checkDb = await prisma.session.findUnique({ where: { idHash } });
    expect(checkDb).toBeNull();
  });

  it('returns null for suspended or deleted users', async () => {
    const { token } = await createSession(testUser.id);

    // Suspend user
    await prisma.user.update({
      where: { id: testUser.id },
      data: { disabledAt: new Date(), disabledReason: 'Violation' },
    });

    const result = await validateSession(token);
    expect(result).toBeNull();
  });

  it('slides expiration window forward by 30 days when last seen > 24 hours ago', async () => {
    const { token } = await createSession(testUser.id);
    const idHash = hashToken(token);

    // Set lastSeenAt to 25 hours ago
    const pastLastSeen = new Date(Date.now() - (SLIDING_WINDOW_THRESHOLD_MS + 60 * 60 * 1000));
    await prisma.session.update({
      where: { idHash },
      data: { lastSeenAt: pastLastSeen },
    });

    const result = await validateSession(token);
    expect(result).not.toBeNull();
    expect(result?.refreshed).toBe(true);

    const updatedExpiresAt = result!.session.expiresAt.getTime();
    const expectedExpiresAt = Date.now() + SESSION_DURATION_MS;
    expect(updatedExpiresAt).toBeCloseTo(expectedExpiresAt, -4);
  });

  it('destroys a single session', async () => {
    const { token } = await createSession(testUser.id);
    const success = await destroySession(token);
    expect(success).toBe(true);

    const validation = await validateSession(token);
    expect(validation).toBeNull();
  });

  it('destroys all sessions for a user (sign out everywhere)', async () => {
    const s1 = await createSession(testUser.id);
    const s2 = await createSession(testUser.id);
    const s3 = await createSession(testUser.id);

    const count = await destroyAllUserSessions(testUser.id);
    expect(count).toBeGreaterThanOrEqual(3);

    expect(await validateSession(s1.token)).toBeNull();
    expect(await validateSession(s2.token)).toBeNull();
    expect(await validateSession(s3.token)).toBeNull();
  });
});
