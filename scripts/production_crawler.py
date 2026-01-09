#!/usr/bin/env python3
"""
Hanime1.me 正式爬取脚本
统一爬虫系统 - 生产环境版本

功能特性:
- 完整的视频爬取和下载
- 真实的getchu剧照获取
- 数据库自动导入和标签关联
- 按数字顺序排序的fanart字段
- 完善的错误处理和日志记录
- 可配置的爬取参数
- 断点续传支持

使用方法:
    python production_crawler.py [config_file]
    
    config_file: 配置文件路径 (默认: production_config.yml)
"""

import os
import sys
import argparse
import signal
import time
from pathlib import Path
from datetime import datetime
import logging
import logging.handlers
from unified_crawler import UnifiedCrawler
from anime_sync_client import AnimeSyncClient  # 添加D1同步客户端


class ProductionCrawler:
    """生产环境爬虫类"""
    
    def __init__(self, config_file="production_config.yml"):
        """初始化生产爬虫"""
        self.config_file = config_file
        self.crawler = None
        self.d1_client = None  # D1同步客户端
        self.logger = None
        self.start_time = None
        self.stats = {
            'total_videos': 0,
            'successful_downloads': 0,
            'failed_downloads': 0,
            'skipped_videos': 0,
            'total_fanart': 0,
            'total_tags': 0,
            'd1_synced': 0,  # D1同步计数
            'd1_failed': 0   # D1同步失败计数
        }

        # 设置信号处理
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
    def setup_logging(self):
        """设置生产环境日志"""
        # 从配置中获取日志设置
        log_config = self.crawler.config.get('logging', {})
        
        log_level = getattr(logging, log_config.get('level', 'INFO'))
        log_format = log_config.get('format', 
                                   '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        log_file = log_config.get('file', 'production_crawl.log')
        max_size = log_config.get('max_size', '50MB')
        backup_count = log_config.get('backup_count', 10)
        console_output = log_config.get('console_output', True)
        
        # 解析文件大小
        if max_size.endswith('MB'):
            max_bytes = int(max_size[:-2]) * 1024 * 1024
        elif max_size.endswith('KB'):
            max_bytes = int(max_size[:-2]) * 1024
        else:
            max_bytes = int(max_size)
        
        # 创建logger
        self.logger = logging.getLogger('ProductionCrawler')
        self.logger.setLevel(log_level)
        
        # 避免重复添加handler
        if self.logger.handlers:
            self.logger.handlers.clear()
        
        # 文件handler (使用RotatingFileHandler)
        file_handler = logging.handlers.RotatingFileHandler(
            log_file, 
            maxBytes=max_bytes, 
            backupCount=backup_count,
            encoding='utf-8'
        )
        file_handler.setLevel(log_level)
        file_formatter = logging.Formatter(log_format)
        file_handler.setFormatter(file_formatter)
        self.logger.addHandler(file_handler)
        
        # 控制台handler
        if console_output:
            console_handler = logging.StreamHandler()
            console_handler.setLevel(log_level)
            console_formatter = logging.Formatter(log_format)
            console_handler.setFormatter(console_formatter)
            self.logger.addHandler(console_handler)
    
    def signal_handler(self, signum, frame):
        """处理退出信号"""
        if self.logger:
            self.logger.warning(f"接收到退出信号 {signum}，正在安全退出...")
            self.print_final_statistics()
        sys.exit(0)
    
    def initialize(self):
        """初始化爬虫系统"""
        print(f"=== Hanime1.me 正式爬取系统 ===")
        print(f"配置文件: {self.config_file}")
        print(f"启动时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 50)

        # 检查配置文件
        if not os.path.exists(self.config_file):
            print(f"❌ 错误: 配置文件不存在: {self.config_file}")
            return False

        try:
            # 创建爬虫实例
            self.crawler = UnifiedCrawler(self.config_file)

            # 设置日志
            self.setup_logging()

            self.logger.info("=== 生产爬虫系统启动 ===")
            self.logger.info(f"配置文件: {self.config_file}")
            self.logger.info(f"目标年份: {self.crawler.TARGET_YEARS}")
            self.logger.info(f"目标月份: {self.crawler.TARGET_MONTHS}")
            self.logger.info(f"总组合数: {len(self.crawler.TARGET_YEARS)} × {len(self.crawler.TARGET_MONTHS)} = {len(self.crawler.TARGET_YEARS) * len(self.crawler.TARGET_MONTHS)}")
            self.logger.info(f"下载目录: {self.crawler.DOWNLOAD_DIR}")

            # 初始化 D1 同步客户端
            d1_config = self.crawler.config.get('d1_sync', {})
            if d1_config.get('enabled', False):
                api_url = d1_config.get('api_url', 'https://anime.ixacg.top')
                api_key = d1_config.get('api_key') or os.getenv('ADMIN_API_KEY')

                if api_key:
                    self.d1_client = AnimeSyncClient(
                        api_url=api_url,
                        api_key=api_key,
                        batch_size=d1_config.get('batch_size', 50)
                    )
                    self.logger.info(f"✅ D1 同步已启用: {api_url}")
                else:
                    self.logger.warning("⚠️ D1 同步已启用但未提供 API Key")
            else:
                self.logger.info("ℹ️ D1 同步未启用")

            # 测试数据库连接
            conn = self.crawler.get_db_connection()
            if not conn:
                self.logger.error("❌ 数据库连接失败")
                return False

            conn.close()
            self.logger.info("✅ 数据库连接正常")

            # 创建下载目录
            os.makedirs(self.crawler.DOWNLOAD_DIR, exist_ok=True)

            return True

        except Exception as e:
            print(f"❌ 初始化失败: {e}")
            if self.logger:
                self.logger.error(f"初始化失败: {e}")
            return False
    
    def run_production_crawl(self):
        """执行生产环境爬取"""
        if not self.initialize():
            return False
        
        self.start_time = time.time()
        self.logger.info("🚀 开始生产环境爬取...")
        
        # 获取爬取策略配置
        strategy = self.crawler.config.get('strategy', {})
        mode = strategy.get('mode', 'full')
        max_videos = strategy.get('max_videos_per_month', 0)
        continue_on_error = strategy.get('continue_on_error', True)
        skip_existing = strategy.get('skip_existing', True)
        
        self.logger.info(f"爬取模式: {mode}")
        self.logger.info(f"最大视频数: {'无限制' if max_videos == 0 else max_videos}")
        self.logger.info(f"跳过已存在: {skip_existing}")
        
        try:
            years = self.crawler.TARGET_YEARS if isinstance(self.crawler.TARGET_YEARS, list) else [self.crawler.TARGET_YEARS]
            months = self.crawler.TARGET_MONTHS if isinstance(self.crawler.TARGET_MONTHS, list) else [self.crawler.TARGET_MONTHS]
            
            total_combinations = len(years) * len(months)
            current_combination = 0
            
            for year in years:
                self.logger.info(f"\n🗓️ 开始处理 {year} 年")
                
                for month in months:
                    current_combination += 1
                    self.logger.info(f"\n📅 开始处理 {year}年{month}月 ({current_combination}/{total_combinations})")
                    
                    success = self.crawl_month(year, month, max_videos, continue_on_error, skip_existing)
                    
                    if success:
                        self.logger.info(f"✅ {year}年{month}月 处理完成")
                    else:
                        self.logger.error(f"❌ {year}年{month}月 处理失败")
                        if not continue_on_error:
                            return False
                    
                    # 月份间暂停
                    if current_combination < total_combinations:
                        self.logger.info("等待5秒后处理下一个月份...")
                        time.sleep(5)
                
                self.logger.info(f"🏁 年份 {year} 处理完毕")
            
            self.logger.info(f"🎉 所有年份处理完成！")
            self.print_final_statistics()
            return True
            
        except Exception as e:
            self.logger.error(f"爬取过程中发生严重错误: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
            return False
    
    def crawl_month(self, year, month, max_videos, continue_on_error, skip_existing):
        """爬取指定月份的数据"""
        try:
            # 构建搜索URL
            base_url = ("https://hanime1.me/search?query=&type=&genre=%E8%A3%8F%E7%95%AA"
                       "&sort=&date={}+%E5%B9%B4+{}+%E6%9C%88&duration=")
            url = base_url.format(year, month)
            
            self.logger.info(f"获取视频列表: {url}")
            
            # 获取视频列表
            response = self.crawler.scraper.get(url, timeout=30)
            if response.status_code != 200:
                self.logger.error(f"获取视频列表失败，状态码: {response.status_code}")
                return False
            
            from bs4 import BeautifulSoup
            import re
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            # 在一级页同时抓封面
            cover_map = {}
            for a in soup.select('a[href^="https://hanime1.me/watch"]'):
                href = a.get("href")
                img = a.find("img")
                if not href or not img:
                    continue
                cover = img.get("src") or img.get("data-src")
                if cover:
                    from urllib.parse import urljoin
                    cover_map[href] = urljoin(url, cover)
            
            # 查找视频链接
            pattern = r'"(https://hanime1\.me/watch\?[^\s]+)"'
            matches = re.findall(pattern, str(soup))

            self.logger.info(f"找到 {len(matches)} 个原始视频链接")

            # 早期过滤: 提取标题并过滤掉包含屏蔽词的视频
            filtered_matches = []
            for match in matches:
                # 从HTML中提取标题
                # 查找包含该链接的元素,获取标题
                link_element = soup.find('a', href=match)
                title_text = ""

                if link_element:
                    # 尝试从aria-label获取
                    title_text = link_element.get('aria-label', '')
                    # 或从title属性获取
                    if not title_text:
                        title_text = link_element.get('title', '')
                    # 或从文本内容获取
                    if not title_text:
                        title_text = link_element.get_text(strip=True)

                # 检查是否包含屏蔽词
                if title_text and self.crawler.should_skip(title_text):
                    self.logger.info(f"⛔ 早期过滤(包含屏蔽词): {title_text}")
                    self.stats['skipped_videos'] += 1
                    continue

                filtered_matches.append(match)

            self.logger.info(f"过滤后剩余 {len(filtered_matches)} 个视频链接")

            if not filtered_matches:
                self.logger.warning("过滤后没有任何视频链接")
                return True

            # 使用过滤后的列表
            matches = filtered_matches
            
            # 限制处理数量
            if max_videos > 0 and len(matches) > max_videos:
                matches = matches[:max_videos]
                self.logger.info(f"限制处理数量为: {max_videos}")
            
            # 处理每个视频
            self.stats['total_videos'] += len(matches)
            
            for idx, match in enumerate(matches, 1):
                self.logger.info(f"\n🎬 [{idx}/{len(matches)}] 处理视频: {match}")
                
                try:
                    success = self.process_video(match, cover_map, year, month, skip_existing)
                    
                    if success:
                        self.stats['successful_downloads'] += 1
                        self.logger.info(f"✅ 视频 {idx} 处理成功")
                    else:
                        self.stats['failed_downloads'] += 1
                        self.logger.warning(f"⚠️ 视频 {idx} 处理失败")
                        
                        if not continue_on_error:
                            self.logger.error("遇到错误且配置为不继续，停止爬取")
                            return False
                
                except Exception as e:
                    self.stats['failed_downloads'] += 1
                    self.logger.error(f"❌ 处理视频 {idx} 时发生异常: {e}")
                    
                    if not continue_on_error:
                        self.logger.error("遇到异常且配置为不继续，停止爬取")
                        return False
                
                # 视频间暂停，避免被封
                performance = self.crawler.config.get('performance', {})
                delay = performance.get('request_delay', 1)
                if idx < len(matches):  # 不是最后一个
                    self.logger.debug(f"等待 {delay} 秒后处理下一个视频...")
                    time.sleep(delay)
            
            return True
            
        except Exception as e:
            self.logger.error(f"爬取月份 {year}/{month} 时发生错误: {e}")
            return False
    
    def process_video(self, video_url, cover_map, year, month, skip_existing):
        """处理单个视频"""
        try:
            # 提取video_id
            import re
            video_id_match = re.search(r'v=(\d+)', video_url)
            if not video_id_match:
                self.logger.warning("无法提取video_id")
                return False
            
            video_id = video_id_match.group(1)
            self.logger.debug(f"Video ID: {video_id}")
            
            # 获取视频详细信息
            video_info = self.crawler.scrape_hanime_info(video_id)
            if not video_info:
                self.logger.warning("获取视频信息失败")
                return False
            
            title = video_info.get('title', f'video_{video_id}')
            self.logger.info(f"视频标题: {title}")
            
            # 检查是否跳过
            if self.crawler.should_skip(title):
                self.logger.info(f"跳过视频（包含屏蔽词）: {title}")
                self.stats['skipped_videos'] += 1
                return True
            
            # 清理标题
            title = self.crawler.strip_brackets(title)
            safe_title = re.sub(r'[<>:"/\\|?*]', '', title)
            
            # 创建目录结构
            if self.crawler.ORGANIZE_BY_DATE:
                video_dir = os.path.join(self.crawler.DOWNLOAD_DIR, str(year), f"{month:02d}", safe_title)
            else:
                video_dir = os.path.join(self.crawler.DOWNLOAD_DIR, safe_title)
            
            # 检查是否已存在
            if skip_existing and os.path.exists(video_dir):
                video_files = [f for f in os.listdir(video_dir) if f.endswith('.mp4')]
                if video_files:
                    self.logger.info(f"跳过已存在的视频: {safe_title}")
                    self.stats['skipped_videos'] += 1
                    return True
            
            os.makedirs(video_dir, exist_ok=True)
            
            # 创建extrafanart文件夹
            extrafanart_dir = os.path.join(video_dir, "extrafanart")
            os.makedirs(extrafanart_dir, exist_ok=True)
            
            # 下载视频
            video_path = None
            download_config = self.crawler.config.get('download', {})
            if download_config.get('enable_video', True):
                video_path = self.download_video(video_url, video_dir, safe_title)
                if not video_path:
                    self.logger.error("视频下载失败")
                    return False
            
            # 下载封面
            cover_path = None
            if download_config.get('enable_cover', True):
                cover_path = self.download_cover(video_url, cover_map, video_dir)
            
            # 下载剧照
            if download_config.get('enable_fanart', True):
                fanart_count = self.download_fanart(title, extrafanart_dir)
                self.stats['total_fanart'] += fanart_count
            
            # 保存到数据库
            if video_path:
                # 保存到 MySQL
                success = self.crawler.save_video_to_db(video_info, video_path, cover_path)
                if success:
                    # 统计标签数量
                    tags = video_info.get('tag', []) or video_info.get('genre', [])
                    self.stats['total_tags'] += len(tags) if tags else 0

                    self.logger.info("✅ MySQL 数据库保存成功")

                    # 同步到 D1 (如果启用)
                    if self.d1_client:
                        try:
                            self.sync_to_d1(video_info, video_path, cover_path)
                        except Exception as e:
                            self.logger.error(f"D1 同步失败: {e}")
                            self.stats['d1_failed'] += 1
                else:
                    self.logger.error("❌ MySQL 数据库保存失败")
                    return False
            
            # 生成NFO文件
            try:
                self.crawler.save_nfo_file(video_info, video_dir, safe_title)
            except Exception as e:
                self.logger.warning(f"生成NFO文件失败: {e}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"处理视频时发生异常: {e}")
            return False
    
    def download_video(self, video_url, video_dir, safe_title):
        """下载视频文件"""
        try:
            self.logger.info("🎥 开始下载视频...")
            
            # 使用Selenium获取视频源
            from selenium import webdriver
            from selenium.webdriver.chrome.service import Service
            from bs4 import BeautifulSoup
            import requests
            import re
            
            service = Service(log_path=os.devnull)
            driver = webdriver.Chrome(service=service, options=self.crawler.chrome_options)
            
            try:
                driver.get(video_url)
                time.sleep(3)
                soup = BeautifulSoup(driver.page_source, 'html.parser')
                
                # 方法1: 按质量优先级查找source标签
                src = None
                for q in self.crawler.QUALITY_PRIORITY:
                    tag = soup.find('source', {'size': q})
                    if tag and tag.get('src'):
                        src = tag['src']
                        self.logger.info(f"找到 {q}p source标签: {src}")
                        break
                
                # 方法2: 如果source标签没找到，尝试从JavaScript或其他位置提取
                if not src:
                    self.logger.info("source标签未找到，尝试其他方法...")
                    
                    # 查找所有source标签（不限制size属性）
                    all_sources = soup.find_all('source')
                    self.logger.info(f"找到 {len(all_sources)} 个source标签")
                    
                    for source_tag in all_sources:
                        if source_tag.get('src'):
                            src_url = source_tag.get('src')
                            size_attr = source_tag.get('size', 'unknown')
                            self.logger.info(f"发现视频源: {size_attr}p - {src_url}")
                            
                            # 优先选择1080p，然后720p，最后其他
                            if not src or ('1080' in size_attr):
                                src = src_url
                            elif '720' in size_attr and '1080' not in str(src):
                                src = src_url
                
                # 方法3: 如果还是没找到，尝试从页面源码中正则匹配视频URL
                if not src:
                    self.logger.info("尝试正则匹配视频URL...")
                    # 匹配常见的视频URL模式
                    video_url_patterns = [
                        r'"(https://[^"]*\.mp4[^"]*)"',
                        r"'(https://[^']*\.mp4[^']*)'",
                        r'src="(https://[^"]*\.mp4[^"]*)"',
                        r"src='(https://[^']*\.mp4[^']*)'",
                    ]
                    
                    page_source = driver.page_source
                    for pattern in video_url_patterns:
                        matches_urls = re.findall(pattern, page_source)
                        if matches_urls:
                            src = matches_urls[0]
                            self.logger.info(f"正则匹配找到视频URL: {src}")
                            break
                
                # 方法4: 如果watch页面都失败了，尝试访问download页面
                if not src:
                    self.logger.info("watch页面未找到视频源，尝试download页面...")
                    src = self.crawler.try_download_page(video_url, driver)
                    if src:
                        self.logger.info(f"从download页面找到视频URL: {src}")
                
                if not src:
                    self.logger.warning("找不到视频源")
                    return None
                
                # 修复URL中的HTML实体编码
                import html
                src = html.unescape(src)
                self.logger.info(f"解码后的视频URL: {src}")
                
                # 下载视频
                video_path = os.path.join(video_dir, safe_title + '.mp4')
                
                self.logger.info(f"下载视频到: {video_path}")
                
                # 添加适当的headers
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': video_url,  # 使用原页面作为referer
                    'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8'
                }
                
                with requests.get(src, stream=True, timeout=60, headers=headers) as r:
                    r.raise_for_status()
                    total_size = int(r.headers.get('content-length', 0))
                    
                    if total_size > 0:
                        self.logger.info(f"视频文件大小: {total_size / 1024 / 1024:.2f} MB")
                    
                    with open(video_path, 'wb') as f:
                        downloaded = 0
                        for chunk in r.iter_content(8192):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                
                                if total_size > 0:
                                    percent = (downloaded / total_size) * 100
                                    if downloaded % (1024 * 1024 * 10) == 0:  # 每10MB打印一次
                                        self.logger.debug(f"下载进度: {percent:.1f}%")
                
                self.logger.info(f"✅ 视频下载完成: {os.path.getsize(video_path)} bytes")
                return video_path
                
            finally:
                driver.quit()
                
        except Exception as e:
            self.logger.error(f"下载视频失败: {e}")
            return None
    
    def download_cover(self, video_url, cover_map, video_dir):
        """下载封面图片"""
        try:
            cover_url = cover_map.get(video_url)
            if not cover_url:
                self.logger.warning("没有找到封面URL")
                return None
            
            cover_path = os.path.join(video_dir, "fanart.jpg")
            
            self.logger.info("🖼️ 下载封面...")
            import requests
            with requests.get(cover_url, timeout=30) as r:
                r.raise_for_status()
                with open(cover_path, 'wb') as f:
                    f.write(r.content)
            
            self.logger.info(f"✅ 封面下载完成: {cover_path}")
            return cover_path
            
        except Exception as e:
            self.logger.error(f"下载封面失败: {e}")
            return None
    
    def download_fanart(self, title, extrafanart_dir):
        """下载剧照"""
        try:
            self.logger.info("🎨 开始下载剧照...")

            getchu_config = self.crawler.config.get('getchu', {})
            if not getchu_config.get('enabled', True):
                self.logger.info("Getchu剧照下载已禁用")
                return 0

            initial_count = len([f for f in os.listdir(extrafanart_dir) if f.endswith('.jpg')])

            self.crawler.download_getchu_for_video(title, extrafanart_dir)

            final_count = len([f for f in os.listdir(extrafanart_dir) if f.endswith('.jpg')])
            downloaded_count = final_count - initial_count

            self.logger.info(f"✅ 剧照下载完成，新增 {downloaded_count} 张")
            return downloaded_count

        except Exception as e:
            self.logger.error(f"下载剧照失败: {e}")
            return 0

    def sync_to_d1(self, video_info, video_path, cover_path):
        """同步数据到 D1"""
        try:
            self.logger.info("🔄 开始同步到 D1...")

            # 准备动漫数据
            anime_data = {
                "title": video_info.get('title', ''),
                "titleJapanese": video_info.get('title_japanese', ''),
                "titleEnglish": video_info.get('title_english', ''),
                "description": video_info.get('description', ''),
                "cover": cover_path if cover_path else video_info.get('cover', ''),
                "videoUrl": video_path,
                "viewCount": 0
            }

            # 处理 fanart (如果有)
            video_dir = os.path.dirname(video_path)
            extrafanart_dir = os.path.join(video_dir, "extrafanart")
            if os.path.exists(extrafanart_dir):
                fanart_files = sorted([f for f in os.listdir(extrafanart_dir) if f.endswith('.jpg')])
                if fanart_files:
                    fanart_urls = [os.path.join(extrafanart_dir, f) for f in fanart_files]
                    anime_data["fanart"] = ",".join(fanart_urls)

            # 准备标签数据
            tags = video_info.get('tag', []) or video_info.get('genre', [])
            tags_data = []
            if tags:
                tags_data = [{"name": tag, "description": f"{tag}类动漫"} for tag in tags]

            # 同步标签 (如果有新标签)
            if tags_data:
                self.d1_client.sync_tags(tags_data)

            # 同步动漫
            try:
                success = self.d1_client.sync_animes([anime_data])

                if success:
                    self.stats['d1_synced'] += 1
                    self.logger.info("✅ D1 同步成功")
                else:
                    self.stats['d1_failed'] += 1
                    self.logger.error(f"❌ D1 同步失败 - 标题: {anime_data.get('title', 'Unknown')}")
                    self.logger.error(f"   API URL: {self.d1_client.api_url}/admin/import")
            except Exception as sync_error:
                self.stats['d1_failed'] += 1
                self.logger.error(f"❌ D1 同步异常: {sync_error}")

        except Exception as e:
            self.logger.error(f"D1 同步异常: {e}")
            self.stats['d1_failed'] += 1
            raise
    
    def print_final_statistics(self):
        """打印最终统计信息"""
        if not self.start_time:
            return

        elapsed_time = time.time() - self.start_time
        hours = int(elapsed_time // 3600)
        minutes = int((elapsed_time % 3600) // 60)
        seconds = int(elapsed_time % 60)

        self.logger.info("\n" + "=" * 60)
        self.logger.info("📊 爬取完成统计")
        self.logger.info("=" * 60)
        self.logger.info(f"总耗时: {hours:02d}:{minutes:02d}:{seconds:02d}")
        self.logger.info(f"总视频数: {self.stats['total_videos']}")
        self.logger.info(f"成功下载: {self.stats['successful_downloads']}")
        self.logger.info(f"下载失败: {self.stats['failed_downloads']}")
        self.logger.info(f"跳过视频: {self.stats['skipped_videos']}")
        self.logger.info(f"总剧照数: {self.stats['total_fanart']}")
        self.logger.info(f"总标签数: {self.stats['total_tags']}")

        # D1 同步统计
        if self.d1_client:
            self.logger.info(f"D1 同步成功: {self.stats['d1_synced']}")
            self.logger.info(f"D1 同步失败: {self.stats['d1_failed']}")

        if self.stats['total_videos'] > 0:
            success_rate = (self.stats['successful_downloads'] / self.stats['total_videos']) * 100
            self.logger.info(f"成功率: {success_rate:.1f}%")

        self.logger.info("=" * 60)


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='Hanime1.me 正式爬取脚本')
    parser.add_argument('config', nargs='?', default='production_config.yml',
                       help='配置文件路径 (默认: production_config.yml)')
    parser.add_argument('--version', action='version', version='%(prog)s 1.0.0')
    
    args = parser.parse_args()
    
    # 创建爬虫实例
    crawler = ProductionCrawler(args.config)
    
    # 开始爬取
    success = crawler.run_production_crawl()
    
    if success:
        print("\n🎉 爬取完成!")
        sys.exit(0)
    else:
        print("\n❌ 爬取失败!")
        sys.exit(1)


if __name__ == "__main__":
    main()