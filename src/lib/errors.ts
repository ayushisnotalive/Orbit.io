export type ErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'plan_limit_reached'
  | 'rate_limited'
  | 'conflict'
  | 'account_disabled'
  | 'internal';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly field?: string;
  public readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    status?: number,
    options?: { field?: string; details?: unknown },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = options?.field;
    this.details = options?.details;

    if (status) {
      this.status = status;
    } else {
      switch (code) {
        case 'invalid_input':
          this.status = 400;
          break;
        case 'unauthorized':
          this.status = 401;
          break;
        case 'forbidden':
        case 'account_disabled':
          this.status = 403;
          break;
        case 'not_found':
          this.status = 404;
          break;
        case 'plan_limit_reached':
          this.status = 402;
          break;
        case 'conflict':
          this.status = 409;
          break;
        case 'rate_limited':
          this.status = 429;
          break;
        case 'internal':
        default:
          this.status = 500;
          break;
      }
    }
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        field: this.field || null,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
