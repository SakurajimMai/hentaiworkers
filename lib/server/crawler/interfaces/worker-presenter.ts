import { NextResponse } from 'next/server';
import { AppError, type AppErrorCode } from '../../shared/errors';

export type WorkerErrorBody = Readonly<{
  error: {
    code: AppErrorCode | 'INTERNAL_ERROR';
    message: string;
    retryable: boolean;
    details?: Readonly<Record<string, unknown>>;
  };
}>;

export type WorkerSuccessBody<T> = Readonly<{
  data: T;
}>;

export function presentWorkerOk<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json({ data } satisfies WorkerSuccessBody<T>, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

export function presentWorkerEmpty(status = 204) {
  return new NextResponse(null, { status });
}

export function presentWorkerError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const body: WorkerErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.details ? { details: error.details } : {}),
      },
    };
    return NextResponse.json(body, { status: error.status });
  }

  const body: WorkerErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: '内部错误',
      retryable: true,
    },
  };
  return NextResponse.json(body, { status: 500 });
}

/** Stable error mapping used by contract tests (no NextResponse). */
export function mapWorkerError(error: unknown): {
  status: number;
  body: WorkerErrorBody;
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: '内部错误',
        retryable: true,
      },
    },
  };
}
