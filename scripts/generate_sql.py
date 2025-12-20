#!/usr/bin/env python3
"""
生成 SQL 导入文件 - 将爬取的数据转换为 SQL 语句

使用方法:
1. 修改 animes_data 为你的爬虫数据
2. 运行: python generate_sql.py
3. 生成的 SQL 文件: import_data.sql
4. 执行: wrangler d1 execute hentai --remote --file=import_data.sql
"""

import json
from datetime import datetime

def escape_sql_string(s):
    """转义 SQL 字符串中的特殊字符"""
    if s is None:
        return ''
    return str(s).replace("'", "''").replace('\n', '\\n').replace('\r', '')

def generate_anime_insert(anime):
    """生成单条动漫插入语句"""
    title = escape_sql_string(anime.get('title', ''))
    title_jp = escape_sql_string(anime.get('titleJapanese', ''))
    title_en = escape_sql_string(anime.get('titleEnglish', ''))
    desc = escape_sql_string(anime.get('description', ''))
    cover = escape_sql_string(anime.get('cover', ''))
    fanart = escape_sql_string(anime.get('fanart', ''))
    video = escape_sql_string(anime.get('videoUrl', ''))
    views = anime.get('viewCount', 0)

    sql = f"""INSERT INTO animes (title, title_japanese, title_english, description, cover, fanart, video_url, view_count, created_at)
VALUES ('{title}', '{title_jp}', '{title_en}', '{desc}', '{cover}', '{fanart}', '{video}', {views}, datetime('now'));"""

    return sql

def generate_tag_insert(tag):
    """生成单条标签插入语句"""
    name = escape_sql_string(tag.get('name', ''))
    desc = escape_sql_string(tag.get('description', ''))

    sql = f"""INSERT INTO tags (name, description) VALUES ('{name}', '{desc}');"""
    return sql

def generate_anime_tag_insert(anime_id, tag_id):
    """生成动漫-标签关联插入语句"""
    return f"INSERT INTO anime_tags (anime_id, tag_id) VALUES ({anime_id}, {tag_id});"

def main():
    """
    主函数 - 从你的爬虫获取数据并生成 SQL
    """

    # 示例数据 - 替换为你的爬虫数据
    animes_data = [
        {
            "title": "测试动漫 1",
            "titleJapanese": "テスト アニメ 1",
            "titleEnglish": "Test Anime 1",
            "description": "这是第一个测试动漫的描述",
            "cover": "https://example.com/cover1.jpg",
            "fanart": "https://example.com/fanart1.jpg,https://example.com/fanart2.jpg",
            "videoUrl": "https://example.com/video1.mp4",
            "viewCount": 100,
            "tags": ["动作", "冒险"]
        },
        {
            "title": "测试动漫 2",
            "titleJapanese": "テスト アニメ 2",
            "titleEnglish": "Test Anime 2",
            "description": "这是第二个测试动漫的描述",
            "cover": "https://example.com/cover2.jpg",
            "fanart": "https://example.com/fanart3.jpg",
            "videoUrl": "https://example.com/video2.mp4",
            "viewCount": 50,
            "tags": ["喜剧"]
        }
    ]

    # 收集所有唯一标签
    all_tags = set()
    for anime in animes_data:
        if 'tags' in anime:
            all_tags.update(anime['tags'])

    # 生成 SQL 文件
    with open('import_data.sql', 'w', encoding='utf-8') as f:
        f.write("-- Anime Database Import Script\n")
        f.write(f"-- Generated at: {datetime.now().isoformat()}\n\n")

        # 1. 插入标签
        f.write("-- Insert Tags\n")
        tag_map = {}
        for idx, tag_name in enumerate(sorted(all_tags), start=1):
            tag_map[tag_name] = idx
            f.write(generate_tag_insert({"name": tag_name, "description": f"{tag_name}类动漫"}) + "\n")

        f.write("\n")

        # 2. 插入动漫
        f.write("-- Insert Animes\n")
        for idx, anime in enumerate(animes_data, start=1):
            f.write(generate_anime_insert(anime) + "\n")

        f.write("\n")

        # 3. 插入动漫-标签关联
        f.write("-- Insert Anime-Tag Relations\n")
        for anime_id, anime in enumerate(animes_data, start=1):
            if 'tags' in anime:
                for tag_name in anime['tags']:
                    tag_id = tag_map[tag_name]
                    f.write(generate_anime_tag_insert(anime_id, tag_id) + "\n")

    print(f"✅ SQL 文件已生成: import_data.sql")
    print(f"📊 统计:")
    print(f"  - 动漫数量: {len(animes_data)}")
    print(f"  - 标签数量: {len(all_tags)}")
    print(f"\n🚀 执行导入命令:")
    print(f"  本地测试: wrangler d1 execute hentai --local --file=import_data.sql")
    print(f"  生产环境: wrangler d1 execute hentai --remote --file=import_data.sql")

if __name__ == "__main__":
    main()
