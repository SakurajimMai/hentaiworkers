export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'animestream.theme.v1';
export const THEME_CHANGE_EVENT = 'animestream-theme-change';

export const THEME_COLORS: Record<ThemeMode, string> = {
  light: '#f6f4ef',
  dark: '#121318',
};

export function resolveThemeMode(saved: string | null, prefersDark: boolean): ThemeMode {
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[mode]);
}
