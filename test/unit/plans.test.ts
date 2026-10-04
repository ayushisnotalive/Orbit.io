import { describe, it, expect } from 'vitest';
import { PLANS, getEffectivePlan } from '../../src/config/plans.js';

describe('Plan Configuration', () => {
  it('should define correct limits for FREE, PRO, and PLUS', () => {
    expect(PLANS.FREE.checks).toBe(10);
    expect(PLANS.PRO.checks).toBe(50);
    expect(PLANS.PLUS.checks).toBe(200);

    expect(PLANS.FREE.minPeriodSec).toBe(900);
    expect(PLANS.PRO.minPeriodSec).toBe(60);
    expect(PLANS.PLUS.minPeriodSec).toBe(60);

    expect(PLANS.FREE.minGapSec).toBe(300);
    expect(PLANS.PRO.minGapSec).toBe(10);
    expect(PLANS.PLUS.minGapSec).toBe(10);
  });

  it('should respect admin override unconditionally while active', () => {
    const user = {
      plan: 'PLUS' as const,
      planStatus: 'NONE' as const,
      planSource: 'ADMIN' as const,
      adminPlanUntil: new Date(Date.now() + 100000),
      pastDueSince: null,
    };

    expect(getEffectivePlan(user)).toBe('PLUS');
  });

  it('should fallback to FREE if adminPlanUntil has expired', () => {
    const user = {
      plan: 'PLUS' as const,
      planStatus: 'NONE' as const,
      planSource: 'ADMIN' as const,
      adminPlanUntil: new Date(Date.now() - 100000),
      pastDueSince: null,
    };

    expect(getEffectivePlan(user)).toBe('FREE');
  });

  it('should maintain paid tier within 7-day past due window', () => {
    const user = {
      plan: 'PRO' as const,
      planStatus: 'PAST_DUE' as const,
      planSource: 'PROVIDER' as const,
      adminPlanUntil: null,
      pastDueSince: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    };

    expect(getEffectivePlan(user)).toBe('PRO');
  });

  it('should fallback to FREE if past due exceeds 7 days', () => {
    const user = {
      plan: 'PRO' as const,
      planStatus: 'PAST_DUE' as const,
      planSource: 'PROVIDER' as const,
      adminPlanUntil: null,
      pastDueSince: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
    };

    expect(getEffectivePlan(user)).toBe('FREE');
  });
});
