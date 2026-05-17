# AnimeStream 🎬

一个现代化的在线动漫视频播放平台。Web 端基于 React + Cloudflare Pages，移动端基于 Expo/React Native。后端 API 由 Cloudflare Functions + D1 (SQLite) 提供。

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ 特性

- 🎨 **现代化 UI** - Web 端 React 19 + shadcn/ui，移动端 Expo 54 紫色暗色主题
- 🔥 **热门推荐** - 按真实播放量降序的热门排序 (`sort=popular`)
- 🔍 **智能搜索** - 支持中文标题和日文标题的模糊搜索
- 🏷️ **标签系统** - 全部标签浏览页 + 标签筛选 + 基于标签的相似推荐
- 📱 **跨平台** - Web 响应式 + iOS/Android 原生 (Expo)
- 🎬 **Artplayer 内嵌** - WebView + 本地打包 Artplayer/hls.js，无 CDN 依赖
- ⚡ **CORS + Hono** - Cloudflare Functions 全局 CORS，移动端可直连
- 📚 **本地存储** - 收藏与历史仅存于设备本地，无云同步
- 🖼️ **剧照画廊** - 滑动浏览 + lightbox 全屏
- 📄 **SEO 优化** - 动态 meta + sitemap

## 🛠️ 技术栈

### Web 前端 (`src/`)
- React 19.2 + TypeScript + Vite 7
- React Router 7 + Tailwind CSS + shadcn/ui
- Lucide React 图标

### 移动端 (`mobile/`)
- Expo SDK 54 + React Native 0.81 + expo-router 6
- @expo/vector-icons (Ionicons)
- AsyncStorage 本地持久化
- expo-screen-orientation 横屏播放
- WebView + Artplayer 5 + hls.js 1.5 (本地打包，零 CDN)

### 后端 (`functions/`)
- Hono (Cloudflare Functions) + 全局 CORS 中间件
- Drizzle ORM (D1 SQLite / MySQL Hyperdrive 双驱动)
- 部署: Cloudflare Pages + Functions

## 📁 项目结构

```
anime-web/
├── src/                  # Web 前端
│   ├── components/       # shadcn/ui 组件
│   ├── pages/Home.tsx    # 首页 (列表 + 搜索 + 标签)
│   └── pages/Watch.tsx   # 播放页
├── mobile/               # 移动端 (Expo)
│   ├── app/(tabs)/       # 底部 5 个 Tab: 热门 / 发现 / 标签 / 历史 / 收藏
│   ├── app/detail/[id]   # 详情页 (海报 + 简介 + 剧照 + 推荐)
│   ├── app/player/[id]   # 强制横屏播放页 (Artplayer)
│   ├── components/       # AnimeCard / VideoPlayer / SplashScreen / AppState
│   ├── services/         # api / storage / media (URL 归一化)
│   └── constants/theme   # 紫色暗色主题 token
├── functions/            # Cloudflare Functions
│   ├── api/[[path]].js   # API 路由 (animes / tags / similar / health)
│   ├── schema.js         # Drizzle Schema
│   └── sitemap.xml.js    # 动态 sitemap
├── public/               # 静态资源
├── wrangler.toml         # Cloudflare 配置 (D1 + Hyperdrive)
└── package.json
```

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/anime-web.git
cd anime-web
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置数据库

项目支持两种数据库配置，在 `wrangler.toml` 中通过 `DB_TYPE` 切换:

#### 选项 1: D1 (SQLite) - 推荐 ✅

完全免费，与 Cloudflare 深度集成。

```toml
name = "your-project-name"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "your-d1-database-name"
database_id = "your-d1-database-id"

[vars]
DB_TYPE = "d1"
```

#### 选项 2: MySQL + Hyperdrive

适合已有 MySQL 数据库的场景。

```toml
name = "your-project-name"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "your-hyperdrive-id"

[vars]
DB_TYPE = "hyperdrive"

# 本地开发使用
# localConnectionString = "mysql://user:password@host:3306/database"
```

### 4. 数据库 Schema

数据库包含三个表:

- **animes** - 动漫信息 (标题、描述、封面、视频 URL 等)
- **tags** - 标签信息
- **animeTags** - 动漫与标签的关联表

详见 `functions/schema.js`

### 5. 本地开发

