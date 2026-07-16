"""HTTP API DTOs for the control plane — never include SQL/table fields."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional


@dataclass(frozen=True)
class ClaimedJob:
    job_id: int
    attempt_id: int
    lease_token: str
    lease_expires_at: str
    kind: str
    status: str
    config_snapshot_json: str
    profile_version_id: int
    max_attempts: int
    attempt_no: int

    @classmethod
    def from_payload(cls, data: dict[str, Any]) -> "ClaimedJob":
        return cls(
            job_id=int(data["jobId"]),
            attempt_id=int(data["attemptId"]),
            lease_token=str(data["leaseToken"]),
            lease_expires_at=str(data["leaseExpiresAt"]),
            kind=str(data.get("kind", "crawl")),
            status=str(data.get("status", "leased")),
            config_snapshot_json=str(data.get("configSnapshotJson", "{}")),
            profile_version_id=int(data.get("profileVersionId", 0)),
            max_attempts=int(data.get("maxAttempts", 3)),
            attempt_no=int(data.get("attemptNo", 1)),
        )


@dataclass(frozen=True)
class JobHeartbeatResult:
    cancel_requested: bool
    lease_expires_at: str
    status: str


@dataclass(frozen=True)
class MediaReservation:
    upload_id: int
    staging_key: str
    final_key: str
    status: str


@dataclass(frozen=True)
class ItemCommitResult:
    replayed: bool
    item_id: int
    status: str


@dataclass(frozen=True)
class CrawlItemResult:
    source: str
    source_id: str
    title: str
    video_url: Optional[str]
    cover_url: Optional[str]
    tags: tuple[str, ...]
    status: Literal["succeeded", "failed", "skipped"]
    title_english: Optional[str] = None
    title_japanese: Optional[str] = None
    description: Optional[str] = None
    fanart_urls: tuple[str, ...] = ()
    release_year: Optional[int] = None
    release_date: Optional[str] = None
    remarks: Optional[str] = None
    actors: Optional[str] = None
    directors: Optional[str] = None
    aliases: Optional[str] = None
    area: Optional[str] = None
    lang: Optional[str] = None
    source_updated_at: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    # Source page used as Referer for protected media downloads; never persisted.
    source_page_url: Optional[str] = None
    # [{name, flag, episodes:[{name,url}]}]
    play_lines: tuple[dict[str, Any], ...] = ()
