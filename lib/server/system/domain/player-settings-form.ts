/**
 * Pure admin form parser for player settings.
 * Kept free of server-only imports so unit tests can call it directly.
 */
export function parsePlayerSettingsFromForm(formData: FormData) {
  return {
    enableContextMenu: formData.get('playerEnableContextMenu') === '1',
    theme: String(formData.get('playerTheme') || '#E53935').slice(0, 32) || '#E53935',
    preRollAd: {
      enabled: formData.get('playerPreRollEnabled') === '1',
      videoUrl: String(formData.get('playerPreRollVideoUrl') || '').slice(0, 1000),
      imageUrl: String(formData.get('playerPreRollImageUrl') || '').slice(0, 1000),
      html: String(formData.get('playerPreRollHtml') || '').slice(0, 4000),
      clickUrl: String(formData.get('playerPreRollClickUrl') || '').slice(0, 1000),
      playDuration: Math.max(
        0,
        Math.min(120, parseInt(String(formData.get('playerPreRollPlayDuration') || '5'), 10) || 0),
      ),
      totalDuration: Math.max(
        0,
        Math.min(180, parseInt(String(formData.get('playerPreRollTotalDuration') || '10'), 10) || 0),
      ),
      muted: formData.get('playerPreRollMuted') === '1',
    },
    pauseAd: {
      enabled: formData.get('playerPauseAdEnabled') === '1',
      videoUrl: String(formData.get('playerPauseAdVideoUrl') || '').slice(0, 1000),
      imageUrl: String(formData.get('playerPauseAdImageUrl') || '').slice(0, 1000),
      html: String(formData.get('playerPauseAdHtml') || '').slice(0, 4000),
      clickUrl: String(formData.get('playerPauseAdClickUrl') || '').slice(0, 1000),
      muted: formData.get('playerPauseAdMuted') === '1',
    },
  };
}
