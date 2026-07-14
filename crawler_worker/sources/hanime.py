"""Hanime-like source adapter — pure parsing, no database."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable, Sequence

from crawler_worker.models.api import CrawlItemResult
from crawler_worker.sources.base import SourceAdapter, select_quality, should_skip


class HanimeSource(SourceAdapter):
    name = "hanime"

    def __init__(self, fetch_html: Callable[[str], str] | None = None) -> None:
        self._fetch = fetch_html

    def crawl(
        self,
        snapshot: dict[str, Any],
        *,
        workdir: Path,
        should_stop: Callable[[], bool],
    ) -> Sequence[CrawlItemResult]:
        source = snapshot.get("source") if isinstance(snapshot.get("source"), dict) else {}
        base_url = str(source.get("baseUrl") or snapshot.get("baseUrl") or "https://example.invalid")
        priority = tuple(snapshot.get("qualityPriority") or ["1080", "720"])
        skips = tuple(snapshot.get("skipKeywords") or [])

        # Fixture mode: snapshot may embed items for tests / offline shadow compare.
        embedded = snapshot.get("fixtureItems")
        if isinstance(embedded, list):
            return self._from_fixture(embedded, priority, skips, should_stop)

        if self._fetch is None:
            return [
                CrawlItemResult(
                    source=self.name,
                    source_id="noop",
                    title="no-fetch",
                    video_url=None,
                    cover_url=None,
                    tags=(),
                    status="skipped",
                    error_code="SOURCE_UNAVAILABLE",
                    error_message="fetch not configured",
                )
            ]

        if should_stop():
            return []
        html = self._fetch(base_url)
        workdir.mkdir(parents=True, exist_ok=True)
        (workdir / "list.html").write_text(html, encoding="utf-8")
        return self.parse_list_html(html, priority=priority, skip_keywords=skips)

    def parse_list_html(
        self,
        html: str,
        *,
        priority: Sequence[str],
        skip_keywords: Sequence[str],
    ) -> list[CrawlItemResult]:
        # Minimal deterministic parser for fixtures: data-id / data-title / data-video
        pattern = re.compile(
            r'data-id="(?P<id>[^"]+)"[^>]*data-title="(?P<title>[^"]+)"[^>]*data-video="(?P<video>[^"]+)"',
            re.I,
        )
        results: list[CrawlItemResult] = []
        for match in pattern.finditer(html):
            title = match.group("title")
            if should_skip(title, skip_keywords):
                results.append(
                    CrawlItemResult(
                        source=self.name,
                        source_id=match.group("id"),
                        title=title,
                        video_url=None,
                        cover_url=None,
                        tags=(),
                        status="skipped",
                    )
                )
                continue
            candidates = match.group("video").split(",")
            chosen = select_quality(candidates, priority)
            results.append(
                CrawlItemResult(
                    source=self.name,
                    source_id=match.group("id"),
                    title=title,
                    video_url=chosen,
                    cover_url=None,
                    tags=(),
                    status="succeeded" if chosen else "failed",
                    error_code=None if chosen else "RESULT_INVALID",
                    error_message=None if chosen else "no quality",
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
            title = str(raw.get("title", ""))
            sid = str(raw.get("id", ""))
            if should_skip(title, skips):
                out.append(
                    CrawlItemResult(
                        source=self.name,
                        source_id=sid,
                        title=title,
                        video_url=None,
                        cover_url=None,
                        tags=tuple(raw.get("tags") or ()),
                        status="skipped",
                    )
                )
                continue
            videos = raw.get("videos") or []
            if isinstance(videos, str):
                videos = [videos]
            chosen = select_quality([str(v) for v in videos], priority)
            out.append(
                CrawlItemResult(
                    source=self.name,
                    source_id=sid,
                    title=title,
                    video_url=chosen,
                    cover_url=raw.get("cover"),
                    tags=tuple(str(t) for t in (raw.get("tags") or ())),
                    status="succeeded" if chosen else "failed",
                )
            )
        return out
