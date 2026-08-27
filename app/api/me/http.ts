import { NextResponse } from 'next/server';
import { AppError } from '@/lib/server/shared/errors';

export function meError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(
    { error: '内部错误', code: 'INTERNAL_ERROR' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function meJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
