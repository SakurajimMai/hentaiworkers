/** Client-safe mirror of PublicPlayerConfig (no server imports). */

export type ClientPlayerPreRollAd = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  playDuration: number;
  totalDuration: number;
  muted: boolean;
};

export type ClientPlayerPauseAd = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  muted: boolean;
};

export type ClientPlayerConfig = {
  enableContextMenu: boolean;
  theme: string;
  preRollAd: ClientPlayerPreRollAd;
  pauseAd: ClientPlayerPauseAd;
};

export const DEFAULT_CLIENT_PLAYER_CONFIG: ClientPlayerConfig = {
  enableContextMenu: false,
  theme: '#E53935',
  preRollAd: {
    enabled: false,
    videoUrl: '',
    imageUrl: '',
    html: '',
    clickUrl: '',
    playDuration: 5,
    totalDuration: 10,
    muted: true,
  },
  pauseAd: {
    enabled: false,
    videoUrl: '',
    imageUrl: '',
    html: '',
    clickUrl: '',
    muted: true,
  },
};
