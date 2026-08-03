# 后台管理手册

后台地址为 `/admin`，登录页为 `/admin/login`。仅 `role=admin` 且 `is_active=1` 的用户可以访问。

## 1. 首次登录

在 `.env` 显式设置 `ADMIN_BOOTSTRAP_USER` 和至少 12 位的 `ADMIN_BOOTSTRAP_PASSWORD`，运行：

```bash
npm run seed:admin
```

项目不提供默认账号或密码。首次登录后应立即在 `/admin/account` 修改密码。

## 2. 功能导航

| 菜单 | 路径 | 能力 |
|------|------|------|
| 概览 | `/admin` | 里番、上架、标签和用户统计 |
| 里番 | `/admin/animes` | 搜索、上下架、批量操作、删除和编辑 |
| 标签 | `/admin/tags` | 标签创建、编辑和删除 |
| 导入 | `/admin/import` | JSON 批量创建或更新作品 |
| 用户 | `/admin/users` | 创建、改角色、启停和重置密码 |
| 系统 | `/admin/settings` | 注册、SMTP、Trust、Turnstile 与播放器 |
| 账户 | `/admin/account` | 修改当前管理员密码 |

## 3. 里番管理

列表支持标题搜索、上下架、批量操作和删除。编辑页支持主标题、日文/英文标题、视频 URL、封面 URL、剧照、简介、标签和上架状态。

保存后会刷新相关页面缓存。删除会同时清理作品的标签关联，且不可恢复。

## 4. 标签管理

标签字典对应 `tags`，作品关系对应 `anime_tags`。

- 名称必填且必须唯一。
- 修改后使用行内保存。
- 仍有关联作品的标签不能删除，应先解除关联。

## 5. JSON 导入

`/admin/import` 接收 JSON 数组：

```json
[
  {
    "id": 100,
    "title": "作品标题",
    "videoUrl": "https://media.example/video.mp4",
    "titleJapanese": "タイトル",
    "description": "简介",
    "cover": "https://media.example/cover.jpg",
    "fanart": "https://media.example/a.jpg,https://media.example/b.jpg",
    "tags": ["标签A", "标签B"],
    "isActive": 1
  }
]
```

`title` 与 `videoUrl` 必填。已存在的 `id` 会更新，否则创建新记录；不存在的标签会按名称创建。

## 6. 用户与账号

管理员可以创建用户、修改 `admin`/`user` 角色、启停账号和重置密码。停用账号或修改密码会使原有会话失效。

前台账号能力包括邮箱注册、验证、密码找回、片单、收藏和观看进度。邮箱验证和找回密码依赖已启用的 SMTP。

## 7. 系统设置

`/admin/settings` 包含：

- 注册开关、邮箱验证与邮箱白名单
- SMTP 主机、TLS、账号和发件人
- 登录/注册 Turnstile 策略
- 验证链接有效期
- ArtPlayer 主题、右键和广告素材

SMTP 密码与 Turnstile Secret 使用应用密钥环加密存库。密钥输入框留空表示保留现值。启用邮箱验证前必须先配置并启用 SMTP。

播放器素材 URL 必须能被用户浏览器直接访问，主站不代理视频或图片。
