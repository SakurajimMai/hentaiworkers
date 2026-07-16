"""Download source media and publish to S3/SFTP for Hanime-style jobs."""

from __future__ import annotations

import ipaddress
import os
import re
import socket
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

from dataclasses import dataclass

from crawler_worker.media.base import MediaAdapter, UploadResult
from crawler_worker.media.s3 import S3Credentials, S3MediaAdapter
from crawler_worker.media.sftp import SFTPConfig, SFTPMediaAdapter
from crawler_worker.models.api import ClaimedJob, CrawlItemResult
from crawler_worker.transport.control_client import ControlClient, ControlPlaneError


_MAX_BYTES = 2 * 1024 * 1024 * 1024  # 2 GiB hard cap
_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_REDIRECT_STATUSES = {301, 302, 303, 307, 308}


def _validate_public_http_url(url: str) -> None:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("media URL must be http(s)")
        if parsed.username or parsed.password:
            raise ValueError("media URL must not contain credentials")
        hostname = parsed.hostname.rstrip(".").lower()
        if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
            raise ValueError("media URL target is not public")
        try:
            addresses = [ipaddress.ip_address(hostname)]
        except ValueError:
            addresses = [
                ipaddress.ip_address(row[4][0])
                for row in socket.getaddrinfo(
                    hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                )
            ]
        if not addresses or any(
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_unspecified
            or address.is_reserved
            for address in addresses
        ):
            raise ValueError("media URL target is not public")
    except (OSError, ValueError) as exc:
        if isinstance(exc, ValueError) and str(exc).startswith("media URL"):
            raise
        raise ValueError("media URL target could not be validated") from exc


def storage_driver_from_snapshot(snapshot: dict[str, Any]) -> Optional[str]:
    driver = snapshot.get("storageDriver")
    if driver in ("s3", "sftp"):
        return str(driver)
    cfg = snapshot.get("storageConfig")
    if isinstance(cfg, dict) and cfg.get("driver") in ("s3", "sftp"):
        return str(cfg["driver"])
    return None


def build_media_adapter(snapshot: dict[str, Any]) -> MediaAdapter:
    cfg = snapshot.get("storageConfig")
    if not isinstance(cfg, dict):
        raise ValueError("storageConfig missing from job snapshot")
    driver = str(cfg.get("driver") or "")
    if driver == "s3":
        return _build_s3_adapter(cfg)
    if driver == "sftp":
        return _build_sftp_adapter(cfg)
    raise ValueError(f"unsupported storage driver {driver}")


def _build_s3_adapter(cfg: dict[str, Any]) -> S3MediaAdapter:
    # Prefer short-lived env credentials for production Workers.
    access_key = os.environ.get("CRAWLER_S3_ACCESS_KEY_ID") or os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("CRAWLER_S3_SECRET_ACCESS_KEY") or os.environ.get(
        "AWS_SECRET_ACCESS_KEY"
    )
    session_token = (
        os.environ.get("CRAWLER_S3_SESSION_TOKEN")
        or os.environ.get("AWS_SESSION_TOKEN")
        or ""
    )
    if not access_key or not secret_key:
        raise ValueError(
            "S3 credentials missing: set CRAWLER_S3_ACCESS_KEY_ID / CRAWLER_S3_SECRET_ACCESS_KEY"
        )

    import boto3
    from botocore.client import Config as BotoConfig

    endpoint = str(cfg.get("endpoint") or "") or None
    region = str(cfg.get("region") or "auto")
    force_path = bool(cfg.get("forcePathStyle", True))
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        aws_session_token=session_token or None,
        config=BotoConfig(s3={"addressing_style": "path" if force_path else "auto"}),
        verify=True,
    )
    creds = S3Credentials(
        access_key_id=access_key,
        secret_access_key=secret_key,
        session_token=session_token,
        expires_at="",
        bucket=str(cfg.get("bucket") or ""),
        region=region,
        endpoint=endpoint,
        prefix=str(cfg.get("prefix") or ""),
    )
    return S3MediaAdapter(
        client,
        creds,
        public_base_url=str(cfg.get("publicBaseUrl") or "") or None,
        delivery_mode=str(cfg.get("deliveryMode") or "public"),
        force_path_style=force_path,
        verify_tls=True,
    )


