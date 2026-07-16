'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { mergeGuestWatchProgressIfNeeded } from '@/components/watch-player';

/** Runs once on authenticated site shells to absorb guest localStorage history. */
export function WatchProgressMergeOnLogin({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;
    void mergeGuestWatchProgressIfNeeded().then((merged) => {
      if (merged > 0) router.refresh();
    });
  }, [enabled, router]);
  return null;
}
