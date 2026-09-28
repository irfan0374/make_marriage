import 'server-only';
import { ERROR_CODES, type ErrorCode, type ErrorDetails } from '@/shared/error-codes';

export { ERROR_CODES, type ErrorCode, type ErrorDetails };

/** Thrown by services and handlers; mapped to the error envelope by `defineHandler`. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails | undefined;
  /** Extra response headers, e.g. `Retry-After` for RATE_LIMITED. */
  readonly headers: Record<string, string> | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { details?: ErrorDetails; headers?: Record<string, string> } = {},
  ) {
    super(message ?? ERROR_CODES[code].message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = options.details;
    this.headers = options.headers;
  }
}
