import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay } from '../../src/jobs/alertWorker.js';

describe('Alert Worker: Exponential Backoff (calculateBackoffDelay)', () => {
  it('calculates correct delay for attempt 0 (60 seconds)', () => {
    const delay = calculateBackoffDelay(0);
    expect(delay).toBe(60);
  });

  it('calculates correct delay for attempt 1 (120 seconds)', () => {
    const delay = calculateBackoffDelay(1);
    expect(delay).toBe(120);
  });

  it('calculates correct delay for attempt 2 (240 seconds)', () => {
    const delay = calculateBackoffDelay(2);
    expect(delay).toBe(240);
  });

  it('calculates correct delay for attempt 3 (480 seconds)', () => {
    const delay = calculateBackoffDelay(3);
    expect(delay).toBe(480);
  });

  it('calculates correct delay for attempt 4 (960 seconds)', () => {
    const delay = calculateBackoffDelay(4);
    expect(delay).toBe(960);
  });

  it('calculates correct delay for attempt 5 (1920 seconds)', () => {
    const delay = calculateBackoffDelay(5);
    expect(delay).toBe(1920);
  });

  it('caps delay at 3600 seconds (1 hour) for attempt 6', () => {
    const delay = calculateBackoffDelay(6);
    expect(delay).toBe(3600);
  });

  it('caps delay at 3600 seconds for attempt 100', () => {
    const delay = calculateBackoffDelay(100);
    expect(delay).toBe(3600);
  });

  it('follows exponential pattern: min(60 * 2^attempts, 3600)', () => {
    // Test the formula across a range of attempts
    const expectations = [
      { attempts: 0, expected: 60 },
      { attempts: 1, expected: 120 },
      { attempts: 2, expected: 240 },
      { attempts: 3, expected: 480 },
      { attempts: 4, expected: 960 },
      { attempts: 5, expected: 1920 },
      { attempts: 6, expected: 3600 }, // would be 3840, but capped
      { attempts: 7, expected: 3600 },
      { attempts: 10, expected: 3600 },
      { attempts: 20, expected: 3600 },
    ];

    for (const { attempts, expected } of expectations) {
      const delay = calculateBackoffDelay(attempts);
      expect(delay).toBe(expected);
    }
  });
});
