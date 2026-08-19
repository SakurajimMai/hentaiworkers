import { Platform } from 'react-native';

export const colors = {
  background: '#0A0A0F',
  surface: '#13131C',
  surfaceElevated: '#1C1C28',
  surfaceMuted: '#2A2A3A',
  border: '#23232F',
  borderStrong: '#2F2F3F',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textSubtle: '#71717A',
  primary: '#8B5CF6',
  primaryStrong: '#7C3AED',
  primarySoft: 'rgba(139, 92, 246, 0.16)',
  accent: '#A855F7',
  amber: '#F59E0B',
  danger: '#F87171',
  success: '#34D399',
  black: '#000000',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const shadow = Platform.select({
  web: {
    boxShadow: '0px 12px 24px rgba(0, 0, 0, 0.32)',
  },
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 10,
  },
}) as object;

export const screenFill = {
  backgroundColor: colors.background,
  flex: 1,
} as const;

export const virtualizedListProps = {
  initialNumToRender: 9,
  maxToRenderPerBatch: 9,
  removeClippedSubviews: false,
  updateCellsBatchingPeriod: 16,
  windowSize: 10,
} as const;
