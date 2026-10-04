import { CONSTANTS } from '../config/constants.js';
import { AppError } from '../lib/errors.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

// In-memory state for sliding window rate limiter
const slidingWindows = new Map<string, number[]>();

// In-memory state for bounded LRU negative cache (UUID -> expiresAtMs)
const negativeCache = new Map<string, number>();

/**
 * Evaluates whether a request for a given key is allowed under a sliding window rate limit (D-14).
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
 */
export function checkRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const cutoff = now - windowMs;

  let timestamps = slidingWindows.get(key) || [];

  // Filter timestamps within the active sliding window
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    const earliest = timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((earliest + windowMs - now) / 1000));
    slidingWindows.set(key, timestamps);
    return { allowed: false, retryAfter };
  }

  timestamps.push(now);
  slidingWindows.set(key, timestamps);
  return { allowed: true };
}

/**
 * Asserts rate limit, throwing AppError('rate_limited', 429) if exceeded (D-15).
 */
export function assertRateLimit(key: string, limit: number, windowSeconds: number): void {
  const result = checkRateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    throw new AppError('rate_limited', `Rate limit exceeded. Please retry after ${result.retryAfter} seconds.`, 429, {
      details: { retryAfter: result.retryAfter },
    });
  }
}

/**
 * Records an unknown ping UUID into the bounded LRU negative cache (D-13).
 */
export function recordNegativeCache(
  uuid: string,
  maxEntries: number = CONSTANTS.NEGATIVE_CACHE_MAX_ENTRIES,
  ttlSeconds: number = CONSTANTS.NEGATIVE_CACHE_TTL_SECONDS,
): void {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  // If already present, delete first so re-insertion places it at the newest position (LRU order)
  if (negativeCache.has(uuid)) {
    negativeCache.delete(uuid);
  } else if (negativeCache.size >= maxEntries) {
    // Evict oldest (first key in insertion order)
    const oldestKey = negativeCache.keys().next().value;
    if (oldestKey !== undefined) {
      negativeCache.delete(oldestKey);
    }
  }

  negativeCache.set(uuid, expiresAt);
}

/**
 * Checks whether a ping UUID is present and unexpired in the negative cache (D-13).
 * Refreshes recency order on hit.
 */
export function isNegativeCached(uuid: string): boolean {
  if (!negativeCache.has(uuid)) {
    return false;
  }

  const expiresAt = negativeCache.get(uuid)!;
  const now = Date.now();

  if (now > expiresAt) {
    negativeCache.delete(uuid);
    return false;
  }

  // Refresh recency on access (LRU promotion)
  negativeCache.delete(uuid);
  negativeCache.set(uuid, expiresAt);

  return true;
}

/**
 * Resets all in-memory rate limiting and negative cache state (D-16).
 * Provided for clean unit and integration test isolation.
 */
export function resetRateLimits(): void {
  slidingWindows.clear();
  negativeCache.clear();
}
