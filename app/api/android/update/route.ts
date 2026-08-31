import { createAndroidUpdateHandler, type AndroidUpdateLoader } from './handler';
import type { AndroidUpdateManifest } from '@/lib/public-api-types';
import {
  ANDROID_UPDATE_FRESH_TTL_MS,
  ANDROID_UPDATE_RETRY_DELAY_MS,
  ANDROID_UPDATE_STALE_TTL_MS,
  fetchLatestAndroidUpdate,
} from '@/lib/server/android-update';
import { StaleReadCache } from '@/lib/server/shared/stale-read-cache';

export const dynamic = 'force-dynamic';

const updateCache = new StaleReadCache<AndroidUpdateManifest>({
  maxEntries: 1,
  freshTtlMs: ANDROID_UPDATE_FRESH_TTL_MS,
  staleTtlMs: ANDROID_UPDATE_STALE_TTL_MS,
  retryDelayMs: ANDROID_UPDATE_RETRY_DELAY_MS,
  onBackgroundError: (error) => {
    console.error('[api/android/update] background cache refresh failed', error);
  },
});

const loadUpdate: AndroidUpdateLoader = () =>
  updateCache.get('latest', fetchLatestAndroidUpdate);

export const GET = createAndroidUpdateHandler(loadUpdate);
