"""
统一爬虫模块
整合了三个爬虫功能：
1. craw.py - 主要获取海报和视频
2. getchuscraw.py - 主要爬取剧照
3. hanimecraw.py - 获取视频的各种信息
"""

import os
import sys
import re
import time
import json
import yaml
import requests
import cloudscraper
import urllib.parse
import logging
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin, urlparse
from xml.sax.saxutils import escape

# Web scraping imports
from bs4 import BeautifulSoup
from lxml import html

# Selenium imports
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

# Database imports
import pymysql

class UnifiedCrawler:
    """统一爬虫类，整合所有爬虫功能"""
    
    def __init__(self, config_path="config.yml"):
        """初始化统一爬虫"""
        self.config = self.load_config(config_path)
        self.setup_database()
        self.setup_scraper()
        self.setup_logger()
        self.setup_selenium_options()
        
    def load_config(self, config_path="config.yml"):
        """加载配置文件"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            
            # 设置默认日期（上一个月）
            today = datetime.now()
            if today.month == 1:
                default_year, default_month = today.year - 1, 12
            else:
                default_year, default_month = today.year, today.month - 1
            
            # 如果配置中的年月为空，使用默认值
            date_filter = config.get('crawl', {}).get('date_filter', {})
            if date_filter.get('year') is None:
                date_filter['year'] = default_year
            if date_filter.get('month') is None:
                date_filter['month'] = default_month
            
            return config
        except FileNotFoundError:
            print(f"配置文件 {config_path} 不存在，使用默认配置")
            return self.get_default_config()
        except Exception as e:
            print(f"加载配置文件失败: {e}")
            return self.get_default_config()
    
    def get_default_config(self):
        """获取默认配置"""
        today = datetime.now()
        default_year = today.year
        default_month = today.month - 1 if today.month > 1 else 12
        if default_month == 12:
            default_year -= 1
            
        return {
            'crawl': {
                'skip_keywords': ['中字後補', '简中补字', 'Chinese Sub', '中文字幕後補'],
                'quality_priority': ['1080', '720', '480'],
                'date_filter': {
                    'year': default_year,
                    'month': default_month
                }
            },
            'download': {
                'download_dir': 'downloads',
                'organize_by_date': True
            },
            'database': {
                'host': '192.168.1.7',
                'port': 3306,
                'user': 'root',
                'password': '123456',
                'database': 'hentai',
                'charset': 'utf8mb4'
            }
        }
    
    def setup_database(self):
        """设置数据库连接"""
        db_config = self.config.get('database', {})
        
        # 处理host:port格式
        host = db_config.get('host', '160.30.208.2:3306')
        if ':' in host:
            host_ip, port = host.split(':', 1)
            port = int(port)
        else:
            host_ip = host
            port = db_config.get('port', 3306)
        
        self.db_config = {
            'host': host_ip,
            'port': port,
            'user': db_config.get('user', 'sql23721_hentai'),
            'password': db_config.get('password', '507877550@lihao'),
            'database': db_config.get('database', 'sql23721_hentai'),
            'charset': db_config.get('charset', 'utf8mb4')
        }
    
    def get_db_connection(self):
        """获取数据库连接"""
        try:
            connection = pymysql.connect(**self.db_config)
            return connection
        except Exception as e:
            self.logger.error(f"数据库连接失败: {e}")
            return None
    
    def setup_scraper(self):
        """设置网络爬虫"""
        self.scraper = cloudscraper.create_scraper()
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        # 配置参数
        crawl_config = self.config.get('crawl', {})
        self.SKIP_KEYWORDS = tuple(crawl_config.get('skip_keywords', [
            '中字後補', '简中补字', 'Chinese Sub', '中文字幕後補'
        ]))
        self.QUALITY_PRIORITY = crawl_config.get('quality_priority', ['1080', '720', '480'])
        
        download_config = self.config.get('download', {})
        self.DOWNLOAD_DIR = download_config.get('download_dir', 'downloads')
        self.ORGANIZE_BY_DATE = download_config.get('organize_by_date', True)
        
        date_filter = crawl_config.get('date_filter', {})
        
        # Handle both single year and array of years
        year_config = date_filter.get('year', 2025)
        if isinstance(year_config, list):
            self.TARGET_YEARS = year_config
        else:
            self.TARGET_YEARS = [year_config]
        
        # Handle both single month and array of months
        month_config = date_filter.get('month', 6)
        if isinstance(month_config, list):
            self.TARGET_MONTHS = month_config
        else:
            self.TARGET_MONTHS = [month_config]
    
    def setup_logger(self):
        """设置日志"""
        self.logger = logging.getLogger('UnifiedCrawler')
        self.logger.setLevel(logging.INFO)
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
    
    def setup_selenium_options(self):
        """设置Selenium Chrome选项"""
        self.chrome_options = Options()
        self.chrome_options.add_argument("--headless")
        self.chrome_options.add_argument("--no-sandbox")
        self.chrome_options.add_argument('--disable-dev-shm-usage')
        self.chrome_options.add_argument('--remote-debugging-pipe')
        self.chrome_options.add_argument('--disable-logging')
        self.chrome_options.add_argument('--log-level=3')
        self.chrome_options.add_experimental_option("excludeSwitches", ["enable-logging"])
        self.chrome_options.add_argument(
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/124.0.0.0 Safari/537.36'
        )
    
    # ===== 共用工具方法 =====
    
    def should_skip(self, title: str) -> bool:
        """检查标题是否包含屏蔽词"""
        return any(kw.lower() in title.lower() for kw in self.SKIP_KEYWORDS)
    
    def strip_brackets(self, title: str) -> str:
        """去掉任意位置的 [xxx]，并压缩多余空白"""
        no_brackets = re.sub(r'\s*\[[^\]]+\]\s*', ' ', title)
        return re.sub(r'\s+', ' ', no_brackets).strip()
    
    def sanitize_path_for_web(self, path: str) -> str:
        """将路径中的 # 替换为全角字符 ＃ 以防止404错误，同时处理其他可能的web访问问题字符"""
        if not path:
            return path
            
        original_path = path
        
        # 替换 # 为全角字符 ＃
        if '#' in path:
            path = path.replace('#', '\uff03')  # 全角井号
            self.logger.info(f"替换路径中的#字符: '{original_path}' -> '{path}'")
        
        # 处理其他可能导致web访问问题的字符
        problematic_chars = {
            '%': '\uff05',  # 全角百分号，避免URL编码冲突
            '&': '\uff06',  # 全角ampersand，避免URL参数分隔符冲突
            '?': '\uff1f',  # 全角问号，避免URL查询字符串冲突
        }
        
        for char, replacement in problematic_chars.items():
            if char in path:
                path = path.replace(char, replacement)
                self.logger.debug(f"替换路径中的{char}字符: '{original_path}' -> '{path}'")
        
        return path
    
    def extract_collection(self, title: str) -> str | None:
        """提取合集名称"""
        # 日文/中文数字（用来识别"第六话""間章二"等）
        KAN_NUM = "零壱弐参肆伍陸柒捌玖拾百千"
        
        # 常见卷号关键词
        VOL_KEYWORDS = (
            r"(前編|後編|中編|上巻|下巻|完結編|"
            r"[Vv]ol\.?\s*\d+|＃\d+|#\d+|"
            r"Part\s*\d+|part\d+)"
        )
        # 中文"第n话/集/卷/章……"
        DIG_VOL = r"第\s*(?:\d+|[一二三四五六七八九十百千%s])\s*[话話集章篇卷]" % KAN_NUM
        # 中文"間章二/章三/话4/集5"之类
        CN_VOL = (
            r"(?:間章|间章|章|篇|卷|集|话|話)"
            r"(?:\d+|[一二三四五六七八九十百千%s])" % KAN_NUM
        )
        # 综合卷关键字
        VOL_TOKEN = rf"(?:{VOL_KEYWORDS}|{DIG_VOL}|{CN_VOL})"
        
        # 1) 去掉首尾方括号段 [字幕组] / [中文字幕] / [1080p] 等
        base = re.sub(r"^\s*(?:\[[^\]]+])+\s*", "", title)
        base = re.sub(r"\s*(?:\[[^\]]+])+\s*$", "", base)
        # 2) 去掉首尾中文全角【…】标签
        base = re.sub(r"^\s*(?:【[^】]+】)+\s*", "", base)
        base = re.sub(r"\s*(?:【[^】]+】)+\s*$", "", base)
        # 3) 去掉书名号《…》
        base = re.sub(r"[《》]", "", base).strip()
        # 4) 去掉前缀"动画 / 剧场版"等修饰词
        base = re.sub(r"^(动画|劇場版|剧场版)\s*", "", base)
        
        # ── 规则 A ── 系列名 +（可选分隔符）+ 卷号/话数
        m = re.match(rf"^(?P<series>.+?)[\s・\-–—:：]*{VOL_TOKEN}", base, flags=re.IGNORECASE)
        if m:
            return m.group("series").strip(" -_・:：")
        
        # ── 规则 B ── 系列名 + 分隔符 + 副标题
        m = re.match(r"^(.+?)[\s・\-–—:：]+\S+", base)
        if m:
            return m.group(1).strip(" -_・:：")
        
        # ── 规则 C ── 整个标题即系列名（兜底）
        return base if len(base) > 1 else None
    
    # ===== Hanime1.me 相关功能（来自 craw.py 和 hanimecraw.py）=====
    
    def crawl_hanime_videos(self):
        """爬取Hanime1.me视频（原craw.py功能）"""
        self.logger.info(f"开始爬取多年份数据，年份: {self.TARGET_YEARS}，月份: {self.TARGET_MONTHS}")
        
        total_years = len(self.TARGET_YEARS)
        total_months = len(self.TARGET_MONTHS)
        total_combinations = total_years * total_months
        
        current_combination = 0
        
        for year in self.TARGET_YEARS:
            self.logger.info(f"🗓️ 开始处理 {year} 年")
            
            for month in self.TARGET_MONTHS:
                current_combination += 1
                self.logger.info(f"📅 正在处理 {year} 年 {month} 月... ({current_combination}/{total_combinations})")
                
                base_url = ("https://hanime1.me/search?query=&type=&genre=%E8%A3%8F%E7%95%AA&sort=&date={}+%E5%B9%B4+{}+%E6%9C%88&duration=")
                url = base_url.format(year, month)
                self.logger.info(f"获取视频列表: {url}")
                
                try:
                    response = self.scraper.get(url, timeout=15)
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
                            cover_map[href] = urljoin(url, cover)
                    
                    pattern = r'"(https://hanime1\.me/watch\?[^\s]+)"'
                    matches = re.findall(pattern, str(soup))
                    
                    self.logger.info(f"找到 {len(matches)} 个视频链接")
                    
                    # 处理每个视频链接
                    for idx, match in enumerate(matches, 1):
                        self.logger.info(f"[{idx}/{len(matches)}] 解析 {match}")
                        
                        service = Service(log_path=os.devnull)
                        driver = webdriver.Chrome(service=service, options=self.chrome_options)
                        
                        try:
                            driver.get(match)
                            time.sleep(3)
                            soup2 = BeautifulSoup(driver.page_source, 'html.parser')
                            
                            title_elem = soup2.find('h3', id='shareBtn-title')
                            if not title_elem:
                                self.logger.warning("找不到标题，跳过")
                                continue
                            
                            title = title_elem.text
                            
                            if self.should_skip(title):
                                self.logger.info(f"跳过: {title}")
                                continue
                            
                            title = self.strip_brackets(title)
                            # 清理文件名中的非法字符，并替换#为全角字符
                            safe_title = re.sub(r'[<>:"/\\|?*]', '', title)
                            safe_title = self.sanitize_path_for_web(safe_title)
                            
                            # 为每个视频创建独立目录: 年/月/标题/
                            if self.ORGANIZE_BY_DATE:
                                video_dir = os.path.join(self.DOWNLOAD_DIR, str(year), f"{month:02d}", safe_title)
                            else:
                                video_dir = os.path.join(self.DOWNLOAD_DIR, safe_title)
                            
                            os.makedirs(video_dir, exist_ok=True)
                            
                            # 创建extrafanart文件夹
                            extrafanart_dir = os.path.join(video_dir, "extrafanart")
                            os.makedirs(extrafanart_dir, exist_ok=True)
                            
                            src = None
                            
                            # 方法1: 按质量优先级查找source标签
                            for q in self.QUALITY_PRIORITY:
                                tag = soup2.find('source', {'size': q})
                                if tag and tag.get('src'):
                                    src = tag['src']
                                    self.logger.info(f"找到 {q}p source标签: {src}")
                                    break
                            
                            # 方法2: 如果source标签没找到，尝试从JavaScript或其他位置提取
                            if not src:
                                self.logger.info("source标签未找到，尝试其他方法...")
                                
                                # 查找所有source标签（不限制size属性）
                                all_sources = soup2.find_all('source')
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
                                src = self.try_download_page(match, driver)
                                if src:
                                    self.logger.info(f"从download页面找到视频URL: {src}")
                            
                            if not src:
                                self.logger.warning("找不到视频源，跳过")
                                continue
                            
                            # 下载视频 - 保存到视频目录下
                            video_path = os.path.join(video_dir, safe_title + '.mp4')
                            if not os.path.exists(video_path):
                                self.logger.info(f"🎥 开始下载视频: {src}")
                                
                                try:
                                    # 添加适当的headers
                                    headers = {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                        'Referer': match,  # 使用原页面作为referer
                                        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8'
                                    }
                                    
                                    with requests.get(src, stream=True, timeout=60, headers=headers) as r:
                                        r.raise_for_status()
                                        
                                        # 获取文件大小用于进度显示
                                        total_size = int(r.headers.get('content-length', 0))
                                        if total_size > 0:
                                            self.logger.info(f"视频文件大小: {total_size / 1024 / 1024:.2f} MB")
                                        
                                        downloaded = 0
                                        with open(video_path, 'wb') as f:
                                            for chunk in r.iter_content(chunk_size=8192):
                                                if chunk:
                                                    f.write(chunk)
                                                    downloaded += len(chunk)
                                                    
                                                    # 每10MB显示一次进度
                                                    if downloaded % (10 * 1024 * 1024) == 0 and total_size > 0:
                                                        progress = (downloaded / total_size) * 100
                                                        self.logger.info(f"下载进度: {progress:.1f}%")
                                    
                                    self.logger.info(f"✅ 视频下载完成: {video_path}")
                                    
                                except requests.exceptions.RequestException as e:
                                    self.logger.error(f"❌ 视频下载失败: {e}")
                                    # 清理可能的不完整文件
                                    if os.path.exists(video_path):
                                        os.remove(video_path)
                                    continue
                                except Exception as e:
                                    self.logger.error(f"❌ 视频下载出现未知错误: {e}")
                                    if os.path.exists(video_path):
                                        os.remove(video_path)
                                    continue
                            else:
                                self.logger.info("视频已存在")
                            
                            # 下载封面 - 保存为fanart.jpg到视频目录下
                            cover_path = None
                            cover_url = cover_map.get(match)
                            if cover_url:
                                cover_path = os.path.join(video_dir, "fanart.jpg")
                                if not os.path.exists(cover_path):
                                    self.logger.info("下载封面...")
                                    try:
                                        with requests.get(cover_url, timeout=15) as r:
                                            r.raise_for_status()
                                            with open(cover_path, 'wb') as f:
                                                f.write(r.content)
                                        self.logger.info(f"封面完成: {cover_path}")
                                    except Exception as e:
                                        self.logger.error(f"封面失败: {e}")
                                else:
                                    self.logger.info("封面已存在")
                            else:
                                self.logger.warning("在一级页没找到封面 URL")
                            
                            # 获取详细信息并保存到数据库
                            video_id_match = re.search(r'v=(\d+)', match)
                            if video_id_match:
                                video_id = video_id_match.group(1)
                                video_info = self.scrape_hanime_info(video_id)
                                if video_info:
                                    self.save_video_to_db(video_info, video_path, cover_path)
                                    
                                    # 下载getchu剧照到extrafanart
                                    self.download_getchu_for_video(title, extrafanart_dir)
                                    
                                    # 生成NFO文件
                                    self.save_nfo_file(video_info, video_dir, safe_title)
                        
                        except Exception as video_error:
                            self.logger.error(f"处理视频 {match} 失败: {video_error}")
                        finally:
                            driver.quit()
                    
                except Exception as month_error:
                    self.logger.error(f"处理 {year} 年 {month} 月时发生错误: {month_error}")
                    continue
            
            self.logger.info(f'🏁 年份 {year} 处理完毕')
        
        self.logger.info(f'🎉 所有年份处理完成！')
    
    def scrape_hanime_info(self, video_id):
        """获取Hanime1.me视频详细信息（原hanimecraw.py功能）"""
        video_url = f"https://hanime1.me/watch?v={video_id}"
        self.logger.info(f"从hanime1.me获取信息: {video_url}")
        
        try:
            response = self.scraper.get(video_url, headers=self.headers, timeout=15)
            response.raise_for_status()
            
            tree = html.fromstring(response.content)
            info = {}
            
            # 获取图片
            image_url_elements = tree.xpath('//meta[@property="og:image"]/@content')
            if image_url_elements:
                info['image_url'] = image_url_elements[0]
            
            # 获取标题
            title_text = tree.xpath('//*[@id="shareBtn-title"]/text()')
            if title_text:
                title = title_text[0].strip()
                title = self.strip_brackets(title)
                info.update({
                    'title': title,
                    'originaltitle': title,
                    'sorttitle': title
                })
                
                # 设置合集
                collection = self.extract_collection(title)
                if collection:
                    info['set'] = collection
            
            # 从 og:description 解析中文标题和简介，格式: "中文标题 - 简介内容"
            og_desc = tree.xpath('//meta[@property="og:description"]/@content')
            if og_desc:
                og_desc_text = og_desc[0].strip()
                if ' - ' in og_desc_text:
                    cn_title_part, plot_part = og_desc_text.split(' - ', 1)
                    cn_title = re.sub(r'\s*\[.*\]$', '', cn_title_part.strip())
                    plot_content = plot_part.strip()
                else:
                    cn_title = ''
                    plot_content = og_desc_text

                if cn_title:
                    info['outline'] = f"<![CDATA[{cn_title}]]>"
                    info['tagline'] = cn_title

                if plot_content:
                    plot = plot_content.replace('\r\n', '<br>')
                    info['plot'] = f"<![CDATA[{plot}]]>"
            
            # 获取年份
            year_text = tree.xpath('//*[@id="player-div-wrapper"]/div[@class="video-details-wrapper hidden-sm hidden-md hidden-lg hidden-xl"]/text()')
            if year_text:
                date = year_text[0].strip().split('\xa0')[-1]
                info['premiered'] = date
                info['releasedate'] = date
                info['release'] = date
                year = date.split('-')[0]
                info['year'] = year
            
            # 获取制作商
            studio_text = tree.xpath('//*[@id="video-artist-name"]/text()')
            if studio_text:
                studio = studio_text[0].strip()
                info['studio'] = studio
                info['maker'] = studio
            
            # 获取标签
            tag_selectors = [
                '//div[text()="標籤"]/following-sibling::a/text()',
                '//div[contains(@class, "tags")]//a/text()',
                '//span[contains(@class, "tag")]/text()'
            ]
            
            for selector in tag_selectors:
                try:
                    tag_elements = tree.xpath(selector)
                    if tag_elements:
                        tags = [tag.strip() for tag in tag_elements if tag.strip()]
                        if tags:
                            info['tag'] = tags
                            info['genre'] = tags
                            self.logger.info(f"找到标签: {', '.join(tags[:5])}")
                            break
                except:
                    continue
            
            # 添加默认信息
            info.update({
                'customrating': '里番',
                'lockdata': 'False',
                'mpaa': '里番',
                'uncensored': 'False',
                'video_id': video_id
            })
            
            return info
            
        except Exception as e:
            self.logger.error(f"从hanime1.me获取信息失败: {e}")
            return {}
    
    def try_download_page(self, watch_url, driver=None):
        """尝试从下载页面获取视频源URL"""
        try:
            # 从watch URL提取video ID
            video_id_match = re.search(r'v=(\d+)', watch_url)
            if not video_id_match:
                self.logger.error("无法从URL提取video ID")
                return None
            
            video_id = video_id_match.group(1)
            download_url = f"https://hanime1.me/download?v={video_id}"
            
            self.logger.info(f"尝试访问下载页面: {download_url}")
            
            # 创建新的driver实例如果没有提供
            should_close_driver = False
            if driver is None:
                service = Service(log_path=os.devnull)
                driver = webdriver.Chrome(service=service, options=self.chrome_options)
                should_close_driver = True
            
            try:
                driver.get(download_url)
                time.sleep(3)  # 等待页面加载
                
                # 解析下载页面HTML
                soup = BeautifulSoup(driver.page_source, 'html.parser')
                
                # 查找包含data-url属性的所有元素（不仅限于tr）
                elements_with_data_url = soup.find_all(attrs={"data-url": True})
                video_sources = []
                
                self.logger.info(f"找到 {len(elements_with_data_url)} 个包含data-url的元素")
                
                for elem in elements_with_data_url:
                    data_url = elem.get('data-url')
                    if data_url:
                        # 尝试提取质量信息
                        quality_text = elem.get_text(strip=True)
                        quality = 'unknown'
                        
                        # 提取质量标识 (1080p, 720p, 480p等)
                        quality_match = re.search(r'(\d+)p', quality_text)
                        if quality_match:
                            quality = quality_match.group(1)
                        else:
                            # 如果文本中没有质量信息，尝试从URL中提取
                            url_quality_match = re.search(r'-(\d+)-\d+-\d+-', data_url)
                            if url_quality_match:
                                quality = url_quality_match.group(1)
                        
                        video_sources.append({
                            'url': data_url,
                            'quality': quality,
                            'text': quality_text,
                            'element': elem.name
                        })
                        
                        self.logger.info(f"找到下载链接: {quality}p - 元素:{elem.name} - {data_url[:100]}...")
                
                if not video_sources:
                    self.logger.warning("下载页面没有找到data-url属性")
                    return None
                
                # 按优先级选择视频源
                for preferred_quality in self.QUALITY_PRIORITY:
                    for source in video_sources:
                        if source['quality'] == preferred_quality:
                            self.logger.info(f"选择{preferred_quality}p质量: {source['url']}")
                            return source['url']
                
                # 如果没有匹配的优先级质量，选择第一个
                first_source = video_sources[0]
                self.logger.info(f"使用第一个可用源: {first_source['quality']}p - {first_source['url']}")
                return first_source['url']
                
            finally:
                if should_close_driver:
                    driver.quit()
            
        except Exception as e:
            self.logger.error(f"访问下载页面失败: {e}")
            return None
    
    # ===== Getchu.com 相关功能（来自 getchuscraw.py）=====
    
    def search_getchu(self, search_term):
        """在getchu.com搜索指定的标题，返回最匹配的链接"""
        encoded_url = urllib.parse.quote_plus(search_term, encoding='cp932')
        
        getchu_url = f"https://www.getchu.com/php/search.phtml?genre=all&search_keyword={encoded_url}&gc=gc"
        self.logger.info(f"搜索词: '{search_term}', URL: {getchu_url}")
        
        try:
            response = requests.get(getchu_url, headers=self.headers, timeout=30)
            
            if response.status_code != 200:
                self.logger.error(f"请求失败，状态码: {response.status_code}")
                return None
            
            tree = html.fromstring(response.content)
            soft_links = tree.xpath('//a[contains(@href, "soft.phtml?id=")]')
            
            if not soft_links:
                self.logger.warning("没有找到任何soft.phtml链接")
                return None
            
            # 收集链接信息
            link_candidates = []
            for link in soft_links:
                href = link.get('href')
                text = link.text_content().strip() if link.text_content() else ""
                if text:
                    link_candidates.append((href, text))
            
            # 寻找最佳匹配
            best_match = None
            best_score = -1
            
            for href, text in link_candidates:
                score = 0
                
                if search_term == text:
                    score = 1000
                elif search_term.lower() == text.lower():
                    score = 900
                elif search_term in text:
                    score = 500
                else:
                    # 计算关键词匹配度
                    search_words = search_term.split()
                    matched_words = sum(1 for word in search_words if word in text)
                    score = matched_words * 50
                
                if score > best_score:
                    best_score = score
                    best_match = href
            
            if best_match:
                if best_match.startswith('../'):
                    best_match = best_match[3:]

                if not best_match.startswith('http'):
                    final_url = f"https://www.getchu.com/{best_match}"
                else:
                    final_url = best_match

                # 2026 起 getchu 把详情页从 soft.phtml?id=X 迁到 /item/X/
                m = re.search(r'(?:soft\.phtml\?id=|/item/)(\d+)', final_url)
                if m:
                    final_url = f"https://www.getchu.com/item/{m.group(1)}/"

                self.logger.info(f"选择最佳匹配: {final_url}")
                return final_url
            else:
                self.logger.warning("没有找到合适的匹配")
                return None
                
        except Exception as e:
            self.logger.error(f"搜索getchu时发生错误: {e}")
            return None
    
    def get_getchu_info(self, result_url):
        """获取getchu.com的详细信息，特别是样本图片链接"""
        try:
            # 2026 起 getchu 把详情页迁到 /item/X/，统一规范
            m = re.search(r'(?:soft\.phtml\?id=|/item/)(\d+)', result_url)
            if m:
                result_url = f"https://www.getchu.com/item/{m.group(1)}/"

            # gc=gc 仍然有效，会同时设置 getchu_adalt_flag cookie 绕过年龄认证
            if '?gc=gc' not in result_url and '&gc=gc' not in result_url:
                result_url = result_url + ('&gc=gc' if '?' in result_url else '?gc=gc')

            response = requests.get(result_url, headers=self.headers, timeout=30)
            if response.status_code != 200:
                self.logger.error(f"请求失败，状态码: {response.status_code}")
                return None

            tree = html.fromstring(response.content)

            age_verification = tree.xpath('//h1[contains(text(), "年齢認証")]') or \
                               tree.xpath('//title[contains(text(), "年齢認証")]')
            if age_verification:
                self.logger.warning("仍然是年龄认证页面，无法获取图片")
                return None

            # /item/{id}/ 页面的剧照都在 /brandnew/{id}/c{id}sample{N}.jpg
            # 旧选择器保留作为兜底
            selectors = [
                '//a[contains(@href, "sample") and contains(@href, ".jpg")]/@href',
                '//a[contains(@href, "package") and contains(@href, ".jpg")]/@href',
                '//*[@id="soft_table"]//td/a[contains(@href, ".jpg")]/@href',
                '//div[@align="center"]//a[contains(@href, ".jpg")]/@href',
            ]

            all_image_links = []
            for selector in selectors:
                try:
                    all_image_links.extend(tree.xpath(selector))
                except Exception as e:
                    self.logger.error(f"执行选择器失败: {e}")

            # 去重 + 过滤掉缩略图 (_s.jpg / _100.jpg)，保留原图
            seen = set()
            full_image_urls = []
            base_url = "https://www.getchu.com/"
            for link in all_image_links:
                if link in seen:
                    continue
                seen.add(link)
                if re.search(r'_(?:s|\d+)\.jpg$', link):
                    continue
                if link.startswith('./'):
                    link = link[2:]
                if not link.startswith('http'):
                    link = base_url + link.lstrip('/')
                full_image_urls.append(link)

            self.logger.info(f"找到 {len(full_image_urls)} 个图片链接")
            return full_image_urls

        except Exception as e:
            self.logger.error(f"获取getchu页面信息时发生错误: {e}")
            return None
    
    def download_getchu_images(self, image_urls, extrafanart_dir):
        """下载getchu图片并保存到指定的extrafanart文件夹"""
        if not image_urls:
            self.logger.warning("没有图片需要下载")
            return
        
        downloaded_count = 0
        
        for url in image_urls:
            try:
                response = requests.get(url, headers={**self.headers, 'Referer': 'https://www.getchu.com/'}, timeout=30)
                
                if response.status_code == 200:
                    filename = url.split('/')[-1]
                    
                    # 处理重命名逻辑
                    if 'package.jpg' in filename:
                        # package.jpg保存到父目录，重命名为poster.jpg
                        parent_dir = os.path.dirname(extrafanart_dir)
                        save_path = os.path.join(parent_dir, "poster.jpg")
                    else:
                        # 检查是否是sample图片
                        sample_match = re.search(r'sample(\d+)\.jpg', filename)
                        if sample_match:
                            sample_num = sample_match.group(1)
                            new_filename = f"fanart{sample_num}.jpg"
                            save_path = os.path.join(extrafanart_dir, new_filename)
                        else:
                            # 其他图片保持原名
                            save_path = os.path.join(extrafanart_dir, filename)
                    
                    # 保存文件
                    with open(save_path, 'wb') as f:
                        f.write(response.content)
                    
                    self.logger.info(f"保存成功: {save_path}")
                    downloaded_count += 1
                else:
                    self.logger.error(f"下载失败: {url} (状态码: {response.status_code})")
                    
            except Exception as e:
                self.logger.error(f"下载出错: {url} - {e}")
        
        self.logger.info(f"下载完成！成功下载 {downloaded_count} 张图片")
    
    def download_getchu_for_video(self, title, extrafanart_dir):
        """为指定视频下载getchu剧照"""
        try:
            getchu_url = self.search_getchu(title)
            if getchu_url:
                image_urls = self.get_getchu_info(getchu_url)
                if image_urls:
                    self.download_getchu_images(image_urls, extrafanart_dir)
                else:
                    self.logger.warning(f"没有找到 {title} 的getchu图片")
            else:
                self.logger.warning(f"没有找到 {title} 在getchu的匹配页面")
        except Exception as e:
            self.logger.error(f"下载getchu图片失败 {title}: {e}")
    
    def save_nfo_file(self, video_info, video_dir, safe_title):
        """保存NFO文件到视频目录"""
        try:
            nfo_content = self.generate_nfo(video_info)
            nfo_path = os.path.join(video_dir, f"{safe_title}.nfo")
            
            with open(nfo_path, 'w', encoding='utf-8') as f:
                f.write(nfo_content)
            
            self.logger.info(f"NFO文件已保存: {nfo_path}")
            return nfo_path
        except Exception as e:
            self.logger.error(f"保存NFO文件失败: {e}")
            return None
    
    # ===== 数据库相关功能 =====
    
    def save_video_to_db(self, video_info, video_path, cover_path=None):
        """保存视频信息到正确的数据库表结构"""
        connection = self.get_db_connection()
        if not connection:
            return False
        
        try:
            cursor = connection.cursor()
            
            # 1. 处理分类 - 里番
            cursor.execute("SELECT id FROM categories WHERE name = %s", ('里番',))
            category_result = cursor.fetchone()
            if not category_result:
                cursor.execute("INSERT INTO categories (name, num) VALUES (%s, %s)", ('里番', 1))
                category_id = cursor.lastrowid
            else:
                category_id = category_result[0]
            
            # 2. 处理简介格式 - 转换为适合web前端显示的格式
            description = video_info.get('plot', '')
            if description:
                # 移除CDATA标签
                description = description.replace('<![CDATA[', '').replace(']]>', '')
                # 将<br>转换为换行符，便于前端处理
                description = description.replace('<br>', '\n')
            
            # 3. 获取标题映射
            # title = 中文标题 (从tagline获取)
            # title_english = 留空
            # title_japanese = 日文原标题 (从title获取)
            chinese_title = video_info.get('tagline', '')
            japanese_title = video_info.get('title', '') or video_info.get('originaltitle', '')
            
            # 如果tagline为空，尝试从outline获取并清理CDATA标签
            if not chinese_title:
                outline = video_info.get('outline', '')
                if outline:
                    # 移除CDATA标签获取纯文本
                    chinese_title = outline.replace('<![CDATA[', '').replace(']]>', '').strip()
            
            # 如果仍然没有中文标题或者是空的CDATA，使用日文标题作为主标题
            if not chinese_title or chinese_title == '':
                chinese_title = japanese_title or '未知标题'
                self.logger.info(f"没有中文标题，使用日文标题作为主标题: {chinese_title}")
            else:
                self.logger.info(f"使用中文标题: {chinese_title}")
            
            # 清理可能残留的CDATA标签
            if '<![CDATA[' in chinese_title:
                chinese_title = chinese_title.replace('<![CDATA[', '').replace(']]>', '').strip()
            
            if '<![CDATA[' in japanese_title:
                japanese_title = japanese_title.replace('<![CDATA[', '').replace(']]>', '').strip()
            
            # 4. 处理发布信息
            release_year = int(video_info.get('year', 2025)) if video_info.get('year') else 2025
            release_date = video_info.get('premiered', f'{release_year}-01-01')
            
            # 5. 生成随机观看次数 1000-10000
            import random
            view_count = random.randint(1000, 10000)
            
            # 6. 获取域名前缀配置
            web_config = self.config.get('web_access', {})
            domain_prefix = web_config.get('domain_prefix', '')
            base_path = web_config.get('base_path', '')
            
            # 7. 处理剧照路径 - fanart字段存放剧照图片的路径列表
            # 查找extrafanart目录并构建剧照路径
            video_dir = os.path.dirname(video_path)
            extrafanart_dir = os.path.join(video_dir, 'extrafanart')
            fanart_paths = []
            
            if os.path.exists(extrafanart_dir):
                fanart_files = [f for f in os.listdir(extrafanart_dir) 
                              if f.endswith(('.jpg', '.jpeg', '.png'))]
                
                # 按数字顺序排序fanart文件 (fanart1.jpg, fanart2.jpg, fanart3.jpg...)
                def extract_fanart_number(filename):
                    """从fanart文件名中提取数字用于排序"""
                    import re
                    match = re.search(r'fanart(\d+)\.jpg', filename)
                    if match:
                        return int(match.group(1))
                    else:
                        # 对于不符合fanart数字模式的文件，按字母顺序排在后面
                        return 9999
                
                # 按数字顺序排序
                fanart_files_sorted = sorted(fanart_files, key=extract_fanart_number)
                
                for fanart_file in fanart_files_sorted:
                    fanart_path = os.path.join(extrafanart_dir, fanart_file)
                    # 将绝对路径转换为相对路径以便web访问
                    relative_fanart_path = os.path.relpath(fanart_path, start=self.DOWNLOAD_DIR)
                    # 统一使用正斜杠，便于web访问
                    relative_fanart_path = relative_fanart_path.replace('\\', '/')
                    
                    # 构建完整URL
                    if domain_prefix:
                        full_fanart_url = f"{domain_prefix}{base_path}/{relative_fanart_path}"
                        # 对URL中的#字符进行URL编码
                        full_fanart_url = full_fanart_url.replace('#', '%23')
                        fanart_paths.append(full_fanart_url)
                    else:
                        # 对URL中的#字符进行URL编码
                        relative_fanart_path = relative_fanart_path.replace('#', '%23')
                        fanart_paths.append(relative_fanart_path)
            
            # 将剧照路径列表转换为逗号分隔的字符串（最后一个不加逗号）
            fanart_string = ','.join(fanart_paths) if fanart_paths else ''
            
            # 8. 插入anime记录
            anime_sql = """
            INSERT INTO animes (
                title, title_english, title_japanese, description, cover, fanart,
                video_url, release_year, release_date, view_count, favorite_count,
                is_active, category_id
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            """
            
            # 处理封面路径
            cover_url = ''
            if cover_path:
                cover_relative_path = os.path.relpath(cover_path, start=self.DOWNLOAD_DIR)
                cover_relative_path = cover_relative_path.replace('\\', '/')
                # 构建完整URL
                if domain_prefix:
                    cover_url = f"{domain_prefix}{base_path}/{cover_relative_path}"
                else:
                    cover_url = cover_relative_path
                # 对URL中的#字符进行URL编码
                cover_url = cover_url.replace('#', '%23')
            
            # 处理视频路径
            video_relative_path = os.path.relpath(video_path, start=self.DOWNLOAD_DIR)
            video_relative_path = video_relative_path.replace('\\', '/')
            # 构建完整URL
            if domain_prefix:
                video_url = f"{domain_prefix}{base_path}/{video_relative_path}"
            else:
                video_url = video_relative_path
            # 对URL中的#字符进行URL编码
            video_url = video_url.replace('#', '%23')
            
            anime_data = (
                chinese_title,  # title (中文标题)
                '',  # title_english (留空)
                japanese_title,  # title_japanese (日文原标题)
                description,  # description (处理后的简介)
                cover_url,  # cover (封面完整URL)
                fanart_string,  # fanart (剧照完整URL，逗号分隔)
                video_url,  # video_url (视频文件完整URL)
                release_year,  # release_year
                release_date,  # release_date
                view_count,  # view_count (随机1000-10000)
                0,  # favorite_count
                True,  # is_active
                category_id  # category_id
            )
            
            cursor.execute(anime_sql, anime_data)
            anime_id = cursor.lastrowid
            
            # 8. 处理标签
            tags = video_info.get('tag', []) or video_info.get('genre', [])
            self.logger.info(f"提取到的原始标签数据: {tags} (类型: {type(tags)})")
            
            if tags and isinstance(tags, (list, tuple)):
                tag_count = 0
                for tag_name in tags:
                    if tag_name and str(tag_name).strip():
                        tag_name = str(tag_name).strip()
                        self.logger.info(f"处理标签: '{tag_name}'")
                        
                        try:
                            # 检查标签是否存在
                            cursor.execute("SELECT id FROM tags WHERE name = %s", (tag_name,))
                            tag_result = cursor.fetchone()
                            
                            if not tag_result:
                                # 创建新标签
                                cursor.execute("INSERT INTO tags (name) VALUES (%s)", (tag_name,))
                                tag_id = cursor.lastrowid
                                self.logger.info(f"✓ 创建新标签: '{tag_name}' (ID: {tag_id})")
                            else:
                                tag_id = tag_result[0]
                                self.logger.info(f"✓ 使用现有标签: '{tag_name}' (ID: {tag_id})")
                            
                            # 检查是否已经存在关联
                            cursor.execute(
                                "SELECT COUNT(*) FROM anime_tags WHERE anime_id = %s AND tag_id = %s",
                                (anime_id, tag_id)
                            )
                            exists = cursor.fetchone()[0]
                            
                            if exists == 0:
                                # 关联anime和tag
                                cursor.execute(
                                    "INSERT INTO anime_tags (anime_id, tag_id) VALUES (%s, %s)",
                                    (anime_id, tag_id)
                                )
                                self.logger.info(f"✓ 已关联 anime_id={anime_id} 和 tag_id={tag_id}")
                            else:
                                self.logger.info(f"ℹ 关联已存在 anime_id={anime_id} 和 tag_id={tag_id}")
                            
                            tag_count += 1
                            
                        except Exception as tag_error:
                            self.logger.error(f"✗ 处理标签 '{tag_name}' 失败: {tag_error}")
                            import traceback
                            self.logger.error(f"详细错误信息: {traceback.format_exc()}")
                            continue
                
                self.logger.info(f"✓ 成功处理了 {tag_count}/{len(tags)} 个标签")
            else:
                self.logger.warning(f"✗ 没有有效的标签数据, 标签类型: {type(tags)}, 内容: {tags}")
            
            connection.commit()
            
            # 日志信息显示域名前缀配置状态
            domain_status = f"域名前缀: {domain_prefix}" if domain_prefix else "使用相对路径"
            self.logger.info(f"视频信息已保存到数据库: {chinese_title} (ID: {anime_id}, 观看数: {view_count}, 剧照数: {len(fanart_paths)}, {domain_status})")
            return True
            
        except Exception as e:
            self.logger.error(f"保存到数据库失败: {e}")
            connection.rollback()
            return False
        finally:
            connection.close()
    
    # ===== NFO文件生成 =====
    
    def generate_nfo(self, info):
        """生成NFO文件内容"""
        title = info.get('title', '未知标题')
        plot = info.get('plot', '<![CDATA[暂无剧情简介]]>')
        outline = info.get('outline', '<![CDATA[暂无概要]]>')
        tagline = info.get('tagline', '')
        year = info.get('year', '2025')
        premiered = info.get('premiered', f'{year}-01-01')
        releasedate = info.get('releasedate', premiered)
        release = info.get('release', premiered)
        studio = info.get('studio', '未知制作商')
        maker = info.get('maker', studio)
        customrating = info.get('customrating', '里番')
        lockdata = info.get('lockdata', 'False')
        mpaa = info.get('mpaa', '里番')
        uncensored = info.get('uncensored', 'False')
        sorttitle = info.get('sorttitle', title)
        originaltitle = info.get('originaltitle', title)
        set_name = info.get('set', '')
        
        xml_content = ['<?xml version="1.0" encoding="utf-8" standalone="yes"?>']
        xml_content.append('<movie>')
        
        xml_content.append(f'  <plot>{plot}</plot>')
        xml_content.append(f'  <outline>{outline}</outline>')
        xml_content.append(f'  <customrating>{customrating}</customrating>')
        xml_content.append(f'  <lockdata>{lockdata.lower()}</lockdata>')
        xml_content.append(f'  <title>{escape(title)}</title>')
        xml_content.append(f'  <originaltitle>{escape(originaltitle)}</originaltitle>')
        xml_content.append(f'  <year>{year}</year>')
        xml_content.append(f'  <sorttitle>{escape(sorttitle)}</sorttitle>')
        xml_content.append(f'  <mpaa>{mpaa}</mpaa>')
        xml_content.append(f'  <premiered>{premiered}</premiered>')
        xml_content.append(f'  <releasedate>{releasedate}</releasedate>')
        
        if tagline:
            xml_content.append(f'  <tagline>{escape(tagline)}</tagline>')
        
        tags = info.get('tag', [])
        if tags:
            for tag in tags:
                xml_content.append(f'  <tag>{escape(tag)}</tag>')
        
        genres = info.get('genre', tags)
        if genres:
            for genre in genres:
                xml_content.append(f'  <genre>{escape(genre)}</genre>')
        
        xml_content.append(f'  <studio>{escape(studio)}</studio>')
        
        if set_name:
            xml_content.append('  <set>')
            xml_content.append(f'    <name>{escape(set_name)}</name>')
            xml_content.append('  </set>')
        
        xml_content.append(f'  <maker>{escape(maker)}</maker>')
        xml_content.append(f'  <release>{release}</release>')
        xml_content.append(f'  <uncensored>{uncensored}</uncensored>')
        xml_content.append('</movie>')
        
        return '\n'.join(xml_content)
    
    # ===== 主要执行方法 =====
    
    def run_full_crawl(self):
        """执行完整的爬虫流程"""
        self.logger.info("开始执行统一爬虫流程")
        
        # 1. 爬取Hanime1.me视频和基本信息
        self.logger.info("步骤1: 爬取Hanime1.me视频")
        self.crawl_hanime_videos()
        
        self.logger.info("统一爬虫流程完成")
    
    def crawl_by_title(self, title):
        """根据标题进行完整爬虫"""
        self.logger.info(f"开始爬取标题: {title}")
        
        # 1. 获取Hanime信息
        hanime_info = self.scrape_hanime_info_by_title(title)
        
        # 2. 搜索并下载Getchu图片
        getchu_url = self.search_getchu(title)
        if getchu_url:
            image_urls = self.get_getchu_info(getchu_url)
            if image_urls:
                self.download_getchu_images(image_urls, title)
        
        # 3. 生成NFO文件
        if hanime_info:
            nfo_content = self.generate_nfo(hanime_info)
            nfo_filename = f"{title}.nfo"
            with open(nfo_filename, 'w', encoding='utf-8') as f:
                f.write(nfo_content)
            self.logger.info(f"NFO文件已生成: {nfo_filename}")
        
        return hanime_info
    
    def scrape_hanime_info_by_title(self, title):
        """通过标题搜索hanime1.me信息"""
        try:
            search_url = "https://hanime1.me/search"
            response = self.scraper.get(
                search_url, 
                params={'query': title}, 
                headers=self.headers, 
                timeout=10
            )
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            video_links = [
                f"https://hanime1.me{link.get('href')}" 
                for link in soup.select('a[href*="/watch?v="]') 
                if link.get('href')
            ]
            
            if not video_links:
                self.logger.warning(f"未找到视频: {title}")
                return {}
            
            # 使用第一个匹配结果
            video_id_match = re.search(r'v=(\d+)', video_links[0])
            if video_id_match:
                return self.scrape_hanime_info(video_id_match.group(1))
            
            return {}
            
        except Exception as e:
            self.logger.error(f"通过标题搜索hanime失败: {e}")
            return {}


# 使用示例
if __name__ == "__main__":
    # 创建统一爬虫实例
    crawler = UnifiedCrawler()
    
    # 执行完整爬虫流程
    # crawler.run_full_crawl()
    
    # 或者根据特定标题爬取
    test_title = "完堕ちX寝取られ家族 The Animation 後編"
    crawler.crawl_by_title(test_title)