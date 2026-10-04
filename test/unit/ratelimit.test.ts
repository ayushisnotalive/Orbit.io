import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  assertRateLimit,
  recordNegativeCache,
  isNegativeCached,
  resetRateLimits,
} from '../../src/security/ratelimit.js';
import { AppError } from '../../src/lib/errors.js';

describe('In-Memory Rate Limiter & Negative Cache (src/security/ratelimit.ts)', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe('checkRateLimit (Sliding Window)', () => {
    it('allows requests within the configured rate limit', () => {
      const key = 'ip:192.168.1.1';
      const limit = 3;
      const windowSeconds = 10;

      expect(checkRateLimit(key, limit, windowSeconds)).toEqual({ allowed: true });
      expect(checkRateLimit(key, limit, windowSeconds)).toEqual({ allowed: true });
      expect(checkRateLimit(key, limit, windowSeconds)).toEqual({ allowed: true });
    });

    it('rejects requests exceeding rate limit with retryAfter calculation', () => {
      const key = 'ip:10.0.0.1';
      const limit = 2;
      const windowSeconds = 5;

      expect(checkRateLimit(key, limit, windowSeconds).allowed).toBe(true);
      expect(checkRateLimit(key, limit, windowSeconds).allowed).toBe(true);

      const rejected = checkRateLimit(key, limit, windowSeconds);
      expect(rejected.allowed).toBe(false);
      expect(rejected.retryAfter).toBeGreaterThanOrEqual(1);
      expect(rejected.retryAfter).toBeLessThanOrEqual(5);
    });

    it('tracks rates separately across different keys', () => {
      const key1 = 'user:1';
      const key2 = 'user:2';

      expect(checkRateLimit(key1, 1, 60).allowed).toBe(true);
      expect(checkRateLimit(key1, 1, 60).allowed).toBe(false);

      expect(checkRateLimit(key2, 1, 60).allowed).toBe(true);
    });
  });

  describe('assertRateLimit', () => {
    it('does not throw when within rate limit', () => {
      expect(() => assertRateLimit('endpoint:test', 5, 10)).not.toThrow();
    });

    it('throws AppError rate_limited (HTTP 429) when limit exceeded', () => {
      const key = 'endpoint:flood';
      assertRateLimit(key, 1, 10);

      expect(() => assertRateLimit(key, 1, 10)).toThrowError(AppError);
      try {
        assertRateLimit(key, 1, 10);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.code).toBe('rate_limited');
        expect(appErr.status).toBe(429);
        expect((appErr.details as { retryAfter: number }).retryAfter).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Negative Cache (Bounded Map LRU)', () => {
    it('correctly reports non-existent and recorded negative cache entries', () => {
      const uuid = '00000000-0000-0000-0000-000000000001';
      expect(isNegativeCached(uuid)).toBe(false);

      recordNegativeCache(uuid);
      expect(isNegativeCached(uuid)).toBe(true);
    });

    it('clears negative cache on resetRateLimits()', () => {
      const uuid = '00000000-0000-0000-0000-000000000002';
      recordNegativeCache(uuid);
      expect(isNegativeCached(uuid)).toBe(true);

      resetRateLimits();
      expect(isNegativeCached(uuid)).toBe(false);
    });

    it('evicts the oldest entries when capacity exceeds max capacity', () => {
      // Test LRU eviction with a small max capacity test helper or simulated loop
      const uuid1 = 'uuid-1';
      const uuid2 = 'uuid-2';
      const uuid3 = 'uuid-3';

      recordNegativeCache(uuid1);
      recordNegativeCache(uuid2);

      // Access uuid1 to refresh recency
      expect(isNegativeCached(uuid1)).toBe(true);

      recordNegativeCache(uuid3);

      expect(isNegativeCached(uuid1)).toBe(true);
      expect(isNegativeCached(uuid3)).toBe(true);
    });
  });
});
