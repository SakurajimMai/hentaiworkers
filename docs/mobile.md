# 移动端

`mobile/` 是独立的 Expo 54 / React Native 客户端，只读主站公开 API，不进 Docker 镜像。

独立 APK 必须带上 `react-native-gesture-handler` 和 `react-native-reanimated`（expo-router 的 peer 依赖）。Expo Go 里自带这两包，缺了它们时开发正常、安装 APK 会一打开就闪退。

里番走 `/api/animes*`，漫画走 `/api/mangas*`。未登录时收藏和历史存在本机；登录后走 `/api/me/favorites`、`/api/me/watch-progress` 和 `/api/me/manga-progress`，与网页账号互通。

## 1. 本地开发

要求 Node.js 22+。

```bash
cd mobile
cp .env.example .env
npm ci
npx expo start
```

`.env` 或 `app.json` 的 `expo.extra.apiBaseUrl` 必须是绝对 HTTP(S) 源，不能带路径或查询串。生产默认是 `https://www.ixacg.de`。

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://www.ixacg.de
```

| 底栏 | 作用 |
|------|------|
| 首页 | 热门里番，以及漫画横滑入口 |
| 发现 | 里番搜索与标签筛选 |
| 漫画 | 搜索、日/周/月/总榜、标签筛选 |
| 历史 | 里番观看与漫画阅读记录（登录后与网页同步） |
| 收藏 | 里番与漫画收藏（登录后与网页同步） |
| 我的 | 网站账号登录 / 退出 |

发现页和漫画页是瀑布流无限加载（上滑加载更多），不再翻页。

详情在 `/manga-detail/{id}`，阅读在 `/manga-reader/{id}/{chapter}`。阅读页为条漫连续滚动，底部可拖进度条，双指只能放大、松手还原到原尺寸。

登录走 `POST /api/auth/login`（JSON），会话 cookie 存在本机并随请求带上。

不要在开发机执行 `expo prebuild` 或 `assembleRelease`。打包只走 GitHub Actions。

## 2. GitHub Actions 打 APK

工作流：[`.github/workflows/build-android.yml`](../.github/workflows/build-android.yml)

触发条件：

- 推送到 `main`，且改动了 `mobile/` 或该工作流文件
- 在 GitHub Actions 里手动 **Run workflow**

流程：`npm ci` → `expo prebuild --platform android` → `gradlew assembleRelease` → 上传 Artifact → 创建预发布 Release `build-<run_number>`。

产物命名：

| 文件 | 适用 |
|------|------|
| `AnimeStream-<n>-arm64-v8a.apk` | 多数现代手机（优先） |
| `AnimeStream-<n>-armeabi-v7a.apk` | 旧 32 位机 |
| `AnimeStream-<n>-x86_64.apk` / `x86` | 模拟器 |
| `AnimeStream-<n>-universal.apk` | 通吃，体积最大 |

Release 页上的资源链接可以直接填进后台「移动端下载」。页脚「浏览」栏只在地址为 `http://` 或 `https://` 时显示。

未配置签名密钥时，Release 使用 Expo 默认的 debug 签名，仅供站内分发，不能上架 Play。若要固定签名，在仓库 Secrets 中配置：

| Secret | 说明 |
|--------|------|
| `ANDROID_KEYSTORE_BASE64` | `release.keystore` 的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | 仓库密码 |
| `ANDROID_KEY_ALIAS` | 别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

`contents: write` 已在工作流里声明，默认 `GITHUB_TOKEN` 即可创建 Release。

## 3. 发布后

1. 打开最新 `build-*` Release，复制 `universal` 或 `arm64-v8a` APK 的地址。
2. 后台 **系统设置 → 移动端下载** 填入地址和链接文字（默认「下载 App」）。
3. 打开前台页脚「浏览」，确认外链可下载。

应用包名为 `de.ixacg.animestream`。`versionCode` 在 CI 里写成 GitHub run number，方便覆盖安装。
