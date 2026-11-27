# Adsterra 广告接入与网页端广告位补全

## Goal

补全网页端（含手机浏览器）剩余广告功能并集成 Adsterra Publisher API，同时保持 Android App 与 `/api/ads` 契约完全不变。

## Requirements

- **全站脚本广告**：后台支持 Social Bar 与 Popunder 独立开关和 HTML 粘贴，前台（含漫画阅读页）通过 `createContextualFragment` 注入顶层文档；`/admin`、`/login`、`/register`、`/forgot-password`、`/reset-password`、`/verify-email` 不加载。
- **Smartlink 兜底跳转**：支持从 Adsterra API 同步或手动编辑，作为片头/暂停广告未填 `clickUrl` 时的跳转地址，以及信息流空白「广告位招租」卡片的跳转目标（仅网页端生效）。
- **页面横幅广告**：首页（幻灯片下方）、播放页（播放器下方）、漫画详情页（简介区与推荐之间）三处横幅，按 768px 断点只挂载电脑端（建议 728×90）或手机端（建议 320×50）之一；单端填写时自动共用。
- **Adsterra 同步**：API Key 加密存储（AAD `system:ads:adsterra_api_key`），并行请求 `domains.json` 与 `placements.json`，保存广告位列表与同步时间，并在 Smartlink 为空时自动填充并启用。

## Acceptance Criteria

- [ ] `npm run lint && npm run typecheck && npm run test && npm run check:boundaries && npm run check:legacy && npm run build` 通过。
- [ ] `npm run test:ads:browser` 通过。
- [ ] 新增及原有广告、Adsterra 客户端、全站脚本排除名单与契约测试全部通过，真实 API Key 未写入仓库任何文件。
