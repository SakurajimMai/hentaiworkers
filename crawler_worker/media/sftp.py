"""SFTP media adapter — Paramiko-compatible interface with mandatory host key."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Protocol

from crawler_worker.media.base import MediaAdapter, UploadResult, sha256_file
from crawler_worker.media.paths import public_url_for


class SFTPClientProtocol(Protocol):
    def putfo(self, fl, remotepath: str, **kwargs) -> None: ...
    def rename(self, oldpath: str, newpath: str) -> None: ...
    def remove(self, path: str) -> None: ...
    def stat(self, path: str): ...
    def mkdir(self, path: str, mode: int = 0o755) -> None: ...


@dataclass(frozen=True)
class SFTPConfig:
    host: str
    port: int
    username: str
    root_path: str
    host_key_fingerprint: str
    public_base_url: Optional[str] = None


class SFTPMediaAdapter(MediaAdapter):
    driver = "sftp"

    def __init__(
        self,
        client: SFTPClientProtocol,
        config: SFTPConfig,
        *,
        observed_fingerprint: str,
        transport: Any | None = None,
    ) -> None:
        if not config.host_key_fingerprint or len(config.host_key_fingerprint) < 16:
            raise ValueError("host key fingerprint required")
        # Never auto-accept unknown keys
        if observed_fingerprint != config.host_key_fingerprint:
            raise PermissionError("SFTP host key fingerprint mismatch")
        self._client = client
        self._config = config
        self._transport = transport

    def _abs(self, key: str) -> str:
        root = self._config.root_path.rstrip("/")
        return f"{root}/{key.lstrip('/')}"

    def upload_staging(self, local_path: Path, staging_key: str) -> str:
        digest = sha256_file(local_path)
        remote = self._abs(staging_key)
        self._ensure_parent(remote)
        with local_path.open("rb") as fl:
            self._client.putfo(fl, remote)
        return digest

    def publish(self, staging_key: str, final_key: str) -> UploadResult:
        src = self._abs(staging_key)
        dst = self._abs(final_key)
        self._ensure_parent(dst)
        # Same-filesystem rename for atomic publish
        self._client.rename(src, dst)
        st = self._client.stat(dst)
        size = int(getattr(st, "st_size", 0))
        url = public_url_for(
            driver="sftp",
            final_key=final_key,
            public_base_url=self._config.public_base_url,
            delivery_mode="public" if self._config.public_base_url else "private",
        )
        if url is None and not self._config.public_base_url:
            # Explicit rejection as playback source without mapping
            pass
        return UploadResult(
            staging_key=staging_key,
            final_key=final_key,
            checksum_sha256="",
            byte_size=size,
            public_url=url,
        )

    def cleanup(self, key: str) -> None:
        try:
            self._client.remove(self._abs(key))
        except OSError:
            pass

    def head(self, key: str) -> dict:
        st = self._client.stat(self._abs(key))
        return {"ContentLength": int(getattr(st, "st_size", 0))}

    def close(self) -> None:
        close_client = getattr(self._client, "close", None)
        if callable(close_client):
            close_client()
        close_transport = getattr(self._transport, "close", None)
        if callable(close_transport):
            close_transport()

    def _ensure_parent(self, remote: str) -> None:
        parent = os.path.dirname(remote)
        parts = parent.strip("/").split("/")
        cur = ""
        for part in parts:
            cur = f"{cur}/{part}" if cur else f"/{part}" if remote.startswith("/") else part
            try:
                self._client.mkdir(cur)
            except OSError:
                pass


class InMemorySFTPClient:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    def putfo(self, fl, remotepath: str, **kwargs) -> None:
        self.files[remotepath] = fl.read()

    def rename(self, oldpath: str, newpath: str) -> None:
        self.files[newpath] = self.files.pop(oldpath)

    def remove(self, path: str) -> None:
        self.files.pop(path, None)

    def stat(self, path: str):
        data = self.files[path]

        class St:
            st_size = len(data)

        return St()

    def mkdir(self, path: str, mode: int = 0o755) -> None:
        return None
