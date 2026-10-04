import { describe, it, expect } from 'vitest';
import {
  computeNextExpected,
  validateCronExpression,
  describeSchedule,
  type ComputeScheduleInput,
  type ScheduleResult,
} from '../../src/domain/schedule.js';
import { AppError } from '../../src/lib/errors.js';

describe('Schedule Engine (src/domain/schedule.ts)', () => {
  describe('validateCronExpression', () => {
    it('accepts valid 5-part cron expressions', () => {
      expect(() => validateCronExpression('0 2 * * *')).not.toThrow();
      expect(() => validateCronExpression('*/15 * * * *')).not.toThrow();
      expect(() => validateCronExpression('30 4 1,15 * 1-5')).not.toThrow();
    });

    it('rejects invalid cron expressions with AppError invalid_input on cron field', () => {
      expect(() => validateCronExpression('invalid-cron')).toThrowError(AppError);
      try {
        validateCronExpression('invalid-cron');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.code).toBe('invalid_input');
        expect(appErr.field).toBe('cron');
      }
    });

    it('rejects invalid timezones with AppError invalid_input on timezone field', () => {
      try {
        validateCronExpression('0 2 * * *', 'Invalid/Timezone_Not_Real');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.code).toBe('invalid_input');
        expect(appErr.field).toBe('timezone');
      }
    });
  });

  describe('describeSchedule', () => {
    it('describes PERIOD schedules in human-readable plain text', () => {
      expect(describeSchedule('PERIOD', 60)).toBe('Every 1 minute');
      expect(describeSchedule('PERIOD', 300)).toBe('Every 5 minutes');
      expect(describeSchedule('PERIOD', 3600)).toBe('Every 1 hour');
      expect(describeSchedule('PERIOD', 86400)).toBe('Every 1 day');
    });

    it('describes CRON schedules in plain English using cronstrue', () => {
      const desc = describeSchedule('CRON', '0 2 * * *');
      expect(desc.toLowerCase()).toContain('02:00 am');
    });
  });

  describe('computeNextExpected - PERIOD schedule', () => {
    it('computes nextExpectedAt and alertAfter for simple period', () => {
      const from = new Date('2026-01-01T12:00:00Z');
      const input: ComputeScheduleInput = {
        type: 'PERIOD',
        periodSeconds: 300,
        graceSeconds: 60,
        referenceDate: from,
      };

      const result = computeNextExpected(input);
      expect(result.nextExpectedAt.toISOString()).toBe('2026-01-01T12:05:00.000Z');
      expect(result.alertAfter.toISOString()).toBe('2026-01-01T12:06:00.000Z');
      expect(result.description).toBe('Every 5 minutes');
      expect(result.nextRuns).toHaveLength(5);
      expect(result.nextRuns[0].toISOString()).toBe('2026-01-01T12:05:00.000Z');
      expect(result.nextRuns[1].toISOString()).toBe('2026-01-01T12:10:00.000Z');
    });
  });

  describe('computeNextExpected - CRON schedule', () => {
    it('computes nextExpectedAt across UTC timezone', () => {
      const from = new Date('2026-01-01T01:00:00Z');
      const input: ComputeScheduleInput = {
        type: 'CRON',
        cron: '0 2 * * *',
        timezone: 'UTC',
        graceSeconds: 300,
        referenceDate: from,
      };

      const result = computeNextExpected(input);
      expect(result.nextExpectedAt.toISOString()).toBe('2026-01-01T02:00:00.000Z');
      expect(result.alertAfter.toISOString()).toBe('2026-01-01T02:05:00.000Z');
      expect(result.nextRuns).toHaveLength(5);
      expect(result.description.toLowerCase()).toContain('02:00 am');
    });

    it('evaluates native IANA timezone (America/New_York)', () => {
      // 2026-01-01 in NY is standard time (EST = UTC-5). 02:00 NY = 07:00 UTC.
      const from = new Date('2026-01-01T05:00:00Z');
      const input: ComputeScheduleInput = {
        type: 'CRON',
        cron: '0 2 * * *',
        timezone: 'America/New_York',
        graceSeconds: 300,
        referenceDate: from,
      };

      const result = computeNextExpected(input);
      expect(result.nextExpectedAt.toISOString()).toBe('2026-01-01T07:00:00.000Z');
    });

    it('handles DST transitions cleanly (Spring forward in America/New_York)', () => {
      // In 2026, US DST spring forward is March 8, 2026 (clock jumps 2:00 -> 3:00)
      const from = new Date('2026-03-08T05:00:00Z'); // 00:00 EST
      const input: ComputeScheduleInput = {
        type: 'CRON',
        cron: '30 2 * * *', // 02:30 doesn't exist during spring forward
        timezone: 'America/New_York',
        graceSeconds: 300,
        referenceDate: from,
      };

      // croner handles skipped hour by picking the next valid time without throwing
      expect(() => computeNextExpected(input)).not.toThrow();
      const result = computeNextExpected(input);
      expect(result.nextExpectedAt).toBeInstanceOf(Date);
    });

    it('handles leap day schedules (February 29)', () => {
      const from = new Date('2025-01-01T00:00:00Z');
      const input: ComputeScheduleInput = {
        type: 'CRON',
        cron: '0 0 29 2 *', // midnight on Feb 29
        timezone: 'UTC',
        graceSeconds: 300,
        referenceDate: from,
      };

      const result = computeNextExpected(input);
      // Next leap year after 2025 is 2028
      expect(result.nextExpectedAt.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    });
  });

  describe('Early ping window advancement (D-04)', () => {
    it('advances nextExpectedAt to subsequent occurrence when ping lands slightly before expected time', () => {
      const scheduledSlot = new Date('2026-01-01T02:00:00Z');
      // Ping arrives 15 seconds early at 01:59:45Z
      const earlyPingTime = new Date('2026-01-01T01:59:45Z');

      const input: ComputeScheduleInput = {
        type: 'CRON',
        cron: '0 2 * * *',
        timezone: 'UTC',
        graceSeconds: 300,
        referenceDate: earlyPingTime,
        currentExpectedAt: scheduledSlot,
      };

      const result = computeNextExpected(input);
      // Since it pinged for the 02:00 slot early, nextExpectedAt should advance to Jan 2 02:00
      expect(result.nextExpectedAt.toISOString()).toBe('2026-01-02T02:00:00.000Z');
    });

    it('does not advance if ping arrives well before the early window margin', () => {
      const scheduledSlot = new Date('2026-01-01T02:00:00Z');
      // Ping arrives 3 hours before expected time
      const farEarlyPing = new Date('2025-12-31T23:00:00Z');

      const input: ComputeScheduleInput = {
        type: 'CRON',
        cron: '0 2 * * *',
        timezone: 'UTC',
        graceSeconds: 300,
        referenceDate: farEarlyPing,
        currentExpectedAt: scheduledSlot,
      };

      const result = computeNextExpected(input);
      // It is still expecting the Jan 1 02:00 run
      expect(result.nextExpectedAt.toISOString()).toBe('2026-01-01T02:00:00.000Z');
    });
  });
});
