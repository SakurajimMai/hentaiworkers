# 后台管理手册

地址：`/admin`（登录页 `/admin/login`）。

仅 `users.role = admin` 且 `is_active = 1` 的账号可进入。

## 1. 登录与退出

1. 打开 `/admin/login`。
2. 输入管理员用户名与密码。
3. 成功后进入概览页。
4. 右上角「退出」清除会话。

首次部署使用 `npm run seed:admin` 创建引导账号（见 `.env` 中 `ADMIN_BOOTSTRAP_*`，默认登录邮箱 `admin@ixacg.top`）。登录后请立即修改密码。

## 2. 功能导航

| 菜单 | 路径 | 能力 |
|------|------|------|
| 概览 | `/admin` | 里番/动漫/标签合计/用户统计 |
| 采集任务 | `/admin/crawler/jobs` | 入队、取消、重试；**终态任务可删**；按保留天数批量清理 |
| 爬虫存储 | `/admin/crawler/storage` | **S3/SFTP 入口说明**；默认外链采集不需要配置 |
| 里番 | `/admin/animes` | 里番列表、搜索、上架/下架、删除、编辑 |
| 动漫 | `/admin/works` | MacCMS `anime_works` 外链列表 |
| 动漫编辑 | `/admin/works/{id}` | 编辑元数据/线路/动漫标签（work_tags） |
| 标签 | `/admin/tags` | **单页双 Tab**：里番 `tags` / 动漫 `work_tags` |
| 新建/编辑里番 | `/admin/animes/new` 或 `/admin/animes/{id}` | 表单保存（里番标签） |
| 导入 | `/admin/import` | JSON 批量导入 |
| 用户 | `/admin/users` | 创建用户、改角色、启停、重置密码 |
| 系统 | `/admin/settings` | 邮箱白名单、SMTP、Trust、Turnstile |
| 账户 | `/admin/account` | 修改当前登录管理员密码 |
| 前台 | `/` | 回到公网站点 |

## 2.0 前台观看闭环（已实现）

| 能力 | 说明 |
|------|------|
| 观看进度 | `user_watch_progress`；登录用户经 `/api/me/watch-progress*` 同步 |
| 继续观看 | 首页区块；未完成且进度 &gt; 5s |
| 历史 | `/history` 单条/全部清除 |
| 游客 | localStorage；登录后自动 merge |
| 完成判定 | 进度 ≥ 90% 或剩余 ≤ 5s |
| 写入节流 | 起播一次 + 约 20s + 暂停/离开/结束 |
| media_sources | 已从 `animes.video_url` 回填 primary 行（为多源预留） |
| user_events | 产品分析事件表；起播/完成会写入 |

Session：Cookie 最长 7 天（`SESSION_MAX_AGE_SECONDS`）；未单独做服务端空闲超时。

### 账号与发现（Phase 2）

| 能力 | 说明 |
|------|------|
| 忘记密码 | `/forgot-password` → 邮件链接 → `/reset-password`（依赖 SMTP） |
| 列表模型 | `user_lists` / `user_list_items` 为权威；`user_favorites` 仅历史回填，不再双写 |
| 鉴权错误码 | 人会话未登录/失效用 `AUTH_REQUIRED`；Worker 机器令牌仍用 `WORKER_FORBIDDEN` |
| 动漫源 | MacCMS：`ikun` / `wujin` / `yaya` / `bfzy` / `okzy` / `hongniu` / `maccms`（见 profiles） |
| 搜索 | 标题 / 日文 / 英文 / 简介 LIKE |
| 最近更新 | 列表按 `COALESCE(updated_at, created_at)` |
| 根据收藏推荐 | 首页登录用户：共同标签 + 排除已看完 |
| 多片单 | `/favorites`：收藏 / 想看 / 在看 / 已看完 + 自定义列表与备注 |
| 搜索历史 | 顶栏本机最近搜索（localStorage） |
| 播放里程碑事件 | play_start / 25 / 50 / 75 / complete → `user_events` |

### 采集动漫外链（MacCMS）快速步骤

1. 部署/启动 **crawler worker**（需包含 `maccms` 适配器，注册时会上报 `ikun` 等 source）。
   - 本机一键：`npm run worker:provision`（首次签发令牌到 `.crawler-worker.env`，勿提交）→ 另开终端 `npm run worker:start`（需 Next 已监听且 Worker 能访问 `CRAWLER_CONTROL_URL`）。
   - 或后台 **Worker** 页创建节点并复制一次性令牌；生产 Compose 见 [deployment.md](./deployment.md) §5.3。
