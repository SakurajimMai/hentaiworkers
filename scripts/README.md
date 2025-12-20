# Python 爬虫自动同步脚本

将爬取的动漫数据自动同步到 AnimeStream D1 数据库。

## 📁 文件说明

- **`anime_sync_client.py`** - 同步客户端库
- **`crawler_example.py`** - 爬虫集成示例
- **`generate_sql.py`** - SQL 生成工具
- **`import_to_d1.py`** - 直接 API 导入

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install requests
```

### 2. 配置环境变量

```bash
# Linux/Mac
export ADMIN_API_KEY="your-secret-api-key"
export ANIMESTREAM_API_URL="https://anime.ixacg.top"

# Windows
set ADMIN_API_KEY=your-secret-api-key
set ANIMESTREAM_API_URL=https://anime.ixacg.top
```

### 3. 在 Cloudflare 设置 API Key

1. 进入 Cloudflare Pages 项目设置
2. **Settings** → **Environment variables**
3. 在 **Production** 和 **Preview** 环境添加:
   ```
   ADMIN_API_KEY = "生成一个强密码"
   ```

### 4. 运行爬虫

```bash
python crawler_example.py
```

## 💻 在你的爬虫中使用

### 基础用法

```python
from anime_sync_client import AnimeSyncClient

# 初始化客户端
client = AnimeSyncClient(
    api_url="https://anime.ixacg.top",
    api_key="your-secret-key",
    batch_size=50  # 每批 50 条
)

# 准备数据
animes = [
    {
        "title": "动漫标题",
        "titleJapanese": "日文标题",  # 可选
        "titleEnglish": "English Title",  # 可选
        "description": "描述",  # 可选
        "cover": "https://...",  # 可选
        "fanart": "url1,url2,url3",  # 可选,多个用逗号分隔
        "videoUrl": "https://...",  # 必填
        "viewCount": 0  # 可选
    }
]

tags = [
    {"name": "动作", "description": "动作类动漫"},
    {"name": "冒险", "description": "冒险类动漫"}
]

# 同步数据
client.sync_batch(animes=animes, tags=tags)
```

### 完整爬虫示例

```python
import requests
from bs4 import BeautifulSoup
from anime_sync_client import AnimeSyncClient

class MyAnimeCrawler:
    def __init__(self):
        self.client = AnimeSyncClient(
            api_url="https://anime.ixacg.top",
            api_key="your-key"
        )
        self.animes = []

    def crawl_page(self, url):
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')

        # 解析页面,提取动漫信息
        for item in soup.select('.anime-item'):
            anime = {
                "title": item.select_one('.title').text,
                "cover": item.select_one('img')['src'],
                "videoUrl": item.select_one('a')['href'],
                "description": item.select_one('.desc').text,
                "viewCount": 0
            }
            self.animes.append(anime)

    def run(self):
        # 爬取多个页面
        for page in range(1, 10):
            self.crawl_page(f"https://example.com/list?page={page}")
            time.sleep(1)

        # 同步到数据库
        self.client.sync_animes(self.animes)

# 运行爬虫
crawler = MyAnimeCrawler()
crawler.run()
```

## 📊 数据格式

### 动漫数据 (Anime)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | ✅ | 动漫标题 |
| titleJapanese | string | ❌ | 日文标题 |
| titleEnglish | string | ❌ | 英文标题 |
| description | string | ❌ | 描述 |
| cover | string | ❌ | 封面图片 URL |
| fanart | string | ❌ | 多个图片 URL,用逗号分隔 |
| videoUrl | string | ✅ | 视频 URL |
| viewCount | number | ❌ | 观看次数,默认 0 |

### 标签数据 (Tag)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 标签名称 |
| description | string | ❌ | 标签描述 |

## 🔧 高级功能

### 批量大小配置

```python
client = AnimeSyncClient(
    api_url="https://anime.ixacg.top",
    api_key="your-key",
    batch_size=100  # 每批 100 条 (默认 50)
)
```

### 错误处理

```python
try:
    success = client.sync_animes(animes)
    if success:
        print("同步成功!")
    else:
        print("同步失败!")
except Exception as e:
    print(f"错误: {e}")
```

### 只同步动漫

```python
client.sync_animes(animes)
```

### 只同步标签

```python
client.sync_tags(tags)
```

### 日志配置

```python
import logging

# 设置详细日志
logging.basicConfig(level=logging.DEBUG)

# 或只显示错误
logging.basicConfig(level=logging.ERROR)
```

## 🛡️ 安全建议

1. ⚠️ **永远不要将 API Key 硬编码在代码中**
2. ✅ 使用环境变量存储密钥
3. ✅ 在 `.gitignore` 中忽略配置文件
4. ✅ 定期更换 API Key
5. ✅ 为不同环境使用不同的 Key (开发/生产)

## 📝 示例: 定时任务

使用 cron 定时运行爬虫:

```bash
# 每天凌晨 2 点运行
0 2 * * * cd /path/to/scripts && python crawler_example.py >> /var/log/crawler.log 2>&1
```

## 🐛 常见问题

### 1. 401 Unauthorized

**原因**: API Key 不正确

**解决**:
- 检查环境变量 `ADMIN_API_KEY`
- 确认 Cloudflare Dashboard 中配置了相同的 Key

### 2. 连接超时

**原因**: 网络问题或 API 响应慢

**解决**:
- 客户端自动重试 3 次
- 检查网络连接
- 减小 `batch_size`

### 3. 数据格式错误

**原因**: 必填字段缺失

**解决**:
- 确保 `title` 和 `videoUrl` 必填
- 检查字段名拼写 (驼峰命名)

## 📧 支持

如有问题,请提交 Issue: https://github.com/yourusername/anime-web/issues
