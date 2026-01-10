# Production Crawler 更新说明

## 🎯 更新内容

### 1. ✅ D1 直接写入功能 (2026 年 1 月更新)

爬虫现在使用 **wrangler CLI 直接写入** D1 数据库，与 MySQL 并行存储。

**改进:**

- ❌ 不再使用 API 接口同步（之前有冲突问题）
- ✅ 使用 `wrangler d1 execute` 直接写入
- ✅ 数据格式与 MySQL 完全一致
- ✅ 无需 API Key，只需配置数据库名称

### 2. ✅ 早期过滤优化

**问题:** 之前包含"中字後補"的视频仍然被爬取

**修复:** 在获取视频列表时就进行过滤,避免浪费资源

## 📝 配置方法

### 1. 复制配置文件模板

```bash
cd scripts
cp production_config.yml.example production_config.yml
```

### 2. 编辑配置文件

编辑 `production_config.yml`,配置以下关键部分:

#### 2.1 爬取目标配置

```yaml
crawl:
  date_filter:
    year: [2025, 2026] # 要爬取的年份
    month: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] # 要爬取的月份

  skip_keywords: # 过滤关键词
    - "中字後補"
    - "简中补字"
    - "Chinese Sub"
    - "中文字幕後補"
```

#### 2.2 数据库配置

```yaml
database:
  host: "your-mysql-host:3306"
  user: "your-mysql-user"
  password: "your-mysql-password"
  database: "your-database-name"
```

#### 2.3 启用 D1 直接写入

```yaml
d1_sync:
  enabled: true # 启用 D1 直接写入
  database_name: "anime-db" # D1 数据库名称（wrangler.toml 中定义的）
  # working_dir: 可选，wrangler 命令的工作目录，默认为项目根目录
```

> **注意:** 不再需要 `api_url` 和 `api_key` 配置

#### 2.4 下载路径配置

```yaml
download:
  download_dir: "downloads" # 下载根目录
  organize_by_date: true # 按年/月组织

web_access:
  domain_prefix: "https://static.hxsl.org" # 静态文件域名
```

## 🚀 运行爬虫

```bash
cd scripts

# 使用默认配置文件
python production_crawler.py

# 指定自定义配置文件
python production_crawler.py my_custom_config.yml
```

## 📊 日志输出示例

```
=== Hanime1.me 正式爬取系统 ===
配置文件: production_config.yml
启动时间: 2026-01-09 21:00:00
==================================================

2026-01-09 21:00:01 - ProductionCrawler - INFO - ✅ D1 直接写入已启用: 数据库=anime-db
2026-01-09 21:00:02 - ProductionCrawler - INFO - 📅 开始处理 2025年12月 (1/12)
2026-01-09 21:00:03 - ProductionCrawler - INFO - 找到 15 个原始视频链接
2026-01-09 21:00:03 - ProductionCrawler - INFO - ⛔ 早期过滤(包含屏蔽词): [中字後補] 狩獵雌性的村莊 1
2026-01-09 21:00:03 - ProductionCrawler - INFO - 过滤后剩余 14 个视频链接

2026-01-09 21:00:04 - ProductionCrawler - INFO - 🎬 [1/14] 处理视频: https://...
2026-01-09 21:00:05 - ProductionCrawler - INFO - 视频标题: OVA ケガレボシ・赤
2026-01-09 21:00:06 - ProductionCrawler - INFO - ✅ MySQL 数据库保存成功
2026-01-09 21:00:07 - ProductionCrawler - INFO - 🔄 开始写入 D1...
2026-01-09 21:00:08 - ProductionCrawler - INFO - ✅ D1 写入成功

============================================================
📊 爬取完成统计
============================================================
总耗时: 01:30:45
总视频数: 168
成功下载: 165
下载失败: 3
跳过视频: 12
总剧照数: 1320
总标签数: 456
D1 同步成功: 165
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
npx wrangler d1 execute anime-db --command "SELECT COUNT(*) FROM animes"
```

### 方法 3: 查看最新数据

```bash
npx wrangler d1 execute anime-db --command "SELECT id, title FROM animes ORDER BY id DESC LIMIT 5"
```

## ⚙️ 高级配置

### 禁用 D1 同步

只同步到 MySQL:

```yaml
d1_sync:
  enabled: false
```

### Web 访问路径配置

配置静态文件的访问域名:

```yaml
web_access:
  domain_prefix: "https://static.hxsl.org" # 你的静态文件域名
  base_path: "" # 可选的基础路径
```

## 🐛 故障排查

### 1. D1 写入失败

**检查项:**

- ✅ `database_name` 是否与 wrangler.toml 中一致
- ✅ D1 数据库是否已创建表结构
- ✅ wrangler 是否已登录 (`npx wrangler login`)

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

### 3. wrangler 命令失败

**检查项:**

- ✅ 确保在 anime-web 目录下有 wrangler.toml
- ✅ 运行 `npx wrangler d1 list` 确认数据库存在

## 📚 相关文件

- `production_crawler.py` - 主爬虫脚本
- `d1_direct_client.py` - D1 直接写入客户端 (使用 wrangler CLI)
- `unified_crawler.py` - 统一爬虫基类
- `production_config.yml` - 配置文件
- `production_config.yml.example` - 配置文件模板

## 🎉 功能总结

现在你的爬虫支持:

1. ✅ 同时写入 MySQL + D1 双数据库
2. ✅ 使用 wrangler CLI 直接写入 D1（无需 API）
3. ✅ 早期过滤包含屏蔽词的视频
4. ✅ 详细的同步统计信息
5. ✅ 灵活的配置选项

开始爬取吧! 🚀