2. （可选）一键种子模板：`npm run seed:maccms-profiles`（按名称幂等；`--force` 更新已有模板配置）。
3. 或后台 **爬虫 → 模板**：选择资源站（如 iKun），确认 API Base URL 已自动填充。
4. 点 **从 API 加载分类**，在树形列表中**勾选**要采集的分类（如「日本动漫 #37」）；未勾选的分类一律不采。
5. 建议：`maxPages=3`、`maxItems=100`；可填 `hours=24` 只采最近更新；可配置 `pageOrder=reverse`（默认从新到旧）与页面并发。
6. 保存模板 → **任务** 手动启动，或配置调度。
7. 成功条目写入**独立表** `anime_works` + `work_tags`（`stream_url` 默认最新集；`play_lines_json` 含全部线路/分集外链），**绝不**写入里番 `animes`/`tags`，也**不**下载媒体。前台 `/works/{id}` 可切换线路与分集。
8. 若 claim 不到任务：检查 Worker 能力是否包含对应 `requiredSource`，以及模板 `requiredSource` 是否匹配。

## 2.1 系统设置（注册 / SMTP / Trust / Turnstile）

路径：`/admin/settings`。配置存入表 `system_settings`（迁移 `0004`），SMTP 密码与 Turnstile Secret **加密**存放。

| 区块 | 说明 |
|------|------|
| 注册与邮箱白名单 | 是否开放注册；是否强制邮箱验证；白名单（域名或完整邮箱，空=不限） |
| SMTP | 主机/端口/TLS/账号/发件人；可发测试邮件 |
| Trust | 注册/登录是否强制 Turnstile；验证链接有效期 |
| Turnstile | Cloudflare Site Key + Secret；须同时在 Trust 中打开对应开关才生效 |

**注意：**

1. 开启「注册后须邮箱验证」前必须启用 SMTP。
2. 前台用户邮箱存为 `users.username`；未验证用户 `is_active=0`，无法登录。
3. 部署后执行：`CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler`（会应用 `0004-system-settings`）。

## 3. 里番管理（animes）

### 列表

- 支持标题关键字搜索（中/日文）。
- **上架 / 下架**：控制前台与公开 API 是否展示。
- **删除**：同时删除作品与标签关联，不可恢复，请谨慎。

### 编辑字段

| 字段 | 必填 | 说明 |
|------|------|------|
| 标题 | 是 | 主标题 |
| 视频地址 | 是 | 可播放的 URL（mp4 / m3u8 等，取决于浏览器） |
| 日文 / 英文标题 | 否 | 展示与搜索 |
| 封面 URL | 否 | 海报 |
| 剧照 | 否 | 多个 URL 用英文逗号分隔 |
| 简介 | 否 | 纯文本 |
| 标签 | 否 | 多选（按住 Ctrl/Cmd） |
| 上架显示 | — | 勾选则前台可见 |

保存后会刷新相关页面缓存（revalidate）。

## 4. 标签管理

路径：**一个页面** `/admin/tags`，页内两个 Tab：

| Tab | 查询参数 | 字典表 | 关联表 |
|-----|----------|--------|--------|
| 里番 | `?scope=rifan`（默认） | `tags` | `anime_tags` |
| 动漫 | `?scope=anime` | `work_tags` | `anime_work_tags` |

- 顶部导航只有「标签」一项，不再拆成两个菜单。
- **添加**：填写名称（必填）与描述（写入当前 Tab 对应表）。
- **行内保存**：修改名称/描述后点「保存」。
- **删除**：若仍有作品关联该标签，会拒绝删除并提示关联数量。需先解除作品上的标签。
- 采集 MacCMS 动漫只会 upsert `work_tags`；Hanime/里番继续用 `tags`。数据永不混写。

## 4.1 爬虫存储（S3 / SFTP）在哪里？

路径：`/admin/crawler/storage`（爬虫子导航「存储」）。迁移：`0014-storage-profiles`。

| 场景 | 是否需要 S3/SFTP | 说明 |
|------|------------------|------|
| **Hanime 里番** | **是** | 模板选 `s3` 或 `sftp`；须先创建存储草稿 → 测试通过 → 激活 |
| MacCMS 动漫外链 | **否** | 模板选「外链」`external`，只存 m3u8/直链 |

### Hanime + 对象存储步骤

1. 部署迁移：`CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler`（`0014` 存储配置、`0015` 媒体预留、`0016` 调度存储绑定）。
2. 打开 **爬虫 → 存储**，填写 S3 或 SFTP 表单保存草稿。
3. 运行 `storage_test` 并激活通过的版本；测试会执行上传、发布和删除探针对象。
4. **爬虫 → 模板**：来源选 Hanime，媒体存储模式选 S3/SFTP 并保存。
5. **任务或调度** 保存时，控制面自动绑定已激活存储，并把**非密钥** `storageConfig` 写入不可变快照。
6. Worker 根据实际可用凭据上报 `storageDrivers`；也可用 `CRAWLER_STORAGE_DRIVERS` 显式覆盖。
7. Worker 进程还需对象存储**密钥环境变量**（不入库）：
   - S3：`CRAWLER_S3_ACCESS_KEY_ID` / `CRAWLER_S3_SECRET_ACCESS_KEY`（可选 `CRAWLER_S3_SESSION_TOKEN`）
   - SFTP：`CRAWLER_SFTP_PASSWORD` 或 `CRAWLER_SFTP_PRIVATE_KEY`
