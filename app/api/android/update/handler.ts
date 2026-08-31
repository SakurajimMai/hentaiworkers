import { NextResponse } from 'next/server';
import type { AndroidUpdateManifest } from '@/lib/public-api-types';
import { ANDROID_UPDATE_CACHE_CONTROL } from '@/lib/server/android-update';

export type AndroidUpdateLoader = () => Promise<AndroidUpdateManifest>;

export function createAndroidUpdateHandler(loadUpdate: AndroidUpdateLoader) {
  return async function androidUpdateHandler() {
    try {
      return NextResponse.json(await loadUpdate(), {
        headers: { 'Cache-Control': ANDROID_UPDATE_CACHE_CONTROL },
      });
    } catch (error) {
      console.error('[api/android/update] update metadata load failed', error);
      return NextResponse.json(
        { error: 'Update metadata unavailable' },
        { status: 502 },
      );
    }
  };
}
