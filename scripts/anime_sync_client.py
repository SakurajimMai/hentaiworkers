#!/usr/bin/env python3
"""
AnimeStream 数据同步客户端

功能:
1. 批量导入动漫数据
2. 批量导入标签数据
3. 关联动漫和标签
4. 自动重试机制
5. 错误处理

使用示例:
    from anime_sync_client import AnimeSyncClient

    client = AnimeSyncClient(
        api_url="https://anime.ixacg.top",
        api_key="your-secret-key"
    )

    # 同步动漫
    client.sync_animes(animes_data)

    # 同步标签
    client.sync_tags(tags_data)
"""

import requests
import time
import logging
from typing import List, Dict, Optional
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AnimeSyncClient:
    """AnimeStream 数据同步客户端"""

    def __init__(self, api_url: str, api_key: str, batch_size: int = 50):
        """
        初始化客户端

        Args:
            api_url: API 基础 URL (例如: https://anime.ixacg.top)
            api_key: 管理 API 密钥
            batch_size: 批量导入大小
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.batch_size = batch_size
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        })

    def _make_request(self, endpoint: str, data: dict, retry: int = 3) -> Optional[dict]:
        """
        发送请求到 API

        Args:
            endpoint: API 端点
            data: 请求数据
            retry: 重试次数

        Returns:
            响应数据或 None
        """
        url = f"{self.api_url}{endpoint}"

        for attempt in range(retry):
            try:
                response = self.session.post(url, json=data, timeout=30)

                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 401:
                    logger.error("❌ 认证失败! 请检查 API Key")
                    return None
                else:
                    logger.warning(f"⚠️  请求失败 (状态码: {response.status_code}), 尝试 {attempt + 1}/{retry}")
                    logger.warning(f"响应: {response.text}")

            except requests.exceptions.Timeout:
                logger.warning(f"⏱️  请求超时, 尝试 {attempt + 1}/{retry}")
            except requests.exceptions.RequestException as e:
                logger.warning(f"⚠️  请求异常: {e}, 尝试 {attempt + 1}/{retry}")

            if attempt < retry - 1:
                time.sleep(2 ** attempt)  # 指数退避

        logger.error(f"❌ 请求失败,已重试 {retry} 次")
        return None

    def sync_animes(self, animes: List[Dict]) -> bool:
        """
        批量同步动漫数据

        Args:
            animes: 动漫数据列表

        动漫数据格式:
        {
            "title": "动漫标题",
            "titleJapanese": "日文标题",  # 可选
            "titleEnglish": "English Title",  # 可选
            "description": "描述",  # 可选
            "cover": "https://...",  # 可选
            "fanart": "url1,url2,url3",  # 可选,多个用逗号分隔
            "videoUrl": "https://...",
            "viewCount": 0  # 可选
        }

        Returns:
            是否成功
        """
        if not animes:
            logger.warning("⚠️  没有动漫数据需要同步")
            return True

        total = len(animes)
        logger.info(f"📊 开始同步 {total} 条动漫数据...")

        # 批量处理
        for i in range(0, total, self.batch_size):
            batch = animes[i:i + self.batch_size]
            batch_num = i // self.batch_size + 1
            total_batches = (total + self.batch_size - 1) // self.batch_size

            logger.info(f"📦 处理批次 {batch_num}/{total_batches} ({len(batch)} 条)")

            # 添加创建时间
            for anime in batch:
                if 'createdAt' not in anime:
                    anime['createdAt'] = datetime.now().isoformat()

            result = self._make_request('/admin/import', {'animes': batch})

            if result and result.get('success'):
                inserted = result.get('inserted', {}).get('animes', 0)
                logger.info(f"✅ 批次 {batch_num} 成功导入 {inserted} 条动漫")
            else:
                error_msg = result.get('error', '未知错误') if result else '无响应'
                logger.error(f"❌ 批次 {batch_num} 导入失败: {error_msg}")
                return False

            # 避免请求过快
            if i + self.batch_size < total:
                time.sleep(0.5)

        logger.info(f"🎉 所有动漫数据同步完成! 总计: {total} 条")
        return True

    def sync_tags(self, tags: List[Dict]) -> bool:
        """
        批量同步标签数据

        Args:
            tags: 标签数据列表

        标签数据格式:
        {
            "name": "标签名",
            "description": "标签描述"  # 可选
        }

        Returns:
            是否成功
        """
        if not tags:
            logger.warning("⚠️  没有标签数据需要同步")
            return True

        total = len(tags)
        logger.info(f"🏷️  开始同步 {total} 条标签数据...")

        result = self._make_request('/admin/import', {'tags': tags})

        if result and result.get('success'):
            inserted = result.get('inserted', {}).get('tags', 0)
            logger.info(f"✅ 成功导入 {inserted} 条标签")
            return True
        else:
            logger.error("❌ 标签导入失败")
            return False

    def sync_batch(self, animes: List[Dict], tags: List[Dict]) -> bool:
        """
        批量同步动漫和标签

        Args:
            animes: 动漫数据列表
            tags: 标签数据列表

        Returns:
            是否成功
        """
        logger.info("🚀 开始批量同步...")

        # 先同步标签
        if tags:
            if not self.sync_tags(tags):
                return False

        # 再同步动漫
        if animes:
            if not self.sync_animes(animes):
                return False

        logger.info("✨ 批量同步完成!")
        return True


# 使用示例
if __name__ == "__main__":
    # 配置
    API_URL = "https://anime.ixacg.top"
    API_KEY = "your-secret-api-key"  # 从环境变量读取: os.getenv('ADMIN_API_KEY')

    # 创建客户端
    client = AnimeSyncClient(api_url=API_URL, api_key=API_KEY, batch_size=50)

    # 示例数据
    tags_data = [
        {"name": "动作", "description": "动作类动漫"},
        {"name": "冒险", "description": "冒险类动漫"},
        {"name": "喜剧", "description": "喜剧类动漫"},
    ]

    animes_data = [
        {
            "title": "测试动漫 1",
            "titleJapanese": "テスト アニメ 1",
            "titleEnglish": "Test Anime 1",
            "description": "这是一个测试动漫的描述",
            "cover": "https://example.com/cover1.jpg",
            "fanart": "https://example.com/fanart1.jpg,https://example.com/fanart2.jpg",
            "videoUrl": "https://example.com/video1.mp4",
            "viewCount": 100
        },
        {
            "title": "测试动漫 2",
            "titleJapanese": "テスト アニメ 2",
            "titleEnglish": "Test Anime 2",
            "description": "另一个测试动漫",
            "cover": "https://example.com/cover2.jpg",
            "fanart": "https://example.com/fanart3.jpg",
            "videoUrl": "https://example.com/video2.mp4",
            "viewCount": 50
        }
    ]

    # 同步数据
    success = client.sync_batch(animes=animes_data, tags=tags_data)

    if success:
        print("✅ 数据同步成功!")
    else:
        print("❌ 数据同步失败!")
