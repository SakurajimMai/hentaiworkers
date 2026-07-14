from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional


DeliveryMode = Literal["public", "cdn", "private"]


@dataclass(frozen=True)
class UploadResult:
    staging_key: str
    final_key: str
    checksum_sha256: str
    byte_size: int
    public_url: Optional[str]


class MediaAdapter(ABC):
    driver: str

    @abstractmethod
    def upload_staging(self, local_path: Path, staging_key: str) -> str:
        """Upload file to staging key; return checksum hex."""

    @abstractmethod
    def publish(self, staging_key: str, final_key: str) -> UploadResult:
        """Atomic publish from staging to final."""

    @abstractmethod
    def cleanup(self, key: str) -> None:
        """Delete object if present."""

    @abstractmethod
    def head(self, key: str) -> dict:
        """Return metadata for key."""
