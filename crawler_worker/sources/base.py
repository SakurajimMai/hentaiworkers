from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Callable, Sequence

from crawler_worker.models.api import CrawlItemResult


class SourceAdapter(ABC):
    name: str

    @abstractmethod
    def crawl(
        self,
        snapshot: dict[str, Any],
        *,
        workdir: Path,
        should_stop: Callable[[], bool],
    ) -> Sequence[CrawlItemResult]:
        raise NotImplementedError


def select_quality(candidates: Sequence[str], priority: Sequence[str]) -> str | None:
    for q in priority:
        for c in candidates:
            if q in c:
                return c
    return candidates[0] if candidates else None


def should_skip(title: str, keywords: Sequence[str]) -> bool:
    lower = title.lower()
    return any(k.lower() in lower for k in keywords if k)
