'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  injectGlobalAdHtml,
  shouldLoadGlobalAdScripts,
} from '@/lib/client/global-ad-scripts';

export function GlobalAdScripts({
  socialBar,
  popunder,
}: {
  socialBar: string;
  popunder: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!shouldLoadGlobalAdScripts(pathname)) return;
    if (socialBar.trim()) injectGlobalAdHtml('social-bar', socialBar);
    if (popunder.trim()) injectGlobalAdHtml('popunder', popunder);
  }, [pathname, socialBar, popunder]);

  return null;
}
