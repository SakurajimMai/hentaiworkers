import type { PlayerLineParser } from './settings';

/**
 * Pure admin form parser for player settings.
 * Kept free of server-only imports so unit tests can call it directly.
 */
export function parsePlayerSettingsFromForm(formData: FormData) {
  const parsersRaw = String(formData.get('playerLineParsers') || '');
  const lineParsers: PlayerLineParser[] = [];
  for (const line of parsersRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // match|parserUrl   or   match|parserUrl|0 to disable
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [match, parserUrl, enabledFlag] = parts;
    if (!match || !parserUrl) continue;
    lineParsers.push({
      match: match.slice(0, 64),
      parserUrl: parserUrl.slice(0, 500),
      enabled: enabledFlag === undefined ? true : enabledFlag !== '0' && enabledFlag !== 'false',
    });
    if (lineParsers.length >= 50) break;
  }

  return {
    enableContextMenu: formData.get('playerEnableContextMenu') === '1',
    theme: String(formData.get('playerTheme') || '#E53935').slice(0, 32) || '#E53935',
    worksFallbackArtPlayer: formData.get('playerWorksFallbackArtPlayer') === '1',
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
    lineParsers,
  };
}
