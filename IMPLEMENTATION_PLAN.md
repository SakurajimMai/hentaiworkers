## Implementation Plan - AnimeStream

### 1. Web Frontend (`src/`)
- [x] Vite + React 19 + TypeScript
- [x] Tailwind CSS + shadcn/ui
- [x] Home (列表 + 搜索 + 标签) / Watch (播放 + 画廊 + 推荐)
- [x] 动态 SEO meta + sitemap

### 2. 移动端 (`mobile/`)
- [x] Expo SDK 54 + expo-router 6 + 紫色暗色主题
- [x] 5 个底部 Tab: 热门 / 发现 / 标签 / 历史 / 收藏
- [x] 详情页 (海报 + 简介 + 剧照滑动 lightbox + 推荐)
- [x] 独立横屏播放路由 (Artplayer + hls.js 内嵌 WebView，零 CDN)
- [x] AsyncStorage 本地历史/收藏
- [x] 品牌 SplashScreen + Ionicons 矢量图标
- [x] URL 归一化 (`new URL().toString()` 修复 `%23` 双重编码)

### 3. 后端 API (`functions/`)
- [x] Hono + Drizzle ORM + 全局 CORS
- [x] D1 (SQLite) / Hyperdrive (MySQL) 双驱动
- [x] `/api/animes` 支持 `sort=popular|latest`
- [x] `/api/tags` 返回全部有效标签
- [x] 孤立标签清理 (810 → 234)
- [x] 相似推荐 (基于共同标签匹配数)

### 4. 部署
- [x] Cloudflare Pages 项目: `hentai` (绑定 `anime.ixacg.top`)
- [x] D1 binding: `DB` (`hentai`)
- [x] Hyperdrive binding: `HYPERDRIVE`
- [x] 手动部署: `npm run build && npx wrangler pages deploy dist --project-name=hentai`
