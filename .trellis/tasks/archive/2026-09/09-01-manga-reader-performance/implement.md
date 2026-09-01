# 实施计划

## Gate 0: Task activation

- [x] 用户审阅并批准 PRD、技术设计与本实施计划。
- [x] `task.py validate` 通过后运行 `task.py start`，再修改运行时代码。

## Phase 1: Reader data and API critical path

- [x] 为 published manga 解析和 reader-data 增加共享服务函数，保持 slug/ID、发布状态和页序语义。
- [x] 让公开章节 route 使用 reader-data，保持 JSON shape 不变，并把浏览统计注册到响应后执行。
- [x] 让 Web metadata/page 使用 request cache 共享 reader-data。
- [x] 添加/更新服务与 route 测试，验证查询结构、numeric fallback、未发布过滤和页序。
- [x] 运行相关 Node tests、typecheck 和 boundary check；失败时在继续前回滚或修复本阶段。

## Phase 2: Web response and image scheduling

- [x] 将阅读路由移动到独立 `(reader)` route group，使用最小 layout，公开 URL 不变。
- [x] 将收藏/身份和广告拆到非阻塞 Suspense 边界；统计不得阻塞核心 reader HTML。
- [x] 重构 `MangaReader`：viewport 与 prefetch observer 分离，当前页只来自真实可见集合。
- [x] 初始关键图单一 high priority；恢复页尽早提升优先级并跳转；匿名不发送云进度。
- [x] 抽出稳定/memo 页面项和回调，保持单页错误隔离、异步解码与现有功能。
- [x] 添加 observer、进度、SSR 属性、恢复边界和错误隔离测试。
- [x] 在生产等价环境用基线条件采集至少 5 次冷缓存 trace，并保留 `/tmp` 可复现脚本。

## Phase 3: Android progressive load and prefetch

- [x] 重构 ViewModel reader load：章节优先发布，复用已有详情/收藏，非关键失败不清空 pages，过期结果不覆盖新章节。
- [x] 让 LazyListState 从恢复页初始化，并处理广告插入后的单次位置校正。
- [x] 以 Telephoto `isImageDisplayed` 触发当前页可读事件；可读后才预取后 2 页。
- [x] 添加每章 URL 去重和 Disposable 生命周期管理，切章/退出取消预取。
- [x] 添加无需 Android runtime 的策略单元测试或现有测试框架覆盖，至少验证窗口、去重、取消和 generation。
- [x] 未运行本地 Gradle；已检查 Kotlin/Compose API 使用。远端 Actions 构建仍待提交后执行。

## Phase 4: Full verification and report

- [x] `npm run test`：241 项通过。
- [x] `npm run typecheck`：通过。
- [x] `npm run lint`：仍仅有既有 `tests/home-carousel.test.ts:108` 错误，无本次新增错误。
- [x] `npm run check:boundaries`：通过。
- [x] `npm run build`：生产等价 Docker 构建通过。
- [x] 对照基线报告 Web 当前图 request start、download end、decode+2RAF、LCP element、首屏请求数与恢复行为。
- [x] 报告 Android 可静态确认的请求/预取变化，以及远端构建和真机 TTIR 是否完成。
- [x] 列出所有已确认/未确认根因、修改文件、测试条件、前后数据和残余问题。

## Phase 5: Trellis finish gate

- [x] 执行两路独立代码检查；修复 MySQL collation slug 回归并重跑相关验证。
- [x] 将 viewport/prefetch、恢复滚动和 Android progressive bootstrap 约束写回 `.trellis/spec/`。
- [x] 向用户给出精确 commit plan 并取得批准后提交；不得包含用户未跟踪的根目录 `design.md`。
- [x] 运行 Trellis finish/archive 流程并记录 session。

## Rollback points

- Phase 1 API shape/权限测试失败：仅回退新 reader-data 接入，不动既有 schema。
- Phase 2 SSR/Suspense 导致功能回归：保留独立 reader layout，先恢复同步附加 UI；核心查询仍可独立使用。
- Phase 3 Android 出现状态竞态：保留去重 scheduler，恢复旧 ReaderContent 组装，直到 generation 测试覆盖完整。
- 不以移除 `/cdn-img`、降低图片质量或禁用进度作为回滚方式。
