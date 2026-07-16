import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from crawler_worker.sources.getchu import find_getchu_fanart
from crawler_worker.sources.hanime import HanimeSource


class HanimeLiveParsingTests(unittest.TestCase):
    def test_crawl_fetches_list_and_detail_and_normalizes_metadata(self):
        pages = {
            "https://source.example/search?genre=%E8%A3%8F%E7%95%AA&date=2026+%E5%B9%B4+7+%E6%9C%88": """
                <a href="/watch?v=42"><img src="/covers/42.jpg"></a>
            """,
            "https://source.example/watch?v=42": """
                <h3 id="shareBtn-title">Example episode</h3>
                <meta property="og:description" content="中文标题 - Example plot">
                <meta property="og:image" content="/covers/detail-42.jpg">
                <div>標籤</div><a>Drama</a><a>Series</a>
                <div id="player-div-wrapper"><div class="video-details-wrapper hidden-sm hidden-md hidden-lg hidden-xl">Studio&nbsp;2026-07-14</div></div>
            """,
            "https://source.example/download?v=42": """
                <button data-url="https://cdn.example/video-720.mp4">720p</button>
                <button data-url="https://cdn.example/video-1080.mp4">1080p</button>
            """, 
        }

        source = HanimeSource(fetch_html=lambda url: pages[url])
        items = source.crawl(
            {
                "source": {"baseUrl": "https://source.example"},
                "dateFilter": {"years": [2026], "months": [7]},
                "qualityPriority": ["1080", "720"],
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source_id, "42")
        self.assertEqual(items[0].title, "Example episode")
        self.assertEqual(items[0].video_url, "https://cdn.example/video-1080.mp4")
        self.assertEqual(items[0].cover_url, "https://source.example/covers/detail-42.jpg")
        self.assertEqual(items[0].tags, ("Drama", "Series"))
        self.assertEqual(items[0].description, "Example plot")
        self.assertEqual(items[0].title_english, "中文标题")
        self.assertEqual(items[0].release_year, 2026)

    def test_dynamic_watch_page_fallback_avoids_download_page(self):
        pages = {
            "https://source.example/search?genre=%E8%A3%8F%E7%95%AA&date=2026+%E5%B9%B4+7+%E6%9C%88": '<a href="/watch?v=42"></a>',
            "https://source.example/watch?v=42": '<h1>[1080p] Dynamic title</h1>',
        }
        requested: list[str] = []

        def fetch(url: str) -> str:
            requested.append(url)
            return pages[url]

        source = HanimeSource(
            fetch_html=fetch,
            fetch_dynamic_html=lambda _url: '<video src="https://cdn.example/dynamic-1080.mp4"></video>',
        )
        items = source.crawl(
            {
                "source": {"baseUrl": "https://source.example"},
                "dateFilter": {"years": [2026], "months": [7]},
                "qualityPriority": ["1080"],
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        self.assertEqual(items[0].title, "Dynamic title")
        self.assertEqual(items[0].video_url, "https://cdn.example/dynamic-1080.mp4")
        self.assertFalse(any("/download?" in url for url in requested))

    def test_getchu_enrichment_selects_exact_match_and_original_samples(self):
        class Response:
            def __init__(self, html: str):
                self.content = html.encode("utf-8")

            def raise_for_status(self) -> None:
                return None

        search = '''
            <a href="/item/111/">Wrong title</a>
            <a href="soft.phtml?id=222">Exact Work</a>
        '''
        detail = '''
            <div id="soft_table">
              <a href="/brandnew/222/sample1.jpg">sample</a>
              <a href="/brandnew/222/sample1_s.jpg">thumbnail</a>
              <a href="/brandnew/222/sample2.jpg">sample</a>
            </div>
        '''

        def fake_get(url: str, **_kwargs):  # type: ignore[no-untyped-def]
            return Response(detail if "/item/222/" in url else search)

        with patch("requests.get", side_effect=fake_get):
            urls = find_getchu_fanart("Exact Work", max_images=10)

        self.assertEqual(
            urls,
            (
                "https://www.getchu.com/brandnew/222/sample1.jpg",
                "https://www.getchu.com/brandnew/222/sample2.jpg",
            ),
        )

    def test_request_delay_happens_between_detail_fetches(self):
        pages = {
            "https://source.example/search?genre=%E8%A3%8F%E7%95%AA&date=2026+%E5%B9%B4+7+%E6%9C%88": """
                <a href="/watch?v=41"></a>
                <a href="/watch?v=42"></a>
            """,
            "https://source.example/watch?v=41": '<h1>One</h1>',
            "https://source.example/watch?v=42": '<h1>Two</h1>',
            "https://source.example/download?v=41": '<video src="https://cdn.example/a.mp4"></video>',
            "https://source.example/download?v=42": '<video src="https://cdn.example/b.mp4"></video>',
        }
        sleeps: list[float] = []
        source = HanimeSource(
            fetch_html=lambda url: pages[url],
            sleep=lambda seconds: sleeps.append(seconds),
        )
        items = source.crawl(
            {
                "source": {"baseUrl": "https://source.example"},
                "dateFilter": {"years": [2026], "months": [7]},
                "qualityPriority": ["1080"],
                "requestDelaySeconds": 1.5,
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        self.assertEqual(len(items), 2)
        self.assertEqual(sleeps, [1.5])

    def test_fetch_rejects_non_http_source_url(self):
        source = HanimeSource(fetch_html=lambda _url: "")
        items = source.crawl(
            {
                "source": {"baseUrl": "file:///etc/passwd"},
                "dateFilter": {"years": [2026], "months": [7]},
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        self.assertEqual(items[0].status, "failed")
        self.assertEqual(items[0].error_code, "RESULT_INVALID")

    def test_fixture_items_are_not_a_runtime_data_source(self):
        source = HanimeSource(fetch_html=lambda _url: "")
        items = source.crawl(
            {
                "source": {"baseUrl": ""},
                "fixtureItems": [
                    {"id": "mock-1", "title": "Mock", "videos": ["1080.mp4"]}
                ],
                "dateFilter": {"years": [2026], "months": [7]},
            },
            workdir=Path(tempfile.mkdtemp()),
            should_stop=lambda: False,
        )
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].status, "failed")
        self.assertEqual(items[0].error_code, "RESULT_INVALID")
        self.assertNotEqual(items[0].source_id, "mock-1")


if __name__ == "__main__":
    unittest.main()
