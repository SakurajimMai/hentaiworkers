#!/usr/bin/env python3
"""
D1 直接写入客户端

使用 Cloudflare D1 REST API 直接向 D1 数据库插入数据。
支持在没有安装 wrangler 的 Linux 服务器上运行。
"""

import os
import requests
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class D1DirectClient:
    """D1 直接写入客户端 - 使用 Cloudflare REST API"""

    def __init__(self, account_id: str, database_id: str, api_token: str):
        """
        初始化客户端

        Args:
            account_id: Cloudflare Account ID
            database_id: D1 数据库 ID
            api_token: Cloudflare API Token (需要 D1 编辑权限)
        """
        self.account_id = account_id
        self.database_id = database_id
        self.api_token = api_token
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}"
        
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        
        logger.info(f"D1DirectClient 初始化: 数据库ID={database_id[:8]}...")

    def _escape_sql_string(self, value) -> str:
        """转义 SQL 字符串"""
        if value is None:
            return "NULL"
        if isinstance(value, bool):
            return "1" if value else "0"
        if isinstance(value, (int, float)):
            return str(value)
        # 转义单引号和换行符
        value = str(value).replace("'", "''").replace("\n", " ").replace("\r", "")
        return f"'{value}'"

    def _execute_sql(self, sql: str) -> bool:
        """执行 D1 SQL 命令"""
        try:
            url = f"{self.base_url}/query"
            payload = {"sql": sql}
            
            logger.debug(f"执行 D1 SQL: {sql[:100]}...")

            response = requests.post(url, headers=self.headers, json=payload, timeout=30)
            result = response.json()

            if not result.get("success", False):
                errors = result.get("errors", [])
                error_msg = errors[0].get("message", "未知错误") if errors else "未知错误"
                
                # 忽略 UNIQUE constraint 错误（重复数据）
                if "UNIQUE constraint failed" in error_msg:
                    logger.debug("数据已存在，跳过")
                    return True
                    
                logger.error(f"D1 执行失败: {error_msg}")
                return False

            logger.debug("D1 SQL 执行成功")
            return True

        except requests.exceptions.Timeout:
            logger.error("D1 请求超时")
            return False
        except Exception as e:
            logger.error(f"D1 执行异常: {e}")
            return False

    def sync_tag(self, tag_name: str, description: str = None) -> bool:
        """同步单个标签到 D1"""
        if not tag_name or not tag_name.strip():
            return True
        
        desc = description or f"{tag_name}类动漫"
        sql = f"INSERT OR IGNORE INTO tags (name, description, created_at) VALUES ({self._escape_sql_string(tag_name)}, {self._escape_sql_string(desc)}, datetime('now'))"
        return self._execute_sql(sql)

    def sync_tags(self, tags: List) -> int:
        """批量同步标签到 D1"""
        if not tags:
            return 0
        
        success_count = 0
        for tag in tags:
            if isinstance(tag, dict):
                tag_name = tag.get('name', '')
            else:
                tag_name = str(tag)
            
            if tag_name and self.sync_tag(tag_name):
                success_count += 1
        
        return success_count

    def _get_next_id(self, table: str) -> int:
        """获取表的下一个 ID"""
        try:
            url = f"{self.base_url}/query"
            sql = f"SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM {table}"
            payload = {"sql": sql}
            
            response = requests.post(url, headers=self.headers, json=payload, timeout=30)
            result = response.json()
            
            if result.get("success") and result.get("result"):
                results = result["result"][0].get("results", [])
                if results:
                    return results[0].get("next_id", 1)
            return 1
        except Exception as e:
            logger.error(f"获取下一个 ID 失败: {e}")
            return 1

    def sync_anime(self, anime_data: Dict) -> bool:
        """同步单条动漫记录到 D1"""
        try:
            # 获取下一个 ID
            next_id = self._get_next_id("animes")
            
            # 提取必要字段
            title = anime_data.get('title', '')
            title_english = anime_data.get('titleEnglish') or anime_data.get('title_english', '')
            title_japanese = anime_data.get('titleJapanese') or anime_data.get('title_japanese', '')
            description = anime_data.get('description', '')
            cover = anime_data.get('cover', '')
            fanart = anime_data.get('fanart', '')
            video_url = anime_data.get('videoUrl') or anime_data.get('video_url', '')
            release_year = anime_data.get('releaseYear') or anime_data.get('release_year')
            release_date = anime_data.get('releaseDate') or anime_data.get('release_date', '')
            view_count = anime_data.get('viewCount') or anime_data.get('view_count', 0)
            favorite_count = anime_data.get('favoriteCount') or anime_data.get('favorite_count', 0)
            category_id = anime_data.get('categoryId') or anime_data.get('category_id')

            # 构建 INSERT SQL（包含 id）
            release_year_val = str(release_year) if release_year else "NULL"
            category_id_val = str(category_id) if category_id else "NULL"
            
            sql = f"INSERT INTO animes (id, title, title_english, title_japanese, description, cover, fanart, video_url, release_year, release_date, view_count, favorite_count, is_active, category_id, created_at) VALUES ({next_id}, {self._escape_sql_string(title)}, {self._escape_sql_string(title_english)}, {self._escape_sql_string(title_japanese)}, {self._escape_sql_string(description)}, {self._escape_sql_string(cover)}, {self._escape_sql_string(fanart)}, {self._escape_sql_string(video_url)}, {release_year_val}, {self._escape_sql_string(release_date)}, {view_count or 0}, {favorite_count or 0}, 1, {category_id_val}, datetime('now'))"

            return self._execute_sql(sql)

        except Exception as e:
            logger.error(f"同步动漫失败: {e}")
            return False

    def sync_animes(self, animes: List[Dict]) -> bool:
        """批量同步动漫到 D1"""
        if not animes:
            return True
        
        all_success = True
        for anime in animes:
            if not self.sync_anime(anime):
                all_success = False
        
        return all_success


# 测试代码
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 从环境变量读取配置
    account_id = os.getenv("CF_ACCOUNT_ID")
    database_id = os.getenv("CF_D1_DATABASE_ID")
    api_token = os.getenv("CF_API_TOKEN")
    
    if not all([account_id, database_id, api_token]):
        print("请设置环境变量: CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN")
        exit(1)
    
    client = D1DirectClient(
        account_id=account_id,
        database_id=database_id,
        api_token=api_token
    )
    
    # 测试同步标签
    print("测试同步标签...")
    success = client.sync_tag("测试标签")
    print(f"标签同步: {'成功' if success else '失败'}")
    
    # 测试同步动漫
    print("\n测试同步动漫...")
    test_anime = {
        "title": "测试动漫",
        "title_japanese": "テスト アニメ",
        "description": "这是一个测试",
        "video_url": "https://example.com/test.mp4",
        "view_count": 100
    }
    success = client.sync_anime(test_anime)
    print(f"动漫同步: {'成功' if success else '失败'}")

