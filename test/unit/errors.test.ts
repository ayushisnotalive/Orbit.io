import { describe, it, expect } from 'vitest';
import { AppError, type ErrorCode } from '../../src/lib/errors.js';

describe('AppError Hierarchy', () => {
  it('should map each error code to its designated default HTTP status code', () => {
    const expectations: Array<{ code: ErrorCode; status: number }> = [
      { code: 'invalid_input', status: 400 },
      { code: 'unauthorized', status: 401 },
      { code: 'forbidden', status: 403 },
      { code: 'account_disabled', status: 403 },
      { code: 'not_found', status: 404 },
      { code: 'plan_limit_reached', status: 402 },
      { code: 'conflict', status: 409 },
      { code: 'rate_limited', status: 429 },
      { code: 'internal', status: 500 },
    ];

    for (const { code, status } of expectations) {
      const err = new AppError(code, `Test message for ${code}`);
      expect(err.code).toBe(code);
      expect(err.status).toBe(status);
      expect(err.name).toBe('AppError');
      expect(err.message).toBe(`Test message for ${code}`);
    }
  });

  it('should allow custom HTTP status code override', () => {
    const err = new AppError('invalid_input', 'Custom status', 422);
    expect(err.code).toBe('invalid_input');
    expect(err.status).toBe(422);
  });

  it('should correctly format JSON payload with field and details', () => {
    const err = new AppError('invalid_input', 'Invalid cron expression', 400, {
      field: 'cronExpr',
      details: { reason: 'Must have 5 fields' },
    });

    const json = err.toJSON();
    expect(json).toEqual({
      error: {
        code: 'invalid_input',
        message: 'Invalid cron expression',
        field: 'cronExpr',
        details: { reason: 'Must have 5 fields' },
      },
    });
  });

  it('should format JSON with null field when omitted', () => {
    const err = new AppError('not_found', 'Check not found');
    expect(err.toJSON()).toEqual({
      error: {
        code: 'not_found',
        message: 'Check not found',
        field: null,
      },
    });
  });
});
