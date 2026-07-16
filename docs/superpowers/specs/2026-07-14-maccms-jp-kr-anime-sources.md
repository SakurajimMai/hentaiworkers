# MacCMS 日韩动漫资源对接

## Goal

从苹果 CMS 风格资源站采集**日本 / 日韩动漫**外链（m3u8），写入 crawler 控制面，并入库到**独立** `anime_works` 表族（与旧 `animes` H 片库完全分离）。**只存流媒体外链，不下载媒体、不走 S3/SFTP。**

## Providers（help 页 → API）

| 适配器 key | Help | API base（默认） | 播放标识 |
|------------|------|------------------|----------|
| `ikun` | https://www.ikunzy.com/ikun/help.html | `https://ikunzyapi.com/api.php/provide/vod/` | `ikm3u8` |
| `wujin` | https://help.wujinapi.me/#wlcome | `https://api.wujinapi.me/api.php/provide/vod/` | `wjm3u8` |
| `yaya` | https://yayazy3.com/index.php/label/help.html | `https://cj.yayazy.net/api.php/provide/vod/` | `yym3u8` |
| `bfzy` | https://bfzy2.tv/helps/ | `https://bfzyapi.com/api.php/provide/vod/` | `bfzym3u8` |
| `okzy` | https://okzyw.cc/index.php/label/help.html | `https://okzyw.cc/api.php/provide/vod/` | `okm3u8` |
| `hongniu` | https://www.hongniuziyuan.com/index.php/help | `https://www.hongniuzy2.com/api.php/provide/vod/` | `hnm3u8` |
| `maccms` | 自定义 | 表单填写 | 可选 |

通用协议：`GET {base}?ac=detail&t={typeId}&pg={page}`（JSON）。列表 `ac=list` 返回 `class` 分类树。

## Filter policy

1. 默认 `typeIds` 为空时，从 `class` 自动挑选「日本动漫 / 日韩动漫」等分类。
2. 条目级再滤：`type_name` / `vod_area` 含日本/日韩/韩国；排除纯国产/大陆/港台/欧美。
3. 播放地址：优先 `playFrom` 匹配源，否则优先 flag 含 `m3u8`；多集取**最新一集** URL。
4. 入库目标：`anime_works.stream_url`（最新集 m3u8）+ `anime_work_sources` 幂等映射；**禁止**写入 `animes` / `anime_sources`。
5. 多集模型后续可在 `anime_works` 侧扩展，不复用旧片库 `media_sources`。

## Worker

- `crawler_worker/sources/maccms.py`：`MacCmsSource` + `PROVIDER_PRESETS`
- `main.py` 注册：`hanime` + `maccms` + 各 preset key
- Profile：`requiredSource` 取适配器名；`source.baseUrl` / `typeIds` / `maxPages` / `maxItems` / `hours`

## Admin

`/admin/crawler/profiles` 下拉可选上述资源站；默认示例为 iKun API。

## Ops notes

- 部分站可能要求白名单 / 限频；Worker 请控制 `maxPages`/`maxItems`。
- 外链 m3u8 可能防盗链；前台播放依赖源站 CDN 策略。
- 未自动下载媒体到 S3；默认外链模式。