```bash
# 构建前端
npm run build

# 启动本地开发服务器 (使用 localConnectionString)
npm run pages:dev

# 访问 http://localhost:8788
```

### 6. 部署到 Cloudflare Pages

```bash
# 一键构建并部署
npm run deploy
```

部署后需要在 Cloudflare Dashboard 中:

**使用 D1:**
1. 创建 D1 数据库并绑定 (binding: `DB`)
2. 设置环境变量 `DB_TYPE = "d1"`

**使用 Hyperdrive:**
1. 创建 Hyperdrive 配置并绑定 (binding: `HYPERDRIVE`)
2. 设置环境变量 `DB_TYPE = "hyperdrive"`

## 📖 API 端点

所有 API 通过 Cloudflare Functions 提供，全局 CORS 已开启:

- `GET /api/health` - 健康检查 (列出表名)
- `GET /api/animes?page=1&limit=48&tag=1&search=keyword&sort=popular|latest` - 动漫列表
  - `sort=popular` 按 `viewCount` 降序 (热门)
  - 默认/其它值 按 `createdAt` 降序 (最新)
- `GET /api/animes/:id` - 动漫详情 (含 tags)
- `GET /api/animes/:id/similar` - 基于共同标签的相似推荐
- `GET /api/tags` - 全部有效标签 (按名称排序)
- `GET /sitemap.xml` - 动态 sitemap

## 🎨 主要功能

### Web 首页
- 网格布局 + 搜索 + 标签筛选 + 智能分页

### 移动端 (Expo)
- **热门** - 按播放量排序的真实热门 (`sort=popular`)
- **发现** - 搜索 + 标签筛选 + 紧凑分页 (`< 1 2 3 ... end >`)
- **标签** - 全部有效标签的 2 列网格 (无关联标签已清理)
- **历史/收藏** - AsyncStorage 本地持久化，支持编辑/移除/清空
- **详情** - 海报 + 简介 (自动转换 `\n`) + 剧照画廊 (滑动 lightbox) + 相似推荐
- **播放** - 独立横屏路由，Artplayer + hls.js 内嵌 WebView
- **启动页** - 品牌 splash 动画 (`SplashScreen` 组件)

### 播放页 (Web)
- HTML5 video + 详情 + 图片画廊 + 相似推荐 + 动态 SEO

### SEO 优化
- 动态页面标题和描述
- Open Graph 标签 (社交媒体分享)
- Twitter Card 标签
- 关键词标签 (基于动漫标签)
- 动态生成 sitemap.xml
- robots.txt

## 🔧 开发脚本

```bash
# 开发模式 (仅前端)
npm run dev

# 构建生产版本
npm run build

# 本地测试 Pages Functions
npm run pages:dev

# 代码检查
npm run lint

# 部署到 Cloudflare Pages
npm run deploy
```

## 📝 环境变量

### Cloudflare Pages 环境变量

在 Cloudflare Dashboard 中配置:

- `DB_TYPE` - 数据库类型: `d1` (默认) 或 `hyperdrive`
- `DB` - D1 数据库绑定 (仅当 DB_TYPE = "d1")
- `HYPERDRIVE` - Hyperdrive 绑定 (仅当 DB_TYPE = "hyperdrive")

### 本地开发环境变量

在 `wrangler.toml` 中配置:

- `DB_TYPE` - 数据库类型
- `localConnectionString` - 本地 MySQL 连接字符串 (仅 Hyperdrive)

## 🔐 安全注意事项

- ⚠️ 不要将 `wrangler.toml` 提交到公开仓库 (包含数据库凭据)
- ⚠️ 将 `wrangler.toml` 添加到 `.gitignore`
- ✅ 创建 `wrangler.toml.example` 作为配置模板

## 📊 性能优化

- ✅ 使用 Cloudflare CDN 全球加速
- ✅ Hyperdrive 数据库连接池 (减少连接延迟)
- ✅ 图片懒加载 (lazy loading)
- ✅ 代码分割和树摇 (Vite)
- ✅ Sitemap 缓存 (1 小时)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

## 📄 License

MIT License

## 🔗 相关链接

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Hono 框架](https://hono.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Drizzle ORM](https://orm.drizzle.team/)

---

Made with ❤️ by AnimeStream Team
