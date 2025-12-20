# Production Crawler 更新说明

## 🎯 更新内容

### 1. ✅ D1 自动同步功能

爬虫现在支持自动将数据同步到 Cloudflare D1,与 MySQL 并行存储。

**功能:**
- 实时同步动漫数据到 D1
- 自动同步标签数据
- 独立的成功/失败统计
- 可配置开关

### 2. ✅ 早期过滤优化

**问题:** 之前包含"中字後補"的视频仍然被爬取

**修复:** 在获取视频列表时就进行过滤,避免浪费资源

**过滤位置:**
- **之前**: 在下载视频详情后 (第328行)
- **现在**: 在获取视频列表时 (第277-310行)

**效果:**
- 更早发现并跳过
- 节省网络请求
- 提升爬取效率

## 📝 配置方法

### 1. 复制配置文件模板

```bash
cd scripts
cp production_config.yml.example production_config.yml
```

### 2. 启用 D1 同步

编辑 `production_config.yml`:

```yaml
# D1 同步配置
d1_sync:
  enabled: true  # 启用 D1 同步
  api_url: https://anime.ixacg.top
  batch_size: 1  # 实时同步,每次 1 条
```

### 3. 设置 API Key

**方法 1: 环境变量 (推荐)**

```bash
export ADMIN_API_KEY="your-secret-key"
python production_crawler.py
```

**方法 2: 配置文件**

```yaml
d1_sync:
  enabled: true
  api_url: https://anime.ixacg.top
  api_key: your-secret-key  # 不推荐,容易泄露
```

### 4. 配置过滤规则

确保配置文件中包含:

```yaml
filter:
  skip_keywords:
    - 中字後補  # 过滤中字後補
    - 無修正    # 其他需要过滤的关键词
    - 测试
```

## 🚀 运行爬虫

```bash
cd scripts

# 使用默认配置
python production_crawler.py

# 使用指定配置
python production_crawler.py my_config.yml

# 设置 API Key 后运行
export ADMIN_API_KEY="sk_live_abc123"
python production_crawler.py
```

## 📊 日志输出示例

```
=== Hanime1.me 正式爬取系统 ===
配置文件: production_config.yml
启动时间: 2025-12-19 21:00:00
==================================================

2025-12-19 21:00:01 - ProductionCrawler - INFO - 📅 开始处理 2025年10月 (1/12)
2025-12-19 21:00:02 - ProductionCrawler - INFO - 找到 15 个原始视频链接
2025-12-19 21:00:03 - ProductionCrawler - INFO - ⛔ 早期过滤(包含屏蔽词): [中字後補] 狩獵雌性的村莊 1
2025-12-19 21:00:03 - ProductionCrawler - INFO - 过滤后剩余 14 个视频链接

2025-12-19 21:00:04 - ProductionCrawler - INFO - 🎬 [1/14] 处理视频: https://...
2025-12-19 21:00:05 - ProductionCrawler - INFO - 视频标题: 动漫标题
2025-12-19 21:00:06 - ProductionCrawler - INFO - ✅ MySQL 数据库保存成功
2025-12-19 21:00:07 - ProductionCrawler - INFO - 🔄 开始同步到 D1...
2025-12-19 21:00:08 - ProductionCrawler - INFO - ✅ D1 同步成功

============================================================
📊 爬取完成统计
============================================================
总耗时: 01:30:45
总视频数: 168
成功下载: 165
下载失败: 3
跳过视频: 12  ← 早期过滤的视频
总剧照数: 1320
总标签数: 456
D1 同步成功: 165  ← 新增统计
D1 同步失败: 0
成功率: 98.2%
============================================================
```

## 🔍 验证 D1 数据

### 方法 1: 访问网站

```
https://anime.ixacg.top
```

检查新爬取的动漫是否出现

### 方法 2: 查询 D1 数据库

```bash
wrangler d1 execute hentai --remote --command "SELECT COUNT(*) FROM animes"
```

### 方法 3: 查看 API 健康检查

```bash
curl https://anime.ixacg.top/api/health
```

## ⚙️ 高级配置

### 批量同步模式

如果不需要实时同步,可以调整批量大小:

```yaml
d1_sync:
  enabled: true
  api_url: https://anime.ixacg.top
  batch_size: 50  # 每 50 条同步一次
```

### 禁用 D1 同步

只同步到 MySQL:

```yaml
d1_sync:
  enabled: false
```

### 同时使用 D1 和 Hyperdrive

在 Cloudflare Dashboard 配置环境变量:

```
DB_TYPE = "d1"  # 或 "hyperdrive"
```

爬虫会根据配置自动选择数据库。

## 🐛 故障排查

### 1. D1 同步失败

**检查项:**
- ✅ API Key 是否正确
- ✅ API 端点是否可访问
- ✅ Cloudflare Functions 是否部署
- ✅ ADMIN_API_KEY 环境变量是否设置

**查看详细错误:**

```bash
# 设置 DEBUG 日志级别
# 编辑 production_config.yml
logging:
  level: DEBUG
```

### 2. 过滤不生效

**检查项:**
- ✅ `skip_keywords` 配置是否正确
- ✅ 关键词大小写是否匹配
- ✅ unified_crawler.py 中 `should_skip()` 方法

### 3. 视频仍然被爬取

**原因:** HTML 结构变化,无法提取标题

**解决:** 查看日志中的 "早期过滤" 信息,确认是否成功提取标题

## 📚 相关文件

- `production_crawler.py` - 主爬虫脚本
- `anime_sync_client.py` - D1 同步客户端
- `unified_crawler.py` - 统一爬虫基类
- `production_config.yml` - 配置文件
- `functions/admin/import.js` - API 导入端点

## 🎉 升级完成

现在你的爬虫支持:
1. ✅ 自动同步 MySQL + D1 双数据库
2. ✅ 早期过滤包含"中字後補"的视频
3. ✅ 详细的同步统计信息
4. ✅ 灵活的配置选项

开始爬取吧! 🚀
