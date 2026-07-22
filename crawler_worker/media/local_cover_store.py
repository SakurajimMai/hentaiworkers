"""Local cover storage shared by the crawler Worker and Web container."""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from pathlib import Path
from typing import Callable

from crawler_worker.media.upload_pipeline import download_http_file


LOCAL_COVER_ROUTE_PREFIX = "/api/media/covers"
MAX_COVER_BYTES = 20 * 1024 * 1024
_SOURCE_PATTERN = re.compile(r"^[a-z0-9_-]+$")
_Downloader = Callable[..., Path]


def detect_image_extension(path: Path) -> str:
    with path.open("rb") as stream:
        head = stream.read(16)
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    raise ValueError("unsupported cover image format")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def save_cover_locally(
    *,
    url: str,
    source: str,
    referer: str | None,
    root_dir: Path,
    downloader: _Downloader = download_http_file,
) -> str:
    source_key = source.strip().lower()
    if not _SOURCE_PATTERN.fullmatch(source_key):
        raise ValueError("invalid cover source")

    source_dir = root_dir / source_key
    source_dir.mkdir(parents=True, exist_ok=True, mode=0o755)
    os.chmod(source_dir, 0o755)
    temporary = source_dir / f".cover-{uuid.uuid4().hex}.download"
    try:
        downloader(
            url,
            temporary,
            max_bytes=MAX_COVER_BYTES,
            referer=referer,
        )
        extension = detect_image_extension(temporary)
        digest = _sha256(temporary)
        final = source_dir / f"{digest}{extension}"
        if final.exists():
            temporary.unlink(missing_ok=True)
        else:
            os.chmod(temporary, 0o644)
            temporary.replace(final)
            os.chmod(final, 0o644)
        return f"{LOCAL_COVER_ROUTE_PREFIX}/{source_key}/{final.name}"
    finally:
        temporary.unlink(missing_ok=True)
