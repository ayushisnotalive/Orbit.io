export const PLANS = {
  FREE: {
    name: 'Free',
    checks: 10,
    channels: 3,
    minPeriodSec: 900, // 15 min
    minGapSec: 300, // 5 min
    pingHistory: 20,
    incidentDays: 30,
    emailsPerDay: 30,
    priceMonthly: 0,
    priceYearly: 0,
  },
  PRO: {
    name: 'Pro',
    checks: 50,
    channels: 10,
    minPeriodSec: 60, // 1 min
    minGapSec: 10,
    pingHistory: 100,
    incidentDays: 90,
    emailsPerDay: 200,
    priceMonthly: 9,
    priceYearly: 90,
  },
  PLUS: {
    name: 'Plus',
    checks: 200,
    channels: 25,
    minPeriodSec: 60, // 1 min
    minGapSec: 10,
    pingHistory: 100,
    incidentDays: 180,
    emailsPerDay: 500,
    priceMonthly: 19,
    priceYearly: 190,
  },
} as const;

export type PlanName = keyof typeof PLANS;

export interface PlanUserContext {
  plan: PlanName;
  planStatus: 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  planSource: 'PROVIDER' | 'ADMIN';
  adminPlanUntil: Date | null;
  pastDueSince: Date | null;
}

/**
 * Calculates effective plan based on admin override or provider subscription state.
 * Grace window for past due payments is 7 days before falling back to FREE.
 */
export function getEffectivePlan(user: PlanUserContext, now = new Date()): PlanName {
  if (user.planSource === 'ADMIN') {
    if (!user.adminPlanUntil || user.adminPlanUntil > now) {
      return user.plan;
    }
  }

  if (user.planStatus === 'ACTIVE') {
    return user.plan;
  }

  if (user.planStatus === 'PAST_DUE' && user.pastDueSince) {
    const pastDueMs = now.getTime() - user.pastDueSince.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (pastDueMs <= sevenDaysMs) {
      return user.plan;
    }
  }

  return 'FREE';
}
