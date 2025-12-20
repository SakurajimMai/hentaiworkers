#!/usr/bin/env python3
"""
动漫数据导入脚本 - 将爬取的数据导入到 Cloudflare D1/MySQL

使用方法:
1. 设置环境变量 ADMIN_API_KEY
2. 运行: python import_to_d1.py
"""

import requests
import json
from datetime import datetime

# 配置
API_URL = "https://anime.ixacg.top/admin/import"
ADMIN_API_KEY = "your-secret-api-key"  # 从环境变量或配置文件读取

def import_animes(animes_data):
    """
    导入动漫数据到 D1

    Args:
        animes_data: 动漫数据列表

    示例数据格式:
    [
        {
            "title": "动漫标题",
            "titleJapanese": "日文标题",
            "titleEnglish": "English Title",
            "description": "描述",
            "cover": "https://...",
            "fanart": "url1,url2,url3",
            "videoUrl": "https://...",
            "viewCount": 0
        }
    ]
    """

    headers = {
        "Authorization": f"Bearer {ADMIN_API_KEY}",
        "Content-Type": "application/json"
    }

    # 添加创建时间
    for anime in animes_data:
        if 'createdAt' not in anime:
            anime['createdAt'] = datetime.now().isoformat()

    payload = {
        "animes": animes_data
    }

    response = requests.post(API_URL, json=payload, headers=headers)

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 成功导入 {result['inserted']['animes']} 条动漫数据")
        return True
    else:
        print(f"❌ 导入失败: {response.status_code}")
        print(response.text)
        return False

def import_tags(tags_data):
    """
    导入标签数据到 D1

    Args:
        tags_data: 标签数据列表

    示例数据格式:
    [
        {
            "name": "标签名",
            "description": "标签描述"
        }
    ]
    """

    headers = {
        "Authorization": f"Bearer {ADMIN_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "tags": tags_data
    }

    response = requests.post(API_URL, json=payload, headers=headers)

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 成功导入 {result['inserted']['tags']} 条标签数据")
        return True
    else:
        print(f"❌ 导入失败: {response.status_code}")
        print(response.text)
        return False

# 示例:从爬虫获取数据
def crawl_and_import():
    """
    你的爬虫逻辑
    """
    # 示例数据
    animes = [
        {
            "title": "测试动漫",
            "titleJapanese": "テスト",
            "titleEnglish": "Test Anime",
            "description": "这是一个测试动漫",
            "cover": "https://example.com/cover.jpg",
            "fanart": "https://example.com/fanart1.jpg,https://example.com/fanart2.jpg",
            "videoUrl": "https://example.com/video.mp4",
            "viewCount": 0
        }
    ]

    tags = [
        {"name": "动作", "description": "动作类动漫"},
        {"name": "冒险", "description": "冒险类动漫"}
    ]

    # 导入数据
    import_tags(tags)
    import_animes(animes)

if __name__ == "__main__":
    print("🚀 开始导入数据到 D1...")
    crawl_and_import()
    print("✨ 导入完成!")
