#!/usr/bin/env python3
"""
动漫爬虫示例 - 集成 AnimeStream 自动同步

这个示例展示如何将爬虫数据自动同步到 AnimeStream
"""

import os
import time
from anime_sync_client import AnimeSyncClient
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AnimeCrawler:
    """动漫爬虫"""

    def __init__(self):
        # 初始化同步客户端
        api_url = os.getenv('ANIMESTREAM_API_URL', 'https://anime.ixacg.top')
        api_key = os.getenv('ADMIN_API_KEY', 'your-secret-key')

        self.sync_client = AnimeSyncClient(
            api_url=api_url,
            api_key=api_key,
            batch_size=50  # 每批同步 50 条
        )

        self.crawled_animes = []
        self.crawled_tags = set()

    def crawl_anime_list(self, url: str):
        """
        爬取动漫列表

        在这里实现你的爬虫逻辑:
        - 使用 requests/httpx 获取页面
        - 使用 BeautifulSoup/lxml 解析 HTML
        - 或使用 Selenium/Playwright 处理动态页面
        """
        logger.info(f"🕷️  开始爬取: {url}")

        # 示例:模拟爬取数据
        # 实际使用时替换为真实的爬虫代码
        example_animes = [
            {
                "title": "进击的巨人",
                "titleJapanese": "進撃の巨人",
                "titleEnglish": "Attack on Titan",
                "description": "巨人统治的世界,人类为生存而战",
                "cover": "https://example.com/aot_cover.jpg",
                "fanart": "https://example.com/aot_fanart1.jpg,https://example.com/aot_fanart2.jpg",
                "videoUrl": "https://example.com/aot_episode1.mp4",
                "viewCount": 0,
                "tags": ["动作", "冒险", "黑暗奇幻"]
            },
            {
                "title": "鬼灭之刃",
                "titleJapanese": "鬼滅の刃",
                "titleEnglish": "Demon Slayer",
                "description": "炭治郎为拯救妹妹踏上斩鬼之路",
                "cover": "https://example.com/ds_cover.jpg",
                "fanart": "https://example.com/ds_fanart1.jpg",
                "videoUrl": "https://example.com/ds_episode1.mp4",
                "viewCount": 0,
                "tags": ["动作", "冒险", "奇幻"]
            }
        ]

        # 收集动漫和标签
        for anime in example_animes:
            # 提取标签
            if 'tags' in anime:
                self.crawled_tags.update(anime['tags'])
                # 从动漫数据中移除 tags 字段 (API 不需要)
                del anime['tags']

            self.crawled_animes.append(anime)

        logger.info(f"✅ 爬取完成: {len(example_animes)} 条动漫")

    def process_tags(self):
        """处理标签数据"""
        return [
            {"name": tag, "description": f"{tag}类动漫"}
            for tag in self.crawled_tags
        ]

    def run(self):
        """运行爬虫并同步数据"""
        logger.info("🚀 启动动漫爬虫...")

        # 1. 爬取数据
        self.crawl_anime_list("https://example.com/anime-list")

        # 可以爬取多个页面
        # for page in range(1, 10):
        #     self.crawl_anime_list(f"https://example.com/anime-list?page={page}")
        #     time.sleep(1)  # 避免请求过快

        # 2. 准备标签数据
        tags_data = self.process_tags()

        # 3. 同步到 AnimeStream
        logger.info("📤 开始同步数据到 AnimeStream...")
        success = self.sync_client.sync_batch(
            animes=self.crawled_animes,
            tags=tags_data
        )

        if success:
            logger.info(f"🎉 爬虫任务完成!")
            logger.info(f"   - 动漫: {len(self.crawled_animes)} 条")
            logger.info(f"   - 标签: {len(tags_data)} 个")
        else:
            logger.error("❌ 同步失败!")

        return success


def main():
    """主函数"""
    crawler = AnimeCrawler()
    crawler.run()


if __name__ == "__main__":
    # 设置环境变量
    # export ADMIN_API_KEY="your-secret-key"
    # export ANIMESTREAM_API_URL="https://anime.ixacg.top"

    main()
