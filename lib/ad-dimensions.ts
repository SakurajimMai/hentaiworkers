export const MAX_AD_WIDTH = 1920;
export const MAX_AD_HEIGHT = 600;

export type AdDimensions = { width?: number; height?: number };

export const AD_SIZE_PRESETS = [
  { label: '自动', width: 0, height: 0 },
  { label: '320 × 50', width: 320, height: 50 },
  { label: '320 × 100', width: 320, height: 100 },
  { label: '300 × 250', width: 300, height: 250 },
  { label: '336 × 280', width: 336, height: 280 },
  { label: '468 × 60', width: 468, height: 60 },
  { label: '728 × 90', width: 728, height: 90 },
  { label: '970 × 90', width: 970, height: 90 },
  { label: '970 × 250', width: 970, height: 250 },
  { label: '300 × 600', width: 300, height: 600 },
] as const;

export function normalizeAdDimensions({ width = 0, height = 0 }: AdDimensions = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.min(MAX_AD_WIDTH, Math.max(1, Math.floor(width))),
    height: Math.min(MAX_AD_HEIGHT, Math.max(1, Math.floor(height))),
  };
}
