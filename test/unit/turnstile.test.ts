import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTurnstileToken } from '../../src/auth/turnstile.js';
import { env } from '../../src/env.js';

describe('Turnstile Verification (src/auth/turnstile.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes automatically when TURNSTILE_SECRET is undefined / not set', async () => {
    // When no secret is configured, returns success: true
    const result = await verifyTurnstileToken('any-token');
    expect(result.success).toBe(true);
  });

  it('returns false when TURNSTILE_SECRET is set but token is missing', async () => {
    // Temporarily mock env.TURNSTILE_SECRET
    const originalSecret = env.TURNSTILE_SECRET;
    (env as any).TURNSTILE_SECRET = '0x4AAAAAAABbbbbbbbbbbbb';

    try {
      const result = await verifyTurnstileToken('');
      expect(result.success).toBe(false);
      expect(result.errorCodes).toContain('missing-input-response');
    } finally {
      (env as any).TURNSTILE_SECRET = originalSecret;
    }
  });

  it('verifies valid token with Cloudflare siteverify endpoint', async () => {
    const originalSecret = env.TURNSTILE_SECRET;
    (env as any).TURNSTILE_SECRET = '0x4AAAAAAABbbbbbbbbbbbb';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await verifyTurnstileToken('valid-cf-token', '1.2.3.4');
      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    } finally {
      (env as any).TURNSTILE_SECRET = originalSecret;
      vi.unstubAllGlobals();
    }
  });

  it('returns failure when Cloudflare rejects the token', async () => {
    const originalSecret = env.TURNSTILE_SECRET;
    (env as any).TURNSTILE_SECRET = '0x4AAAAAAABbbbbbbbbbbbb';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await verifyTurnstileToken('rejected-cf-token');
      expect(result.success).toBe(false);
      expect(result.errorCodes).toContain('invalid-input-response');
    } finally {
      (env as any).TURNSTILE_SECRET = originalSecret;
      vi.unstubAllGlobals();
    }
  });
});
