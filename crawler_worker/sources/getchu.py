"""Getchu enrichment adapter — DTO only, no database."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Sequence

from crawler_worker.models.api import CrawlItemResult
from crawler_worker.sources.base import SourceAdapter, should_skip


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
