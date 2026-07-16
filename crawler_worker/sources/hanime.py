"""Hanime source adapter: list pages -> detail/download pages -> normalized DTOs."""

from __future__ import annotations

import ipaddress
import re
import socket
import time
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

from bs4 import BeautifulSoup

from crawler_worker.models.api import CrawlItemResult
from crawler_worker.sources.base import SourceAdapter, select_quality, should_skip

_MAX_HTML_BYTES = 4 * 1024 * 1024
_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _is_public_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or address.is_reserved
    )


def _is_safe_http_url(value: str, *, resolve_dns: bool = False) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        hostname = parsed.hostname.rstrip(".").lower()
        if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
            return False
        try:
            address = ipaddress.ip_address(hostname)
            return _is_public_address(address)
        except ValueError:
            if not resolve_dns:
                return True
            addresses = {
                item[4][0]
                for item in socket.getaddrinfo(hostname, parsed.port or 443, type=socket.SOCK_STREAM)
            }
            return bool(addresses) and all(
                _is_public_address(ipaddress.ip_address(address)) for address in addresses
            )
    except (OSError, ValueError):
        return False


def _strip_brackets(title: str) -> str:
    """Legacy filename/title behavior: remove [group/quality] blocks and collapse spaces."""
    return re.sub(r"\s+", " ", re.sub(r"\s*\[[^\]]+\]\s*", " ", title)).strip()


