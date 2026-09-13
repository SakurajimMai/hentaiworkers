'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  applyRestoredScrollY,
  CATALOG_RETURN_KEY,
  CATALOG_SCROLL_RESTORE_MAX_MS,
  catalogLocationKey,
  decideScrollRestoreAttempt,
  installCatalogScrollHistoryListener,
  isManagedScrollPath,
  parseStoredScrollY,
  readCatalogScrollY,
  shouldRestoreCatalogScroll,
  takeHistoryTraverse,
  writeCatalogScrollY,
} from '@/lib/client/catalog-scroll-restoration';

installCatalogScrollHistoryListener();

export function CatalogScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const previousKeyRef = useRef<string | null>(null);
  const restoringRef = useRef(false);

  useEffect(() => {
    const key = catalogLocationKey(pathname, search);
    const previousKey = previousKeyRef.current;
    const traverse = takeHistoryTraverse();
    previousKeyRef.current = key;

    if (!traverse && previousKey && previousKey !== key) {
      try {
        sessionStorage.setItem(CATALOG_RETURN_KEY, previousKey);
      } catch {
        // Ignore storage failures; history back still works via the browser button.
      }
    }

    if (!isManagedScrollPath(pathname)) {
      restoringRef.current = false;
      return;
    }

    let cancelled = false;
    let frame = 0;
    const started = performance.now();
    const saved = shouldRestoreCatalogScroll({
      traverse,
      pathname,
      hash: window.location.hash,
    })
      ? parseStoredScrollY(readCatalogScrollY(sessionStorage, key))
      : null;

    if (saved != null) {
      restoringRef.current = true;
      const tick = () => {
        if (cancelled) return;
        const decision = decideScrollRestoreAttempt({
          savedY: saved,
          scrollHeight: document.documentElement.scrollHeight,
          viewport: window.innerHeight,
          elapsedMs: performance.now() - started,
          maxMs: CATALOG_SCROLL_RESTORE_MAX_MS,
        });
        applyRestoredScrollY((options) => window.scrollTo(options), decision.top);
        if (decision.continue) {
          frame = window.requestAnimationFrame(tick);
          return;
        }
        restoringRef.current = false;
      };
      tick();
    } else {
      restoringRef.current = false;
    }

    const persist = () => {
      if (restoringRef.current) return;
      writeCatalogScrollY(sessionStorage, key, window.scrollY);
    };
    let saveFrame = 0;
    const onScroll = () => {
      if (cancelled || saveFrame) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0;
        if (!cancelled) persist();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (saveFrame) window.cancelAnimationFrame(saveFrame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [pathname, search]);

  return null;
}
