#!/usr/bin/env python3
"""字幕过滤单测（不访问网络、不连库）。"""

from __future__ import annotations

import unittest
from unified_crawler import UnifiedCrawler


class Dummy(UnifiedCrawler):
    def __init__(self):
        # bypass full init
        self.config = self.get_default_config()
        crawl = self.config["crawl"]
        self.NO_SUBTITLE_MARKERS = tuple(crawl["no_subtitle_markers"])
        self.SKIP_KEYWORDS = tuple(crawl["skip_keywords"])
        self.SUBTITLE_POSITIVE_MARKERS = tuple(crawl["subtitle_positive_markers"])
        self.REQUIRE_CHINESE_SUBTITLE = True


class SubtitleFilterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.c = Dummy()

    def test_skip_no_subtitle_markers(self) -> None:
        for title in [
            "某作品 [無字幕]",
            "某作品 [无字幕]",
            "某作品 無字",
            "某作品 生肉",
            "某作品 無中字",
        ]:
            reason = self.c.skip_reason(title)
            self.assertIsNotNone(reason, title)
            self.assertIn("无字幕", reason)

    def test_skip_houbu(self) -> None:
        reason = self.c.skip_reason("某作品 中字後補")
        self.assertIsNotNone(reason)
        self.assertTrue("屏蔽" in reason or "後補" in reason or "补" in reason)

    def test_keep_bracket_chinese_sub(self) -> None:
        title = "出張あるある2☆朝起きたら後輩ちゃんにち〇ぽ入ってた話♡ [中文字幕]"
        self.assertIsNone(self.c.skip_reason(title))

    def test_keep_chinese_display_title(self) -> None:
        # 站内中文 UI 标题，常无 [中文字幕] 括号
        self.assertIsNone(self.c.skip_reason("鄉下幾乎沒有娛樂活動 2"))

    def test_keep_when_tag_has_chinese_sub(self) -> None:
        # 日文标题无括号，但标签带 中文字幕
        title = "妖狐巫女⑤：縛られた狐②"
        self.assertIsNone(
            self.c.skip_reason(title, extra_texts=["中文字幕", "巨乳"])
        )

    def test_skip_japanese_without_sub_evidence(self) -> None:
        title = "絶対に負けたくない女 vs 絶対に気を散らせたい男②"
        reason = self.c.skip_reason(title)
        self.assertIsNotNone(reason)
        self.assertIn("中文字幕", reason)

    def test_zhongzi_not_matched_as_wuzhongzi(self) -> None:
        # 无中字 应走无字幕标识，不能当正面「中字」
        reason = self.c.skip_reason("作品 无中字")
        self.assertIsNotNone(reason)


if __name__ == "__main__":
    unittest.main()
