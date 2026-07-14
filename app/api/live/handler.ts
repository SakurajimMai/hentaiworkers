import { NextResponse } from 'next/server';

/** Liveness: process is up; no dependency checks. */
export function createLiveHandler() {
  return async function liveHandler() {
    return NextResponse.json({ status: 'live' }, { status: 200 });
  };
}
