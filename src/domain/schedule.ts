import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import { AppError } from '../lib/errors.js';
import { CONSTANTS } from '../config/constants.js';

export type ScheduleType = 'PERIOD' | 'CRON';

export interface ComputeScheduleInput {
  type: ScheduleType;
  periodSeconds?: number | null;
  cron?: string | null;
  timezone?: string | null;
  graceSeconds?: number | null;
  referenceDate?: Date;
  currentExpectedAt?: Date | null;
  earlyMarginSeconds?: number;
}

export interface ScheduleResult {
  nextExpectedAt: Date;
  alertAfter: Date;
  description: string;
  nextRuns: Date[];
}

const DEFAULT_EARLY_MARGIN_SECONDS = 60;

/**
 * Validates an IANA timezone string against the runtime Intl API.
 */
export function validateTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new AppError('invalid_input', `Invalid timezone identifier: '${timezone}'`, undefined, { field: 'timezone' });
  }
}

/**
 * Validates a cron expression and optional IANA timezone string.
 * Throws AppError('invalid_input') if syntax or timezone is invalid.
 */
export function validateCronExpression(expression: string, timezone?: string): void {
  if (!expression || typeof expression !== 'string' || expression.trim().length === 0) {
    throw new AppError('invalid_input', 'Cron expression cannot be empty', undefined, { field: 'cron' });
  }

  if (timezone) {
    validateTimezone(timezone);
  }

  try {
    // Attempt parse with croner
    new Cron(expression.trim(), { timezone: timezone || 'UTC' });
  } catch (err) {
    throw new AppError('invalid_input', `Invalid cron expression: ${(err as Error).message}`, undefined, { field: 'cron' });
  }
}

/**
 * Produces a human-readable description of a PERIOD or CRON schedule.
 */
export function describeSchedule(type: ScheduleType, value: number | string, _timezone?: string): string {
  if (type === 'PERIOD') {
    const seconds = typeof value === 'number' ? value : parseInt(value, 10);
    if (isNaN(seconds) || seconds <= 0) {
      return 'Invalid period';
    }

    if (seconds % 86400 === 0) {
      const days = seconds / 86400;
      return days === 1 ? 'Every 1 day' : `Every ${days} days`;
    }
    if (seconds % 3600 === 0) {
      const hours = seconds / 3600;
      return hours === 1 ? 'Every 1 hour' : `Every ${hours} hours`;
    }
    if (seconds % 60 === 0) {
      const mins = seconds / 60;
      return mins === 1 ? 'Every 1 minute' : `Every ${mins} minutes`;
    }
    return `Every ${seconds} seconds`;
  }

  // CRON description via cronstrue
  try {
    return cronstrue.toString(String(value), {
      throwExceptionOnParseError: false,
      use24HourTimeFormat: false,
    });
  } catch {
    return String(value);
  }
}

/**
 * Computes nextExpectedAt, alertAfter, description, and future run dates for a check schedule.
 * Accounts for IANA timezones, DST changes, and early ping arrivals (D-01, D-02, D-03, D-04).
 */
export function computeNextExpected(input: ComputeScheduleInput): ScheduleResult {
  const {
    type,
    periodSeconds,
    cron,
    referenceDate = new Date(),
    currentExpectedAt,
    earlyMarginSeconds = DEFAULT_EARLY_MARGIN_SECONDS,
  } = input;
  const timezone = input.timezone || 'UTC';
  const graceSeconds = input.graceSeconds ?? CONSTANTS.DEFAULT_GRACE_SECONDS;

  if (type === 'PERIOD') {
    if (!periodSeconds || periodSeconds <= 0) {
      throw new AppError('invalid_input', 'Period seconds must be greater than zero', undefined, { field: 'period' });
    }

    let baseTime = referenceDate.getTime();

    // Window-aware advancement (D-04): if early ping landed shortly before currentExpectedAt
    if (currentExpectedAt) {
      const currentExpectedTime = currentExpectedAt.getTime();
      const diffMs = currentExpectedTime - referenceDate.getTime();
      const marginMs = Math.min(earlyMarginSeconds, periodSeconds) * 1000;

      if (diffMs >= 0 && diffMs <= marginMs) {
        baseTime = currentExpectedTime;
      }
    }

    const nextExpectedAt = new Date(baseTime + periodSeconds * 1000);
    const alertAfter = new Date(nextExpectedAt.getTime() + graceSeconds * 1000);
    const description = describeSchedule('PERIOD', periodSeconds);

    const nextRuns: Date[] = [];
    for (let i = 1; i <= 5; i++) {
      nextRuns.push(new Date(baseTime + periodSeconds * i * 1000));
    }

    return { nextExpectedAt, alertAfter, description, nextRuns };
  }

  // Type is CRON
  if (!cron) {
    throw new AppError('invalid_input', 'Cron expression is required for CRON schedule', undefined, { field: 'cron' });
  }

  validateCronExpression(cron, timezone);

  const cronInstance = new Cron(cron.trim(), { timezone });

  let calculationRef = referenceDate;

  // Window-aware advancement (D-04):
  if (currentExpectedAt) {
    const currentExpectedTime = currentExpectedAt.getTime();
    const diffMs = currentExpectedTime - referenceDate.getTime();
    const marginMs = earlyMarginSeconds * 1000;

    if (diffMs >= 0 && diffMs <= marginMs) {
      // Advance reference point to currentExpectedAt so nextRun calculates the subsequent slot
      calculationRef = currentExpectedAt;
    }
  }

  const nextExpectedAt = cronInstance.nextRun(calculationRef);
  if (!nextExpectedAt) {
    throw new AppError('invalid_input', 'Cron schedule has no future execution dates', undefined, { field: 'cron' });
  }

  const alertAfter = new Date(nextExpectedAt.getTime() + graceSeconds * 1000);
  const description = describeSchedule('CRON', cron, timezone);
  const nextRuns = cronInstance.nextRuns(5, calculationRef);

  return { nextExpectedAt, alertAfter, description, nextRuns };
}
