# AnimeStream 🎬

一个现代化的在线动漫视频播放平台，基于 React + Cloudflare Pages + MySQL 构建。

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ 特性

- 🎨 **现代化 UI** - 基于 React 19 + Tailwind CSS + shadcn/ui
- 🔍 **智能搜索** - 支持标题和日文标题的模糊搜索
- 🏷️ **标签筛选** - 多标签分类浏览，智能推荐
- 📱 **响应式设计** - 完美适配桌面端和移动端
- ⚡ **高性能** - Cloudflare Pages 全球 CDN 加速
- 🗄️ **数据库加速** - Cloudflare Hyperdrive 连接池
- 🎬 **相似推荐** - 基于标签的智能推荐算法
- 🖼️ **图片画廊** - 支持 lightbox 全屏查看
- 📄 **SEO 优化** - 动态 meta 标签 + sitemap
- 🔄 **动态分页** - 响应式分页组件

## 🛠️ 技术栈

### 前端
- **框架**: React 19.2.0 + TypeScript
- **构建工具**: Vite 7.2.4
- **路由**: React Router DOM 7.10.1
- **样式**: Tailwind CSS + shadcn/ui
- **图标**: Lucide React

### 后端
- **框架**: Hono (Cloudflare Functions)
- **数据库**: MySQL + Drizzle ORM
- **部署**: Cloudflare Pages + Functions
- **数据库加速**: Cloudflare Hyperdrive

## 📁 项目结构

```
anime-web/
├── src/
│   ├── components/      # UI 组件 (shadcn/ui)
│   ├── lib/            # API 客户端和工具函数
│   ├── pages/          # 页面组件
│   │   ├── Home.tsx    # 首页 (列表 + 搜索 + 标签)
│   │   └── Watch.tsx   # 播放页
│   ├── App.tsx         # 主应用组件 + Header
│   └── main.tsx        # 入口文件
├── functions/          # Cloudflare Functions (后端 API)
│   ├── api/
│   │   └── [[path]].js # API 路由处理器
│   ├── schema.js       # 数据库 Schema
│   └── sitemap.xml.js  # 动态 sitemap 生成
├── public/             # 静态资源
│   ├── dm.svg          # 网站图标
│   └── robots.txt      # SEO robots
├── index.html          # HTML 模板 (包含 SEO meta 标签)
├── wrangler.toml       # Cloudflare 配置
└── package.json        # 依赖配置
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

### 3. 配置环境

编辑 `wrangler.toml`:

```toml
name = "your-project-name"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "your-hyperdrive-id"

# 本地开发使用
localConnectionString = "mysql://user:password@host:3306/database"
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
1. 绑定 Hyperdrive 数据库连接
2. 设置环境变量 `HYPERDRIVE`

## 📖 API 端点

所有 API 都通过 Cloudflare Functions 提供:

- `GET /api/health` - 健康检查
- `GET /api/animes?page=1&limit=48&tag=1&search=keyword` - 获取动漫列表
- `GET /api/animes/:id` - 获取动漫详情
- `GET /api/animes/:id/similar` - 获取相似动漫
- `GET /sitemap.xml` - 动态生成 sitemap

## 🎨 主要功能

### 首页
- 6x8 网格布局 (48 个/页)
- 响应式卡片动画
- 搜索功能 (支持中文 + 日文标题)
- 标签筛选
- 智能分页 (移动端优化)

### 播放页
- 视频播放器 (HTML5 video)
- 动漫详情 (标题、描述、标签)
- 图片画廊 (点击放大)
- 相似推荐 (基于标签匹配)
- 动态 SEO meta 标签

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

- `HYPERDRIVE` - Hyperdrive 数据库绑定

### 本地开发环境变量

在 `wrangler.toml` 中配置:

- `localConnectionString` - 本地 MySQL 连接字符串

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
