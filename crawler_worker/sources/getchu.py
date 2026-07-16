"""Getchu enrichment adapter — DTO only, no database."""

from __future__ import annotations

import re
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Sequence
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from crawler_worker.models.api import CrawlItemResult
from crawler_worker.sources.base import SourceAdapter, should_skip

_GETCHU_BASE = "https://www.getchu.com/"
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _normalize_item_url(url: str) -> str:
    match = re.search(r"(?:soft\.phtml\?id=|/item/)(\d+)", url)
    if not match:
        return urljoin(_GETCHU_BASE, url)
    return f"{_GETCHU_BASE}item/{match.group(1)}/?gc=gc"


def find_getchu_fanart(title: str, *, max_images: int = 50) -> tuple[str, ...]:
    """Legacy-compatible Getchu best-match lookup; returns original sample image URLs."""
    import requests

    encoded = urllib.parse.quote_plus(title, encoding="cp932", errors="ignore")
    search_url = (
        f"{_GETCHU_BASE}php/search.phtml?genre=all&search_keyword={encoded}&gc=gc"
    )
    headers = {"User-Agent": _USER_AGENT, "Referer": _GETCHU_BASE}
    search = requests.get(search_url, headers=headers, timeout=(10, 30))
    search.raise_for_status()
    soup = BeautifulSoup(search.content, "lxml")

    candidates: list[tuple[int, str]] = []
    lower_title = title.lower()
    for anchor in soup.select('a[href*="soft.phtml?id="], a[href*="/item/"]'):
        href = str(anchor.get("href") or "")
        text = anchor.get_text(" ", strip=True)
        if not href or not text:
            continue
        lower_text = text.lower()
        if text == title:
            score = 1000
        elif lower_text == lower_title:
            score = 900
        elif lower_title in lower_text:
            score = 500
        else:
            score = sum(50 for word in title.split() if word and word.lower() in lower_text)
        candidates.append((score, _normalize_item_url(href)))
    if not candidates:
        return ()

    detail_url = max(candidates, key=lambda row: row[0])[1]
    detail = requests.get(detail_url, headers=headers, timeout=(10, 30))
    detail.raise_for_status()
    detail_soup = BeautifulSoup(detail.content, "lxml")
    if "年齢認証" in detail_soup.get_text(" ", strip=True):
        return ()

    found: list[str] = []
    seen: set[str] = set()
    for anchor in detail_soup.select(
        'a[href*="sample"][href$=".jpg"], a[href*="package"][href$=".jpg"], '
        '#soft_table a[href$=".jpg"], div[align="center"] a[href$=".jpg"]'
    ):
        raw = str(anchor.get("href") or "")
        if not raw or re.search(r"_(?:s|\d+)\.jpg$", raw, re.I):
            continue
        url = urljoin(_GETCHU_BASE, raw)
        if url in seen:
            continue
        seen.add(url)
        found.append(url)
        if len(found) >= max(1, min(max_images, 50)):
            break
    return tuple(found)


class GetchuSource(SourceAdapter):
    name = "getchu"

    def crawl(
        self,
        snapshot: dict[str, Any],
        *,
        workdir: Path,
        should_stop: Callable[[], bool],
    ) -> Sequence[CrawlItemResult]:
        embedded = snapshot.get("fixtureItems") or []
        skips = tuple(snapshot.get("skipKeywords") or [])
        results: list[CrawlItemResult] = []
        for raw in embedded:
            if should_stop():
                break
            if not isinstance(raw, dict):
                continue
            title = str(raw.get("title", ""))
            sid = str(raw.get("id", ""))
            if should_skip(title, skips):
                results.append(
                    CrawlItemResult(
                        source=self.name,
                        source_id=sid,
                        title=title,
                        video_url=None,
                        cover_url=None,
                        tags=(),
                        status="skipped",
                    )
                )
                continue
            results.append(
                CrawlItemResult(
                    source=self.name,
                    source_id=sid,
                    title=title,
                    video_url=str(raw.get("video") or "") or None,
                    cover_url=raw.get("cover"),
                    tags=tuple(str(t) for t in (raw.get("tags") or ())),
                    status="succeeded" if raw.get("video") else "failed",
                )
            )
        workdir.mkdir(parents=True, exist_ok=True)
        return results