def _build_sftp_adapter(cfg: dict[str, Any]) -> SFTPMediaAdapter:
    password = os.environ.get("CRAWLER_SFTP_PASSWORD")
    private_key = os.environ.get("CRAWLER_SFTP_PRIVATE_KEY")
    if not password and not private_key:
        raise ValueError(
            "SFTP credentials missing: set CRAWLER_SFTP_PASSWORD or CRAWLER_SFTP_PRIVATE_KEY"
        )

    import paramiko

    host = str(cfg.get("host") or "")
    port = int(cfg.get("port") or 22)
    username = str(cfg.get("username") or "")
    fingerprint = str(cfg.get("hostKeyFingerprint") or "")
    root_path = str(cfg.get("rootPath") or "/")

    transport = paramiko.Transport((host, port))
    if private_key:
        pkey = paramiko.RSAKey.from_private_key_file(private_key)  # type: ignore[attr-defined]
        transport.connect(username=username, pkey=pkey)
    else:
        transport.connect(username=username, password=password)
    client = paramiko.SFTPClient.from_transport(transport)
    if client is None:
        raise RuntimeError("failed to open SFTP client")

    # Observed host key fingerprint (sha256 base64 or hex forms accepted as stored).
    remote_key = transport.get_remote_server_key()
    import base64
    import hashlib

    digest = hashlib.sha256(remote_key.asbytes()).digest()
    observed = "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")
    sftp_cfg = SFTPConfig(
        host=host,
        port=port,
        username=username,
        root_path=root_path,
        host_key_fingerprint=fingerprint,
        public_base_url=str(cfg.get("publicBaseUrl") or "") or None,
    )
    return SFTPMediaAdapter(
        client,
        sftp_cfg,
        observed_fingerprint=observed,
        transport=transport,
    )


def download_http_file(
    url: str,
    dest: Path,
    *,
    max_bytes: int = _MAX_BYTES,
    referer: str | None = None,
    attempts: int = 3,
) -> Path:
    _validate_public_http_url(url)
    try:
        import requests
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("requests is required for media download") from exc

    partial = dest.with_suffix(dest.suffix + ".part")
    last_error: Exception | None = None
    for attempt in range(1, max(1, attempts) + 1):
        partial.unlink(missing_ok=True)
        try:
            current_url = url
            response = None
            for _redirect in range(6):
                _validate_public_http_url(current_url)
                response = requests.get(
                    current_url,
                    stream=True,
                    timeout=(15, 120),
                    headers={
                        "User-Agent": _USER_AGENT,
                        "Accept": "video/mp4,video/*;q=0.9,image/avif,image/webp,*/*;q=0.8",
                        **({"Referer": referer} if referer else {}),
                    },
                    allow_redirects=False,
                )
                if response.status_code not in _REDIRECT_STATUSES:
                    break
                location = response.headers.get("location")
                response.close()
                if not location:
                    raise ValueError("media redirect missing Location")
                current_url = urljoin(current_url, location)
            else:
                raise ValueError("too many media redirects")
            if response is None:
                raise RuntimeError("media request did not produce a response")
            with response:
                response.raise_for_status()
                length = int(response.headers.get("content-length") or 0)
                if length > max_bytes:
                    raise ValueError("remote file exceeds size limit")
                written = 0
                with partial.open("wb") as out:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        written += len(chunk)
                        if written > max_bytes:
                            raise ValueError("download exceeded size limit")
                        out.write(chunk)
            if partial.stat().st_size <= 0:
                raise ValueError("downloaded empty file")
            partial.replace(dest)
            return dest
        except Exception as exc:
            last_error = exc
            partial.unlink(missing_ok=True)
            if attempt < attempts:
                time.sleep(min(2 ** (attempt - 1), 4))
    raise last_error or RuntimeError("media download failed")


