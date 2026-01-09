#!/usr/bin/env python3
"""
从 MySQL 读取指定的动漫数据并同步到 D1

用于修复 D1 同步失败的记录
"""

import os
import sys
import yaml
import pymysql
import logging
from anime_sync_client import AnimeSyncClient

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('SyncFailedToD1')


def load_config(config_file="production_config.yml"):
    """加载配置文件"""
    if not os.path.exists(config_file):
        logger.error(f"配置文件不存在: {config_file}")
        return None
    
    with open(config_file, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def get_db_connection(config):
    """获取数据库连接"""
    db_config = config.get('database', {})
    try:
        # 解析 host:port 格式
        host = db_config.get('host', 'localhost')
        port = 3306
        if ':' in host:
            host, port = host.rsplit(':', 1)
            port = int(port)
        
        connection = pymysql.connect(
            host=host,
            port=port,
            user=db_config.get('user'),
            password=db_config.get('password'),
            database=db_config.get('database'),
            charset=db_config.get('charset', 'utf8mb4'),
            cursorclass=pymysql.cursors.DictCursor
        )
        return connection
    except Exception as e:
        logger.error(f"数据库连接失败: {e}")
        return None


def get_animes_by_titles(connection, titles):
    """根据标题列表获取动漫数据"""
    if not titles:
        return []
    
    try:
        cursor = connection.cursor()
        
        # 构建 IN 查询
        placeholders = ', '.join(['%s'] * len(titles))
        sql = f"""
        SELECT 
            id, title, title_english, title_japanese, 
            description, cover, fanart, video_url, 
            release_year, release_date, view_count
        FROM animes 
        WHERE title_japanese IN ({placeholders})
           OR title IN ({placeholders})
        """
        
        # 参数需要两倍长度（title_japanese 和 title 各匹配一次）
        cursor.execute(sql, titles + titles)
        results = cursor.fetchall()
        
        logger.info(f"从数据库查询到 {len(results)} 条记录")
        return results
        
    except Exception as e:
        logger.error(f"查询失败: {e}")
        return []


def get_anime_tags(connection, anime_id):
    """获取动漫关联的标签"""
    try:
        cursor = connection.cursor()
        sql = """
        SELECT t.name 
        FROM tags t
        JOIN anime_tags at ON t.id = at.tag_id
        WHERE at.anime_id = %s
        """
        cursor.execute(sql, (anime_id,))
        results = cursor.fetchall()
        return [r['name'] for r in results]
    except Exception as e:
        logger.error(f"获取标签失败: {e}")
        return []


def convert_to_d1_format(anime_record, tags):
    """将 MySQL 记录转换为 D1 API 格式"""
    return {
        "title": anime_record.get('title', ''),
        "titleJapanese": anime_record.get('title_japanese', ''),
        "titleEnglish": anime_record.get('title_english', ''),
        "description": anime_record.get('description', ''),
        "cover": anime_record.get('cover', ''),
        "fanart": anime_record.get('fanart', ''),
        "videoUrl": anime_record.get('video_url', ''),
        "viewCount": anime_record.get('view_count', 0),
        "tags": tags  # 标签列表
    }


def main():
    """主函数"""
    # 失败的三条视频标题（日文原标题）
    failed_titles = [
        "OVA ケガレボシ・赤",
        "OVA ケガレボシ・青", 
        "入り浸りギャルにま〇こ使わせて貰う話＃3"
    ]
    
    logger.info("=" * 50)
    logger.info("🔄 开始同步失败的动漫数据到 D1")
    logger.info("=" * 50)
    logger.info(f"待同步标题: {failed_titles}")
    
    # 1. 加载配置
    config = load_config()
    if not config:
        sys.exit(1)
    
    # 2. 初始化 D1 客户端
    d1_config = config.get('d1_sync', {})
    if not d1_config.get('enabled', False):
        logger.error("D1 同步未启用，请检查配置")
        sys.exit(1)
    
    api_url = d1_config.get('api_url', 'https://anime.ixacg.top')
    api_key = d1_config.get('api_key') or os.getenv('ADMIN_API_KEY')
    
    if not api_key:
        logger.error("未找到 API Key，请设置环境变量 ADMIN_API_KEY 或在配置文件中指定")
        sys.exit(1)
    
    d1_client = AnimeSyncClient(
        api_url=api_url,
        api_key=api_key,
        batch_size=1  # 逐条同步
    )
    logger.info(f"✅ D1 客户端已初始化: {api_url}")
    
    # 3. 连接 MySQL
    connection = get_db_connection(config)
    if not connection:
        sys.exit(1)
    logger.info("✅ MySQL 连接成功")
    
    try:
        # 4. 查询失败的动漫数据
        animes = get_animes_by_titles(connection, failed_titles)
        
        if not animes:
            logger.warning("未找到任何匹配的动漫记录，尝试模糊搜索...")
            
            # 尝试模糊搜索
            cursor = connection.cursor()
            for title in failed_titles:
                cursor.execute(
                    "SELECT id, title, title_japanese FROM animes WHERE title_japanese LIKE %s OR title LIKE %s",
                    (f"%{title}%", f"%{title}%")
                )
                results = cursor.fetchall()
                if results:
                    logger.info(f"模糊匹配 '{title}': {results}")
            
            sys.exit(1)
        
        # 5. 逐条同步到 D1
        success_count = 0
        failed_count = 0
        
        for anime in animes:
            logger.info(f"\n📺 处理: {anime.get('title_japanese') or anime.get('title')}")
            
            # 获取标签（仅用于日志记录，不再同步标签以避免冲突）
            tags = get_anime_tags(connection, anime['id'])
            logger.info(f"   标签: {tags}")
            
            # 转换格式
            d1_data = convert_to_d1_format(anime, tags)
            
            # 同步标签（API 已使用 onConflictDoNothing，重复会被忽略）
            if tags:
                tags_data = [{"name": tag, "description": f"{tag}类动漫"} for tag in tags]
                d1_client.sync_tags(tags_data)
            
            # 同步动漫
            try:
                success = d1_client.sync_animes([d1_data])
                
                if success:
                    success_count += 1
                    logger.info(f"   ✅ 同步成功!")
                else:
                    failed_count += 1
                    logger.error(f"   ❌ 同步失败!")
                    
            except Exception as e:
                failed_count += 1
                logger.error(f"   ❌ 同步异常: {e}")
        
        # 6. 打印统计
        logger.info("\n" + "=" * 50)
        logger.info("📊 同步完成统计")
        logger.info("=" * 50)
        logger.info(f"成功: {success_count}")
        logger.info(f"失败: {failed_count}")
        logger.info(f"总计: {len(animes)}")
        
    finally:
        connection.close()
        logger.info("✅ 数据库连接已关闭")


if __name__ == "__main__":
    main()
