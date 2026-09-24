'use client';

import { useEffect, useState } from 'react';
import { IconMoon, IconSun } from '@/components/icons';
import { localStore } from '@/lib/client/safe-storage';
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  resolveThemeMode,
  type ThemeMode,
} from '@/lib/client/theme';

export type { ThemeMode };

export function ThemeMenu({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const next = resolveThemeMode(
      localStore()?.getItem(THEME_STORAGE_KEY) ?? null,
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
    setMode(next);
    applyTheme(next);
    const onThemeChange = (event: Event) => {
      const nextMode = (event as CustomEvent<ThemeMode>).detail;
      if (nextMode === 'light' || nextMode === 'dark') setMode(nextMode);
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  const toggleMode = () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try {
      localStore()?.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page when it cannot be remembered.
    }
    applyTheme(next);
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: next }));
  };

  const NextIcon = mode === 'dark' ? IconSun : IconMoon;
  const nextLabel = mode === 'dark' ? '切换到日间模式' : '切换到夜间模式';
  return (
    <button
      type="button"
      className={compact ? 'theme-trigger theme-trigger-compact' : 'theme-trigger'}
      aria-label={nextLabel}
      title={nextLabel}
      data-theme-mode={mode}
      onClick={toggleMode}
    >
      <NextIcon size={15} />
      {!compact && <span>{mode === 'dark' ? '日间' : '夜间'}</span>}
    </button>
  );
}
