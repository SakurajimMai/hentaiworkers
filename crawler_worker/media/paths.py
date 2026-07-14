from __future__ import annotations

from datetime import datetime, timezone


def build_object_keys(
    *,
    prefix: str,
    job_id: int,
    attempt_id: int,
    item_key: str,
    asset_kind: str = "video",
    organize_by_date: bool = True,
    now: datetime | None = None,
) -> tuple[str, str]:
    p = prefix if not prefix or prefix.endswith("/") else f"{prefix}/"
    date_part = ""
    if organize_by_date:
        ts = now or datetime.now(timezone.utc)
        date_part = f"{ts.strftime('%Y-%m-%d')}/"
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in item_key)[:128] or "item"
    base = f"{p}{date_part}job-{job_id}/attempt-{attempt_id}/{asset_kind}/{safe}"
    return f"staging/{base}", f"final/{base}"


def public_url_for(
    *,
    driver: str,
    final_key: str,
    public_base_url: str | None,
    delivery_mode: str = "public",
) -> str | None:
    if driver == "sftp" and not public_base_url:
        # SFTP without public mapping cannot be a playback source.
        return None
    if delivery_mode == "private":
        return None
    if not public_base_url:
        return None
    base = public_base_url.rstrip("/")
    key = final_key.lstrip("/")
    return f"{base}/{key}"
