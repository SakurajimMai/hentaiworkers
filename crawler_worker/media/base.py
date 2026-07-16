from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
import hashlib
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


def sha256_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    """Hash large media without loading it into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


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

    def close(self) -> None:
        """Release network resources held by a long-lived adapter."""
