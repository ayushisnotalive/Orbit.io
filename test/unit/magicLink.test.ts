import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from '../../src/db/client.js';
import {
  requestMagicLink,
  verifyMagicLink,
  MAGIC_LINK_EXPIRATION_MS,
} from '../../src/auth/magicLink.js';
import { hashToken } from '../../src/security/crypto.js';

describe('Passwordless Magic Links (src/auth/magicLink.ts)', () => {
  const testEmail = `magic-link-${Date.now()}@example.com`;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects invalid email formats', async () => {
    await expect(requestMagicLink({ email: 'not-an-email' })).rejects.toThrow('Invalid email');
  });

  it('generates a 15-minute single-use login token and stores its hash', async () => {
    const res = await requestMagicLink({ email: testEmail });
    expect(res.success).toBe(true);
    expect(res.previewUrl).toBeDefined();

    // Extract raw token from previewUrl
    const url = new URL(res.previewUrl!);
    const rawToken = url.searchParams.get('token');
    expect(rawToken).toBeDefined();

    const tokenHash = hashToken(rawToken!);
    const record = await prisma.loginToken.findUnique({
      where: { tokenHash },
    });

    expect(record).toBeDefined();
    expect(record?.email).toBe(testEmail);
    expect(record?.usedAt).toBeNull();

    // Verify ~15 min expiration
    const diffMs = record!.expiresAt.getTime() - record!.createdAt.getTime();
    expect(diffMs).toBeCloseTo(MAGIC_LINK_EXPIRATION_MS, -3);
  });

  it('verifies a valid token, marks it used, and creates a session', async () => {
    const email = `verify-success-${Date.now()}@example.com`;
    const res = await requestMagicLink({ email });
    const rawToken = new URL(res.previewUrl!).searchParams.get('token')!;

    const result = await verifyMagicLink(rawToken);

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(email);
    expect(result.user.emailVerifiedAt).toBeDefined();
    expect(result.sessionToken).toBeDefined();

    // Verify token was marked used
    const tokenHash = hashToken(rawToken);
    const updatedRecord = await prisma.loginToken.findUnique({ where: { tokenHash } });
    expect(updatedRecord?.usedAt).not.toBeNull();
  });

  it('strictly rejects using the same token twice', async () => {
    const email = `verify-twice-${Date.now()}@example.com`;
    const res = await requestMagicLink({ email });
    const rawToken = new URL(res.previewUrl!).searchParams.get('token')!;

    // First verification succeeds
    await verifyMagicLink(rawToken);

    // Second verification must fail
    await expect(verifyMagicLink(rawToken)).rejects.toThrow('already been used');
  });

  it('rejects expired login tokens', async () => {
    const email = `expired-${Date.now()}@example.com`;
    const res = await requestMagicLink({ email });
    const rawToken = new URL(res.previewUrl!).searchParams.get('token')!;
    const tokenHash = hashToken(rawToken);

    // Expire the token manually
    await prisma.loginToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(verifyMagicLink(rawToken)).rejects.toThrow('expired');
  });

  it('rejects invalid or forged token strings', async () => {
    await expect(verifyMagicLink('completely-nonexistent-token')).rejects.toThrow(
      'Invalid or expired',
    );
  });
});
