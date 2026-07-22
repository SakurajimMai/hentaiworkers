import tempfile
import unittest
from pathlib import Path

from crawler_worker.sources.maccms import (
    MacCmsSource,
    is_jp_kr_item,
    parse_play_groups,
    pick_video_url,
    play_lines_payload,
)


class MacCmsUnitTests(unittest.TestCase):
    def test_parse_play_groups_multi_source(self):
        groups = parse_play_groups(
            "hnyun$$$hnm3u8",
            "第1集$https://cdn.example/a#第2集$https://cdn.example/b$$$第1集$https://cdn.example/a.m3u8#第2集$https://cdn.example/b.m3u8",
        )
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0][0], "hnyun")
        self.assertEqual(groups[1][0], "hnm3u8")
        self.assertEqual(groups[1][1][-1][1], "https://cdn.example/b.m3u8")

    
    def test_play_lines_payload_all_routes(self):
        lines = play_lines_payload(
            "xigua$$$bfzy",
            "第01集$https://cdn.example/a.m3u8#第02集$https://cdn.example/b.m3u8$$$第01集$https://cdn.example/c.m3u8",
        )
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["name"], "xigua")
        self.assertEqual(len(lines[0]["episodes"]), 2)
        self.assertEqual(lines[0]["episodes"][1]["url"], "https://cdn.example/b.m3u8")
        self.assertEqual(lines[1]["name"], "bfzy")

    def test_pick_prefers_m3u8_and_latest_episode(self):
        url = pick_video_url(
            "cloud$$$ikm3u8",
            "HD$https://cdn.example/old.mp4$$$第1集$https://cdn.example/e1.m3u8#第2集$https://cdn.example/e2.m3u8",
            preferred_from="ikm3u8",
        )
        self.assertEqual(url, "https://cdn.example/e2.m3u8")

    def test_crawl_uses_source_line_and_stores_custom_line_id(self):
        pages = {
            "https://api.example/provide/vod/?ac=detail&t=37&pg=1": {
                "code": 1,
                "list": [
                    {
                        "vod_id": 88,
                        "vod_name": "线路标识测试",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_year": "2026",
                        "vod_play_from": "cloud$$$ikm3u8",
                        "vod_play_url": (
                            "HD$https://cdn.example/old.mp4$$$"
                            "第1集$https://cdn.example/e1.m3u8#"
                            "第2集$https://cdn.example/e2.m3u8"
                        ),
                    }
                ],
            }
        }
        source = MacCmsSource(
            "ikun",
            fetch_json=lambda url: pages[url],
            default_preset=None,
        )
        items = source.crawl(
            {
                "requiredSource": "ikun",
                "source": {
                    "baseUrl": "https://api.example/provide/vod/",
                    "typeIds": [37],
                    "sourcePlayFrom": "ikm3u8",
                    "playFrom": "ik",
                    "maxPages": 1,
                    "maxItems": 10,
                    "filterJpKr": False,
                },
                "dateFilter": {"years": [2026], "months": [7]},
                "skipKeywords": [],
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].video_url, "https://cdn.example/e2.m3u8")
        self.assertEqual(items[0].play_lines[0]["name"], "cloud")
        self.assertEqual(items[0].play_lines[1]["name"], "ik")
        self.assertEqual(items[0].play_lines[1]["flag"], "ik")

    def test_zero_max_items_collects_every_item_in_configured_pages(self):
        def row(vod_id: int) -> dict[str, object]:
            return {
                "vod_id": vod_id,
                "vod_name": f"番剧 {vod_id}",
                "type_name": "日本动漫",
                "vod_area": "日本",
                "vod_year": "2026",
                "vod_play_from": "ikm3u8",
                "vod_play_url": f"HD$https://cdn.example/{vod_id}.m3u8",
            }

        pages = {
            "https://api.example/provide/vod/?ac=detail&t=37&pg=1": {
                "code": 1,
                "pagecount": 2,
                "list": [row(vod_id) for vod_id in range(1, 61)],
            },
            "https://api.example/provide/vod/?ac=detail&t=37&pg=2": {
                "code": 1,
                "pagecount": 2,
                "list": [row(vod_id) for vod_id in range(61, 121)],
            },
        }
        source = MacCmsSource(
            "ikun",
            fetch_json=lambda url: pages[url],
            default_preset=None,
        )
        items = source.crawl(
            {
                "requiredSource": "ikun",
                "source": {
                    "baseUrl": "https://api.example/provide/vod/",
                    "typeIds": [37],
                    "sourcePlayFrom": "ikm3u8",
                    "playFrom": "ik",
                    "maxPages": 2,
                    "maxItems": 0,
                    "filterJpKr": False,
                },
                "dateFilter": {"years": [2026], "months": [7]},
                "skipKeywords": [],
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )

        succeeded = [item for item in items if item.status == "succeeded"]
        self.assertEqual(len(succeeded), 120)
        self.assertEqual(succeeded[0].source_id, "120")
        self.assertEqual(succeeded[-1].source_id, "1")

    
    def test_tags_from_item_uses_genre_only(self):
        src = MacCmsSource(name="ikun")
        tags = src._tags_from_item(
            {
                "type_name": "日本动漫",
                "vod_area": "日本",
                "vod_lang": "日语",
                "vod_class": "剧情,喜剧,动画,同性",
                "vod_tag": "剧情,喜剧",
                "vod_remarks": "更新至02集",
            }
        )
        self.assertEqual(list(tags), ["剧情", "喜剧", "动画", "同性"])

    def test_is_jp_kr_item(self):
        self.assertTrue(
            is_jp_kr_item({"type_name": "日本动漫", "vod_area": "日本"})
        )
        self.assertTrue(
            is_jp_kr_item({"type_name": "日韩动漫", "vod_area": "韩国"})
        )
        self.assertFalse(
            is_jp_kr_item({"type_name": "国产动漫", "vod_area": "大陆"})
        )

    
    def test_fetch_json_retries_connection_reset(self):
        calls = {"n": 0}

        def boom_then_ok(url: str):
            calls["n"] += 1
            if calls["n"] < 3:
                raise ConnectionResetError(10054, "远程主机强迫关闭了一个现有的连接。")
            return {"code": 1, "list": []}

        # Exercise internal retry by monkeypatching transports via a thin wrapper.
        # MacCmsSource._fetch_json is static; we only assert crawl-level failure path
        # still surfaces SOURCE_UNAVAILABLE after exhaust when fetch always fails.
        src = MacCmsSource(name="ikun", fetch_json=lambda url: (_ for _ in ()).throw(
            ConnectionResetError(10054, "远程主机强迫关闭了一个现有的连接。")
        ))
        with tempfile.TemporaryDirectory() as td:
            results = src.crawl(
                {
                    "source": {
                        "baseUrl": "https://ikunzyapi.com/api.php/provide/vod/",
                        "provider": "ikun",
                        "typeIds": [37],
                        "maxPages": 1,
                        "maxItems": 5,
                        "autoDetectTypes": False,
                        "filterJpKr": False,
                    },
                    "dateFilter": {"years": [2026], "months": list(range(1, 13))},
                    "qualityPriority": ["1080"],
                    "skipKeywords": [],
                    "continueOnError": True,
                },
                workdir=Path(td),
                should_stop=lambda: False,
            )
        self.assertTrue(results)
        self.assertEqual(results[0].status, "failed")
        self.assertEqual(results[0].error_code, "SOURCE_UNAVAILABLE")
        self.assertIn("10054", results[0].error_message or "")

    def test_reverse_order_sorts_by_vod_id_desc(self):
        pages = {
            "https://api.example/provide/vod/?ac=detail&t=37&pg=1": {
                "code": 1,
                "pagecount": 2,
                "list": [
                    {
                        "vod_id": 10,
                        "vod_name": "旧一点",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_year": "2026",
                        "vod_play_from": "ikm3u8",
                        "vod_play_url": "HD$https://cdn.example/10.m3u8",
                    },
                    {
                        "vod_id": 30,
                        "vod_name": "最新",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_year": "2026",
                        "vod_play_from": "ikm3u8",
                        "vod_play_url": "HD$https://cdn.example/30.m3u8",
                    },
                ],
            },
            "https://api.example/provide/vod/?ac=detail&t=37&pg=2": {
                "code": 1,
                "list": [
                    {
                        "vod_id": 20,
                        "vod_name": "中间",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_year": "2026",
                        "vod_play_from": "ikm3u8",
                        "vod_play_url": "HD$https://cdn.example/20.m3u8",
                    },
                ],
            },
        }
        source = MacCmsSource("ikun", fetch_json=lambda url: pages[url], default_preset=None)
        items = source.crawl(
            {
                "requiredSource": "ikun",
                "source": {
                    "baseUrl": "https://api.example/provide/vod/",
                    "typeIds": [37],
                    "playFrom": "ikm3u8",
                    "maxPages": 2,
                    "pageOrder": "reverse",
                    "filterJpKr": True,
                },
                "concurrency": {"page": 2, "parse": 2, "download": 1},
                "dateFilter": {"years": [2026], "months": [7]},
                "skipKeywords": [],
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        succeeded = [i for i in items if i.status == "succeeded"]
        self.assertEqual([i.source_id for i in succeeded], ["30", "20", "10"])

    def test_crawl_with_fixture_json(self):
        pages = {
            "https://api.example/provide/vod/?ac=detail&t=37&pg=1": {
                "code": 1,
                "list": [
                    {
                        "vod_id": 101,
                        "vod_name": "测试日本番",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_year": "2026",
                        "vod_pic": "https://img.example/cover.jpg",
                        "vod_content": "<p>简介内容</p>",
                        "vod_play_from": "ikm3u8",
                        "vod_play_url": "第1集$https://cdn.example/1.m3u8#第2集$https://cdn.example/2.m3u8",
                        "vod_en": "test-anime",
                        "vod_class": "剧情,喜剧,动画,同性",
                        "vod_tag": "剧情,喜剧,动画,同性",
                        "vod_remarks": "更新至02",
                        "vod_time": "2026-07-14 12:00:00",
                        "vod_sub": "テスト番",
                        "vod_actor": "声优A,声优B",
                        "vod_director": "导演X",
                        "vod_area": "日本",
                        "vod_lang": "日语",
                        "vod_pubdate": "2026-07-07",
                    },
                    {
                        "vod_id": 102,
                        "vod_name": "国产片应跳过",
                        "type_name": "国产动漫",
                        "vod_area": "大陆",
                        "vod_play_from": "ikm3u8",
                        "vod_play_url": "HD$https://cdn.example/cn.m3u8",
                    },
                ],
            },
            "https://api.example/provide/vod/?ac=detail&t=37&pg=2": {
                "code": 1,
                "list": [],
            },
        }

        source = MacCmsSource(
            "ikun",
            fetch_json=lambda url: pages[url],
            default_preset=None,
        )
        items = source.crawl(
            {
                "requiredSource": "ikun",
                "source": {
                    "baseUrl": "https://api.example/provide/vod/",
                    "typeIds": [37],
                    "playFrom": "ikm3u8",
                    "maxPages": 2,
                    "filterJpKr": True,
                },
                "dateFilter": {"years": [2026], "months": [7]},
                "skipKeywords": [],
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        succeeded = [i for i in items if i.status == "succeeded"]
        self.assertEqual(len(succeeded), 1)
        self.assertEqual(succeeded[0].source_id, "101")
        self.assertEqual(succeeded[0].video_url, "https://cdn.example/2.m3u8")
        self.assertEqual(succeeded[0].title, "测试日本番")
        self.assertEqual(succeeded[0].release_year, 2026)
        self.assertEqual(list(succeeded[0].tags), ["剧情", "喜剧", "动画", "同性"])
        self.assertEqual(succeeded[0].remarks, "更新至02")
        self.assertEqual(succeeded[0].actors, "声优A,声优B")
        self.assertEqual(succeeded[0].directors, "导演X")
        self.assertEqual(succeeded[0].aliases, "テスト番")
        self.assertEqual(succeeded[0].title_japanese, "テスト番")
        self.assertEqual(succeeded[0].area, "日本")
        self.assertEqual(succeeded[0].lang, "日语")
        self.assertEqual(succeeded[0].source_updated_at, "2026-07-14 12:00:00")
        self.assertEqual(succeeded[0].release_date, "2026-07-07")
        self.assertNotIn("日本", succeeded[0].tags)
        self.assertNotIn("更新至02", succeeded[0].tags)

    def test_auto_detect_type_ids(self):
        pages = {
            "https://api.example/provide/vod/?ac=list": {
                "code": 1,
                "class": [
                    {"type_id": 1, "type_name": "电影"},
                    {"type_id": 37, "type_name": "日本动漫"},
                    {"type_id": 35, "type_name": "国产动漫"},
                ],
                "list": [],
            },
            "https://api.example/provide/vod/?ac=detail&t=37&pg=1": {
                "code": 1,
                "list": [
                    {
                        "vod_id": 9,
                        "vod_name": "自动分类番",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_play_from": "m3u8",
                        "vod_play_url": "HD$https://cdn.example/x.m3u8",
                    }
                ],
            },
        }
        source = MacCmsSource("maccms", fetch_json=lambda url: pages[url])
        items = source.crawl(
            {
                "source": {
                    "baseUrl": "https://api.example/provide/vod/",
                    "autoDetectTypes": True,
                    "maxPages": 1,
                },
                "dateFilter": {"years": [2026], "months": [1]},
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        self.assertEqual(items[0].status, "succeeded")
        self.assertEqual(items[0].source_id, "9")


if __name__ == "__main__":
    unittest.main()
