export const APP_ERROR_CODES = [
  'CONFIG_INVALID',
  'SOURCE_AUTH_FAILED',
  'SOURCE_RATE_LIMITED',
  'SOURCE_UNAVAILABLE',
  'STORAGE_AUTH_FAILED',
  'STORAGE_AUTH_EXPIRED',
  'STORAGE_UNAVAILABLE',
  'SECRET_REVOKED',
  'RESULT_INVALID',
  'RESULT_CONFLICT',
  'LEASE_LOST',
  'WORKER_INCOMPATIBLE',
  'WORKER_TOKEN_INVALID',
  'WORKER_TOKEN_REVOKED',
  'WORKER_FORBIDDEN',
  'BATCH_TOO_LARGE',
  'DATABASE_TRANSIENT',
  'CANCELLED',
  'INTERNAL_ERROR',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];
export type AppErrorDetails = Readonly<Record<string, unknown>>;

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly details?: AppErrorDetails,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