def extension_for_url(url: str) -> str:
    path = urlparse(url).path.lower()
    for ext in (".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(ext):
            return ext
    return ".bin"


@dataclass(frozen=True)
class PublishedMediaHandle:
    upload_id: int
    final_key: str
    public_url: str


@dataclass(frozen=True)
class PublishedItemMedia:
    item: CrawlItemResult
    handles: tuple[PublishedMediaHandle, ...]


def abandon_published_media(
    *,
    client: ControlClient,
    job: ClaimedJob,
    media: MediaAdapter,
    handles: tuple[PublishedMediaHandle, ...] | list[PublishedMediaHandle],
) -> None:
    """Best-effort compensation when catalog commit fails after object publish."""
    for handle in handles:
        try:
            media.cleanup(handle.final_key)
        except Exception:
            pass
        try:
            client.media_status(job, handle.upload_id, "abandoned")
        except Exception:
            pass


def _publish_remote_asset(
    *,
    client: ControlClient,
    job: ClaimedJob,
    media: MediaAdapter,
    url: str,
    workdir: Path,
    item_key: str,
    asset_kind: str,
    prefix: str,
    referer: str | None = None,
    max_bytes: int = 100 * 1024 * 1024,
) -> PublishedMediaHandle:
    extension = extension_for_url(url)
    key = f"{item_key}{extension if not item_key.lower().endswith(extension) else ''}"
    reservation = client.media_reserve(
        job,
        item_key=key,
        asset_kind=asset_kind,
        prefix=prefix,
    )
    # Source IDs are untrusted. Keep local paths independent from item_key even
    # though the control plane separately sanitizes object keys.
    local = workdir / f"upload-{reservation.upload_id}{extension}"
    try:
        download_http_file(url, local, referer=referer, max_bytes=max_bytes)
        media.upload_staging(local, reservation.staging_key)
        client.media_status(job, reservation.upload_id, "uploaded")
        published: UploadResult = media.publish(reservation.staging_key, reservation.final_key)
        media.cleanup(reservation.staging_key)
        if not published.public_url:
            raise ValueError(
                "storage publish produced no public URL; set publicBaseUrl on S3/SFTP config"
            )
        client.media_status(job, reservation.upload_id, "published")
        return PublishedMediaHandle(
            upload_id=reservation.upload_id,
            final_key=reservation.final_key,
            public_url=published.public_url,
        )
    except Exception:
        try:
            # publish() can fail after copy/rename succeeded (for example during head),
            # so both deterministic keys are always safe compensation targets.
            media.cleanup(reservation.staging_key)
            media.cleanup(reservation.final_key)
        except Exception:
            pass
        try:
            client.media_status(job, reservation.upload_id, "abandoned")
        except Exception:
            pass
        raise
    finally:
        local.unlink(missing_ok=True)


def publish_item_media(
    *,
    client: ControlClient,
    job: ClaimedJob,
    item: CrawlItemResult,
    snapshot: dict[str, Any],
    workdir: Path,
    adapter: MediaAdapter | None = None,
) -> PublishedItemMedia:
    """Publish video plus optional cover/fanart; video failure aborts, images are best-effort."""
    if not item.video_url:
        return PublishedItemMedia(item=item, handles=())

    media = adapter or build_media_adapter(snapshot)
    cfg = snapshot.get("storageConfig") if isinstance(snapshot.get("storageConfig"), dict) else {}
    media_options = snapshot.get("media") if isinstance(snapshot.get("media"), dict) else {}
    enable_cover = bool(media_options.get("enableCover", True))
    enable_fanart = bool(media_options.get("enableFanart", True))
    max_fanart = max(1, min(50, int(media_options.get("maxFanartImages") or 50)))
    prefix = str(cfg.get("prefix") or "")
    base_key = f"{item.source}-{item.source_id}"
    handles: list[PublishedMediaHandle] = []

    video = _publish_remote_asset(
        client=client,
        job=job,
        media=media,
        url=item.video_url,
        workdir=workdir,
        item_key=base_key,
        asset_kind="video",
        prefix=prefix,
        referer=item.source_page_url,
        max_bytes=_MAX_BYTES,
    )
    handles.append(video)

    cover_url = item.cover_url
    if enable_cover and item.cover_url:
        try:
            cover = _publish_remote_asset(
                client=client,
                job=job,
                media=media,
                url=item.cover_url,
                workdir=workdir,
                item_key=f"{base_key}-cover",
                asset_kind="cover",
                prefix=prefix,
                referer=item.source_page_url,
            )
            handles.append(cover)
            cover_url = cover.public_url
        except Exception:
            # Keep the original cover URL if hosting fails so metadata is not wiped.
            cover_url = item.cover_url

    fanart_urls = list(item.fanart_urls)
    if enable_fanart:
        fanart_urls = []
        for index, fanart_url in enumerate(item.fanart_urls[:max_fanart], 1):
            try:
                hosted = _publish_remote_asset(
                    client=client,
                    job=job,
                    media=media,
                    url=fanart_url,
                    workdir=workdir,
                    item_key=f"{base_key}-fanart-{index:03d}",
                    asset_kind="fanart",
                    prefix=prefix,
                    referer=(
                        "https://www.getchu.com/"
                        if "getchu.com" in fanart_url
                        else item.source_page_url
                    ),
                )
                handles.append(hosted)
                fanart_urls.append(hosted.public_url)
            except Exception:
                continue

    return PublishedItemMedia(
        item=CrawlItemResult(
            source=item.source,
            source_id=item.source_id,
            title=item.title,
            video_url=video.public_url,
            cover_url=cover_url,
            tags=item.tags,
            status=item.status,
            title_english=item.title_english,
            title_japanese=item.title_japanese,
            description=item.description,
            fanart_urls=tuple(fanart_urls),
            release_year=item.release_year,
            release_date=item.release_date,
            remarks=item.remarks,
            actors=item.actors,
            directors=item.directors,
            aliases=item.aliases,
            area=item.area,
            lang=item.lang,
            source_updated_at=item.source_updated_at,
            error_code=item.error_code,
            error_message=item.error_message,
            source_page_url=item.source_page_url,
            play_lines=item.play_lines,
        ),
        handles=tuple(handles),
    )


def run_storage_test(
    *,
    client: ControlClient,
    job: ClaimedJob,
    snapshot: dict[str, Any],
    workdir: Path,
) -> None:
    """Smoke: reserve → upload tiny object → publish → cleanup staging if needed."""
    media = build_media_adapter(snapshot)
    cfg = snapshot.get("storageConfig") if isinstance(snapshot.get("storageConfig"), dict) else {}
    prefix = str(cfg.get("prefix") or "storage-test/")
    reservation = client.media_reserve(
        job,
        item_key=f"storage-test-{job.job_id}",
        asset_kind="other",
        prefix=prefix,
    )
    sample = workdir / "storage-test.bin"
    sample.write_bytes(b"anime-web-storage-test\n")
    try:
        media.upload_staging(sample, reservation.staging_key)
        client.media_status(job, reservation.upload_id, "uploaded")
        media.publish(reservation.staging_key, reservation.final_key)
        media.cleanup(reservation.staging_key)
        client.media_status(job, reservation.upload_id, "published")
        # The smoke object proves publish/delete access; it is not durable media.
        media.cleanup(reservation.final_key)
        client.media_status(job, reservation.upload_id, "cleaned")
        complete_key = f"storage-test-{job.job_id}-{job.attempt_id}"
        for complete_attempt in range(3):
            try:
                client.complete(
                    job,
                    complete_key,
                    outcome="succeeded",
                    succeeded_items=1,
                    failed_items=0,
                    continue_on_error=True,
                )
                break
            except ControlPlaneError as exc:
                if exc.status < 500 or complete_attempt == 2:
                    raise
                time.sleep(2 ** complete_attempt)
    except Exception:
        try:
            media.cleanup(reservation.staging_key)
            media.cleanup(reservation.final_key)
        except Exception:
            pass
        try:
            client.media_status(job, reservation.upload_id, "abandoned")
        except Exception:
            pass
        raise
    finally:
        sample.unlink(missing_ok=True)
        try:
            media.close()
        except Exception:
            pass
