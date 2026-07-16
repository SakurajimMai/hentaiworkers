/** Shared MacCMS provider presets (keep in sync with crawler_worker/sources/maccms.py). */

export type MacCmsProviderKey =
  | 'ikun'
  | 'wujin'
  | 'yaya'
  | 'bfzy'
  | 'okzy'
  | 'hongniu'
  | 'maccms';

export type MacCmsPreset = Readonly<{
  key: MacCmsProviderKey;
  label: string;
  baseUrl: string;
  playFrom?: string;
  /** Suggested type ids for JP/KR anime; empty = auto-detect. */
  typeIds: ReadonlyArray<number>;
  helpUrl?: string;
}>;

export const MACCMS_PRESETS: ReadonlyArray<MacCmsPreset> = [
  {
    key: 'ikun',
    label: 'iKun 资源（日本动漫）',
    baseUrl: 'https://ikunzyapi.com/api.php/provide/vod/',
    playFrom: 'ikm3u8',
    typeIds: [37],
    helpUrl: 'https://www.ikunzy.com/ikun/help.html',
  },
  {
    key: 'wujin',
    label: '无尽资源（动漫）',
    baseUrl: 'https://api.wujinapi.me/api.php/provide/vod/',
    playFrom: 'wjm3u8',
    typeIds: [50, 30],
    helpUrl: 'https://help.wujinapi.me/#wlcome',
  },
  {
    key: 'yaya',
    label: '鸭鸭资源（日本动漫）',
    baseUrl: 'https://cj.yayazy.net/api.php/provide/vod/',
    playFrom: 'yym3u8',
    typeIds: [59, 30],
    helpUrl: 'https://yayazy3.com/index.php/label/help.html',
  },
  {
    key: 'bfzy',
    label: '暴风资源（动漫）',
    baseUrl: 'https://bfzyapi.com/api.php/provide/vod/',
    playFrom: 'bfzym3u8',
    typeIds: [41],
    helpUrl: 'https://bfzy2.tv/helps/',
  },
  {
    key: 'okzy',
    label: 'OK 资源（日本动漫）',
    baseUrl: 'https://okzyw.cc/api.php/provide/vod/',
    playFrom: 'okm3u8',
    typeIds: [59, 30],
    helpUrl: 'https://okzyw.cc/index.php/label/help.html',
  },
  {
    key: 'hongniu',
    label: '红牛资源（日本动漫）',
    baseUrl: 'https://www.hongniuzy2.com/api.php/provide/vod/',
    playFrom: 'hnm3u8',
    typeIds: [37],
    helpUrl: 'https://www.hongniuziyuan.com/index.php/help',
  },
  {
    key: 'maccms',
    label: '通用 MacCMS（自定义 API）',
    baseUrl: 'https://example.com/api.php/provide/vod/',
    typeIds: [],
  },
] as const;

export function getMacCmsPreset(key: string): MacCmsPreset | undefined {
  return MACCMS_PRESETS.find((p) => p.key === key);
}

export const MACCMS_SOURCE_KEYS: ReadonlySet<string> = new Set(
  MACCMS_PRESETS.map((p) => p.key),
);