def _unique(values: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in values:
        value = raw.strip()
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return tuple(result)


class HanimeSource(SourceAdapter):
    name = "hanime"

    def __init__(
        self,
        fetch_html: Callable[[str], str] | None = None,
        fetch_dynamic_html: Callable[[str], str] | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self._fetch = fetch_html or self._fetch_html
        self._fetch_dynamic = fetch_dynamic_html or self._fetch_dynamic_html
        self._sleep = sleep or time.sleep

    @staticmethod
    def _fetch_html(url: str) -> str:
        if not _is_safe_http_url(url, resolve_dns=True):
            raise ValueError("source URL must be a public HTTP(S) URL")
        try:
            import cloudscraper

            session = cloudscraper.create_scraper()
        except ImportError:
            import requests

            session = requests.Session()
        response = session.get(
            url,
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
            timeout=(10, 30),
            allow_redirects=True,
        )
        response.raise_for_status()
        if not _is_safe_http_url(str(response.url), resolve_dns=True):
            raise ValueError("source redirected to a non-public URL")
        length = int(response.headers.get("content-length") or 0)
        if length > _MAX_HTML_BYTES or len(response.content) > _MAX_HTML_BYTES:
            raise ValueError("source response is too large")
        response.encoding = response.apparent_encoding or response.encoding or "utf-8"
        return str(response.text)

    @staticmethod
    def _fetch_dynamic_html(url: str) -> str:
        """Selenium fallback retained from the legacy crawler for JS-rendered video sources."""
        if not _is_safe_http_url(url, resolve_dns=True):
            raise ValueError("dynamic source URL must be a public HTTP(S) URL")
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--remote-debugging-pipe")
        options.add_argument("--disable-logging")
        options.add_argument("--log-level=3")
        options.add_argument(f"--user-agent={_USER_AGENT}")
        driver = webdriver.Chrome(options=options)
        try:
            driver.set_page_load_timeout(30)
            driver.get(url)
            return str(driver.page_source)
        finally:
            driver.quit()

    def crawl(
        self,
        snapshot: dict[str, Any],
        *,
        workdir: Path,
        should_stop: Callable[[], bool],
    ) -> Sequence[CrawlItemResult]:
        source = snapshot.get("source") if isinstance(snapshot.get("source"), dict) else {}
        base_url = str(source.get("baseUrl") or snapshot.get("baseUrl") or "").rstrip("/")
        priority = tuple(str(v) for v in (snapshot.get("qualityPriority") or ["1080", "720"]))
        skips = tuple(str(v) for v in (snapshot.get("skipKeywords") or []))

        embedded = snapshot.get("fixtureItems")
        if isinstance(embedded, list):
            return self._from_fixture(embedded, priority, skips, should_stop)

        if not _is_safe_http_url(base_url):
            return [self._failure("source", "RESULT_INVALID", "invalid source base URL")]

        date_filter = snapshot.get("dateFilter") if isinstance(snapshot.get("dateFilter"), dict) else {}
        years = [int(v) for v in (date_filter.get("years") or [])]
        months = [int(v) for v in (date_filter.get("months") or [])]
        if not years or not months:
            return [self._failure("source", "RESULT_INVALID", "date filter is required")]

        workdir.mkdir(parents=True, exist_ok=True)
        discovered: dict[str, tuple[str, str | None]] = {}
        failures: list[CrawlItemResult] = []
        for year in years:
            for month in months:
                if should_stop():
                    return failures
                list_url = self._build_search_url(base_url, source, year, month)
                try:
                    html = self._fetch(list_url)
                    (workdir / f"list-{year}-{month:02d}.html").write_text(html, encoding="utf-8")
                    for source_id, watch_url, cover_url in self.parse_list_entries(html, base_url):
                        discovered.setdefault(source_id, (watch_url, cover_url))
                except Exception as exc:
                    failures.append(
                        self._failure(
                            f"search:{year}-{month:02d}",
                            "SOURCE_UNAVAILABLE",
                            str(exc),
                        )
                    )

        results: list[CrawlItemResult] = []
        max_items = max(0, int(snapshot.get("maxItems") or 0))
        request_delay = max(
            0.0,
            min(30.0, float(snapshot.get("requestDelaySeconds") or 0)),
        )
        entries = list(discovered.items())[:max_items or None]
        for index, (source_id, (watch_url, list_cover)) in enumerate(entries):
            if should_stop():
                break
            try:
                detail_html = self._fetch(watch_url)
                (workdir / f"detail-{source_id}.html").write_text(detail_html, encoding="utf-8")
                item = self.parse_detail_html(
                    detail_html,
                    source_id=source_id,
                    watch_url=watch_url,
                    cover_fallback=list_cover,
                    priority=priority,
                )
                # Legacy behavior: browser-rendered watch page before trying /download.
                if not item.video_url:
                    try:
                        dynamic_html = self._fetch_dynamic(watch_url)
                        item = self._with_video_from_download(
                            item, dynamic_html, watch_url, priority
                        )
                    except Exception:
                        pass
                if not item.video_url:
                    download_url = urljoin(base_url + "/", f"download?v={source_id}")
                    download_html = self._fetch(download_url)
                    item = self._with_video_from_download(item, download_html, download_url, priority)
                    if not item.video_url:
                        try:
                            dynamic_download = self._fetch_dynamic(download_url)
                            item = self._with_video_from_download(
                                item, dynamic_download, download_url, priority
                            )
                        except Exception:
                            pass
                if should_skip(item.title, skips):
                    item = replace(
                        item,
                        video_url=None,
                        status="skipped",
                        error_code=None,
                        error_message=None,
                    )
                elif not item.video_url:
                    item = replace(
                        item,
                        video_url=None,
                        status="failed",
                        error_code="RESULT_INVALID",
                        error_message="no video source",
                    )
                results.append(item)
            except Exception as exc:
                results.append(self._failure(source_id, "SOURCE_UNAVAILABLE", str(exc)))
            if index + 1 < len(entries) and request_delay > 0:
                self._sleep(request_delay)

        return [*results, *failures]

    @staticmethod
    def _build_search_url(base_url: str, source: dict[str, Any], year: int, month: int) -> str:
        params: list[tuple[str, str]] = []
        for key, query_key in (("query", "query"), ("type", "type"), ("genre", "genre"), ("sort", "sort")):
            value = source.get(key)
            # The old crawler explicitly restricted Hanime searches to 裏番.
            if key == "genre" and not value:
                value = "裏番"
            if value:
                params.append((query_key, str(value)))
        params.append(("date", f"{year} 年 {month} 月"))
        if source.get("duration"):
            params.append(("duration", str(source["duration"])))
        return f"{base_url}/search?{urlencode(params)}"

    @staticmethod
    def parse_list_entries(html: str, base_url: str) -> list[tuple[str, str, str | None]]:
        soup = BeautifulSoup(html, "lxml")
        rows: list[tuple[str, str, str | None]] = []
        seen: set[str] = set()
        for anchor in soup.select('a[href*="/watch?"]'):
            href = str(anchor.get("href") or "")
            watch_url = urljoin(base_url + "/", href)
            source_id = (parse_qs(urlparse(watch_url).query).get("v") or [""])[0]
            if not source_id or source_id in seen:
                continue
            seen.add(source_id)
            image = anchor.select_one("img")
            raw_cover = str((image.get("src") or image.get("data-src") or "") if image else "")
            cover = urljoin(watch_url, raw_cover) if raw_cover else None
            rows.append((source_id, watch_url, cover))
        return rows

    @staticmethod
    def parse_detail_html(
        html: str,
        *,
        source_id: str,
        watch_url: str,
        cover_fallback: str | None,
        priority: Sequence[str],
    ) -> CrawlItemResult:
        soup = BeautifulSoup(html, "lxml")

        def meta(name: str) -> str | None:
            node = soup.select_one(f'meta[property="{name}"]') or soup.select_one(f'meta[name="{name}"]')
            value = str(node.get("content") or "").strip() if node else ""
            return value or None

        heading = soup.select_one("#shareBtn-title, h1")
        title = meta("og:title") or (heading.get_text(" ", strip=True) if heading else "")
        title = _strip_brackets(
            re.sub(r"\s*[-|]\s*Hanime.*$", "", title, flags=re.I).strip()
        ) or f"video-{source_id}"

        description = meta("og:description") or meta("description")
        localized_title = None
        if description and " - " in description:
            localized_title, description = (part.strip() for part in description.split(" - ", 1))
            localized_title = re.sub(r"\s*\[.*\]$", "", localized_title).strip() or None

        raw_cover = meta("og:image") or cover_fallback
        cover = urljoin(watch_url, raw_cover) if raw_cover else None

        tag_values = [
            node.get_text(" ", strip=True)
            for node in soup.select('#video-tags a, .tags a, a[href*="genre="]')
        ]
        tag_heading = soup.find(
            lambda node: node.name == "div" and node.get_text(" ", strip=True) == "標籤"
        )
        if tag_heading:
            tag_values.extend(
                node.get_text(" ", strip=True) for node in tag_heading.find_next_siblings("a")
            )
        tags = _unique(tag_values)
        fanart = _unique(
            urljoin(watch_url, str(node.get("src") or node.get("data-src") or ""))
            for node in soup.select(".sample-images img, .gallery img, img[data-fanart]")
        )
        release_date = None
        time_node = soup.select_one("time[datetime]")
        if time_node:
            candidate = str(time_node.get("datetime") or "")[:10]
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
                release_date = candidate
        if not release_date:
            match = re.search(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b", soup.get_text(" "))
            if match:
                release_date = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
        release_year = int(release_date[:4]) if release_date else None

        candidates = HanimeSource._video_candidates(html, watch_url)
        chosen = HanimeSource._choose_video(candidates, priority)
        return CrawlItemResult(
            source="hanime",
            source_id=source_id,
            title=title,
            video_url=chosen,
            cover_url=cover,
            tags=tags,
            status="succeeded" if chosen else "failed",
            title_english=localized_title,
            title_japanese=title,
            description=description,
            fanart_urls=fanart,
            release_year=release_year,
            release_date=release_date,
            error_code=None if chosen else "RESULT_INVALID",
            error_message=None if chosen else "no video source",
            source_page_url=watch_url,
        )

    @staticmethod
    def _video_candidates(html: str, page_url: str) -> list[tuple[str, str]]:
        # Hanime sources are progressive MP4 downloads, not HLS playlists.
        soup = BeautifulSoup(html, "lxml")
        candidates: list[tuple[str, str]] = []
        seen: set[str] = set()
        for node in soup.select("source[src], video[src], [data-url], a[href]"):
            raw = str(node.get("src") or node.get("data-url") or node.get("href") or "")
            if not re.search(r"\.mp4(?:\?|$)", raw, re.I):
                continue
            url = urljoin(page_url, raw)
            if url in seen or not _is_safe_http_url(url):
                continue
            seen.add(url)
            label = str(node.get("label") or node.get_text(" ", strip=True) or url)
            candidates.append((label, url))
        for raw in re.findall(r'https?://[^"\'<>\s]+?\.mp4(?:\?[^"\'<>\s]*)?', html, re.I):
            url = raw.replace("\\/", "/")
            if url not in seen and _is_safe_http_url(url):
                seen.add(url)
                candidates.append((url, url))
        return candidates

    @staticmethod
    def _choose_video(
        candidates: Sequence[tuple[str, str]],
        priority: Sequence[str],
    ) -> str | None:
        for quality in priority:
            normalized = str(quality).lower().removesuffix("p")
            for label, url in candidates:
                haystack = f"{label} {url}".lower()
                if normalized in haystack:
                    return url
        return candidates[0][1] if candidates else None

    @staticmethod
    def _with_video_from_download(
        item: CrawlItemResult,
        html: str,
        page_url: str,
        priority: Sequence[str],
    ) -> CrawlItemResult:
        candidates = HanimeSource._video_candidates(html, page_url)
        chosen = HanimeSource._choose_video(candidates, priority)
        return replace(
            item,
            video_url=chosen,
            status="succeeded" if chosen else "failed",
            error_code=None if chosen else "RESULT_INVALID",
            error_message=None if chosen else "no video source",
            source_page_url=item.source_page_url or page_url,
        )

    def parse_list_html(
        self,
        html: str,
        *,
        priority: Sequence[str],
        skip_keywords: Sequence[str],
    ) -> list[CrawlItemResult]:
        pattern = re.compile(
            r'data-id="(?P<id>[^"]+)"[^>]*data-title="(?P<title>[^"]+)"[^>]*data-video="(?P<video>[^"]+)"',
            re.I,
        )
        results: list[CrawlItemResult] = []
        for match in pattern.finditer(html):
            title = match.group("title")
            skipped = should_skip(title, skip_keywords)
            candidates = match.group("video").split(",")
            chosen = None if skipped else select_quality(candidates, priority)
            results.append(
                CrawlItemResult(
                    source=self.name,
                    source_id=match.group("id"),
                    title=title,
                    video_url=chosen,
                    cover_url=None,
                    tags=(),
                    status="skipped" if skipped else ("succeeded" if chosen else "failed"),
                    error_code=None if skipped or chosen else "RESULT_INVALID",
                    error_message=None if skipped or chosen else "no quality",
                )
            )
        return results

    def _from_fixture(
        self,
        embedded: list[Any],
        priority: Sequence[str],
        skips: Sequence[str],
        should_stop: Callable[[], bool],
    ) -> list[CrawlItemResult]:
        out: list[CrawlItemResult] = []
        for raw in embedded:
            if should_stop():
                break
            if not isinstance(raw, dict):
                continue
            title = _strip_brackets(str(raw.get("title", "")))
            source_id = str(raw.get("id", ""))
            if should_skip(title, skips):
                out.append(
                    CrawlItemResult(
                        source=self.name,
                        source_id=source_id,
                        title=title,
                        video_url=None,
                        cover_url=None,
                        tags=tuple(str(tag) for tag in (raw.get("tags") or ())),
                        status="skipped",
                    )
                )
                continue
            videos = raw.get("videos") or []
            if isinstance(videos, str):
                videos = [videos]
            chosen = select_quality([str(value) for value in videos], priority)
            out.append(
                CrawlItemResult(
                    source=self.name,
                    source_id=source_id,
                    title=title,
                    video_url=chosen,
                    cover_url=str(raw.get("cover") or "") or None,
                    tags=tuple(str(tag) for tag in (raw.get("tags") or ())),
                    status="succeeded" if chosen else "failed",
                    title_english=str(raw.get("titleEnglish") or "") or None,
                    title_japanese=str(raw.get("titleJapanese") or title) or None,
                    description=str(raw.get("description") or "") or None,
                    fanart_urls=tuple(str(url) for url in (raw.get("fanartUrls") or ())),
                    release_year=int(raw["releaseYear"]) if raw.get("releaseYear") else None,
                    release_date=str(raw.get("releaseDate") or "") or None,
                    error_code=None if chosen else "RESULT_INVALID",
                    source_page_url=str(raw.get("sourcePageUrl") or "") or None,
                )
            )
        return out

    @staticmethod
    def _failure(
        source_id: str,
        code: str,
        message: str,
        title: str = "",
    ) -> CrawlItemResult:
        return CrawlItemResult(
            source="hanime",
            source_id=source_id,
            title=title or source_id,
            video_url=None,
            cover_url=None,
            tags=(),
            status="failed",
            error_code=code,
            error_message=message[:2000],
        )
