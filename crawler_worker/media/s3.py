"""S3 media adapter — uses injectable client for tests; boto3 in production."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Protocol

from crawler_worker.media.base import MediaAdapter, UploadResult, sha256_file
from crawler_worker.media.paths import public_url_for


class S3ClientProtocol(Protocol):
    def put_object(self, *, Bucket: str, Key: str, Body: bytes, **kwargs: Any) -> Any: ...
    def copy_object(self, *, Bucket: str, CopySource: dict, Key: str, **kwargs: Any) -> Any: ...
    def delete_object(self, *, Bucket: str, Key: str, **kwargs: Any) -> Any: ...
    def head_object(self, *, Bucket: str, Key: str, **kwargs: Any) -> dict: ...


@dataclass
class S3Credentials:
    access_key_id: str
    secret_access_key: str
    session_token: str
    expires_at: str
    bucket: str
    region: str
    endpoint: Optional[str] = None
    prefix: str = ""


class S3MediaAdapter(MediaAdapter):
    driver = "s3"

    def __init__(
        self,
        client: S3ClientProtocol,
        credentials: S3Credentials,
        *,
        public_base_url: str | None = None,
        delivery_mode: str = "public",
        force_path_style: bool = True,
        verify_tls: bool = True,
    ) -> None:
        if not verify_tls:
            raise ValueError("S3 TLS verification is mandatory")
        self._client = client
        self._creds = credentials
        self._public_base_url = public_base_url
        self._delivery_mode = delivery_mode
        self._force_path_style = force_path_style
        self._objects: dict[str, bytes] = {}  # mirrored for fake clients that need it

    def refresh_credentials(self, credentials: S3Credentials) -> None:
        self._creds = credentials

    def upload_staging(self, local_path: Path, staging_key: str) -> str:
        digest = sha256_file(local_path)
        # boto3 streams file objects; this keeps multi-GB Hanime media out of RAM.
        with local_path.open("rb") as stream:
            self._client.put_object(
                Bucket=self._creds.bucket,
                Key=staging_key,
                Body=stream,
                Metadata={"sha256": digest},
            )
        return digest

    def publish(self, staging_key: str, final_key: str) -> UploadResult:
        self._client.copy_object(
            Bucket=self._creds.bucket,
            CopySource={"Bucket": self._creds.bucket, "Key": staging_key},
            Key=final_key,
        )
        head = self.head(final_key)
        size = int(head.get("ContentLength") or 0)
        checksum = str(head.get("Metadata", {}).get("sha256") or "")
        url = public_url_for(
            driver="s3",
            final_key=final_key,
            public_base_url=self._public_base_url,
            delivery_mode=self._delivery_mode,
        )
        return UploadResult(
            staging_key=staging_key,
            final_key=final_key,
            checksum_sha256=checksum,
            byte_size=size,
            public_url=url,
        )

    def cleanup(self, key: str) -> None:
        self._client.delete_object(Bucket=self._creds.bucket, Key=key)

    def head(self, key: str) -> dict:
        return self._client.head_object(Bucket=self._creds.bucket, Key=key)

    def close(self) -> None:
        close = getattr(self._client, "close", None)
        if callable(close):
            close()


class InMemoryS3Client:
    """Test double for S3MediaAdapter."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.meta: dict[str, dict[str, str]] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: Any, **kwargs: Any) -> dict:
        self.objects[Key] = Body.read() if hasattr(Body, "read") else bytes(Body)
        self.meta[Key] = dict(kwargs.get("Metadata") or {})
        return {}

    def copy_object(self, *, Bucket: str, CopySource: dict, Key: str, **kwargs: Any) -> dict:
        src = CopySource["Key"]
        self.objects[Key] = self.objects[src]
        self.meta[Key] = dict(self.meta.get(src, {}))
        return {}

    def delete_object(self, *, Bucket: str, Key: str, **kwargs: Any) -> dict:
        self.objects.pop(Key, None)
        self.meta.pop(Key, None)
        return {}

    def head_object(self, *, Bucket: str, Key: str, **kwargs: Any) -> dict:
        if Key not in self.objects:
            raise KeyError(Key)
        return {
            "ContentLength": len(self.objects[Key]),
            "Metadata": self.meta.get(Key, {}),
        }