8. 运行时：Hanime 先按 `source + source_id` 跳过已入库条目，再下载 **MP4** 视频/封面/剧照 → `media/reserve` → 上传 S3/SFTP → 用公开 URL 提交 catalog。Hanime 源站是 progressive MP4，不依赖 ffmpeg/HLS 转封装。

## 5. 播放器设置

路径：`/admin/settings` →「播放器（ArtPlayer / 线路解析）」。

| 场景 | 播放方式 |
|------|----------|
| **里番** `/watch/{id}` | 固定 **ArtPlayer**（托管 progressive MP4）；可配广告、右键、主题色 |
| **动漫** `/works/{id}` | 按线路匹配 **解析播放器** iframe；未匹配且开启回退时用 ArtPlayer + 同源 `/api/media/proxy` |

### 线路解析配置

每行：`匹配关键字|解析地址`，例如：

```text
hnm3u8|https://www.hnjiexi.com/m3u8/?url=
红牛|https://www.hnjiexi.com/m3u8/?url=
```

- 匹配线路 `flag` 或名称（包含即可，不区分大小写）
- 分集媒体 URL 会拼到解析地址后（自动 `encodeURIComponent`）
- 行尾加 `|0` 可禁用该规则
- 解析 iframe **不展示** 本站 ArtPlayer 广告；仅 ArtPlayer 回退路径会应用广告配置

### 广告

展示优先级均为：**视频 → 自定义 HTML → 图片**。仅勾选「启用」但未填任何素材时，用户端**不会**看到广告。

| 类型 | 字段 | 行为 |
|------|------|------|
| **片头** | 视频 URL / 图片 / HTML / 点击跳转 / 静音 / 可关闭前秒数 / 总时长 | 使用 `artplayer-plugin-ads`；可关闭前秒数内不能跳过；到总时长后进正片。填 `0` 时插件仍约 1 秒后才显示关闭按钮 |
| **暂停** | 视频 URL / 图片 / HTML / 点击跳转 / 静音 | 用户暂停正片后覆盖一层；关闭后继续正片。片头广告播放期间、拖动进度条附近不会误弹 |

其他：

- **允许浏览器右键**：关闭后拦截播放器与浏览器 contextmenu
- **动漫 ArtPlayer 回退**：关闭则未匹配解析规则的线路不播 ArtPlayer
- **主题色**：ArtPlayer 强调色（如 `#E53935`）

素材 URL 须可被用户浏览器直接访问（广告资源**不**走媒体代理）。

## 6. 批量导入

路径：`/admin/import`。

粘贴 **JSON 数组**，提交后按条写入。

### 格式

```json
[
  {
    "id": 100,
    "title": "作品标题",
    "videoUrl": "https://example.com/video.mp4",
    "titleJapanese": "タイトル",
    "titleEnglish": "Title",
    "description": "简介",
    "cover": "https://example.com/cover.jpg",
    "fanart": "https://a.jpg,https://b.jpg",
    "tags": ["标签A", "标签B"],
    "isActive": 1
  }
]
```

### 规则

| 规则 | 行为 |
|------|------|
| `title` + `videoUrl`（或 `video_url`） | 必填，否则跳过该条 |
| 提供已存在的 `id` | 更新该行 |
| 无 `id` 或 id 不存在 | 插入新行 |
| `tags` 字符串数组 | 按名称查找，不存在则创建标签，并重建关联 |
| `isActive` / `is_active` 为 `0` | 下架；否则默认上架 |

导入成功会重定向并带上 `created` / `updated` 计数（query 参数）。

## 7. 用户与权限

| 角色 | 权限 |
|------|------|
| `admin` | 访问全部后台功能 |
| `user` | 不能登录后台（预留给未来前台账号能力） |

可操作：

- 创建用户（用户名 + ≥8 位密码 + 角色）
- 修改角色、启用/停用
- 填写「新密码」重置他人密码

停用（`is_active=0`）后无法维持有效管理会话。

## 8. 修改自己的密码

`/admin/account`：

1. 输入当前密码
2. 输入新密码（≥ 8 位）
3. 保存

## 8. 运营建议

1. 新内容先「下架」编辑完整再上架。
2. 删除前确认无误；重要数据依赖 MySQL 备份。
3. 外链封面/视频失效时在编辑页更新 URL。
4. 定期检查远程图床与视频源可用性。
5. 不要把管理员密码写进仓库或聊天记录。

## 9. 故障排查

| 现象 | 处理 |
|------|------|
| 登录失败 | 检查用户名密码、是否为 admin、是否启用 |
| 登录后立刻退出 | 检查 `SESSION_SECRET`、生产 HTTPS 与 Cookie |
| 保存无反应 | 看浏览器网络面板是否 500；查服务器日志 |
| 前台仍见旧数据 | 强制刷新；确认已上架；确认连的是同一数据库 |
| 导入报 JSON 错误 | 必须是数组；字段名注意驼峰/下划线兼容项 |

更偏技术的部署问题见 [deployment.md](./deployment.md)。
