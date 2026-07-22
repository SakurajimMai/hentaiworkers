"""Worker entrypoint — env: CRAWLER_CONTROL_URL, CRAWLER_WORKER_ID, CRAWLER_WORKER_TOKEN."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.runtime.runner import Runner
from crawler_worker.sources.hanime import HanimeSource
from crawler_worker.sources.maccms import build_maccms_sources
from crawler_worker.transport.control_client import ControlClient, ControlPlaneError


def config_from_env(env: dict[str, str] | None = None) -> WorkerRuntimeConfig:
    e = env or os.environ
    base = e.get("CRAWLER_CONTROL_URL") or e.get("CONTROL_BASE_URL")
    token = e.get("CRAWLER_WORKER_TOKEN") or e.get("WORKER_TOKEN")
    worker_id = e.get("CRAWLER_WORKER_ID") or e.get("WORKER_ID")
    if not base or not token or not worker_id:
        raise SystemExit(
            "CRAWLER_CONTROL_URL, CRAWLER_WORKER_ID, CRAWLER_WORKER_TOKEN are required"
        )
    # Refuse database env for defense-in-depth
    for banned in ("DATABASE_URL", "MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD"):
        if e.get(banned):
            raise SystemExit(f"Worker must not receive {banned}")
    temp = e.get("CRAWLER_TEMP_DIR", "/tmp/crawler-worker")
    Path(temp).mkdir(parents=True, exist_ok=True)
    cover_dir = e.get("CRAWLER_COVER_DIR", "/data/covers")
    Path(cover_dir).mkdir(parents=True, exist_ok=True)
    maccms_names = tuple(sorted(build_maccms_sources().keys()))
    sources = ("hanime", *maccms_names)
    # Advertise only storage drivers for which this Worker has real credentials.
    # An explicit CRAWLER_STORAGE_DRIVERS value remains available for brokered creds.
    configured_drivers = e.get("CRAWLER_STORAGE_DRIVERS")
    if configured_drivers is not None:
        storage_drivers = tuple(
            d.strip()
            for d in configured_drivers.split(",")
            if d.strip() in ("s3", "sftp")
        )
    else:
        detected: list[str] = []
        if (
            (e.get("CRAWLER_S3_ACCESS_KEY_ID") or e.get("AWS_ACCESS_KEY_ID"))
            and (e.get("CRAWLER_S3_SECRET_ACCESS_KEY") or e.get("AWS_SECRET_ACCESS_KEY"))
        ):
            detected.append("s3")
        if e.get("CRAWLER_SFTP_PASSWORD") or e.get("CRAWLER_SFTP_PRIVATE_KEY"):
            detected.append("sftp")
        storage_drivers = tuple(detected)
    return WorkerRuntimeConfig(
        control_base_url=base.rstrip("/"),
        worker_id=int(worker_id),
        machine_token=token,
        temp_dir=temp,
        cover_dir=cover_dir,
        worker_version=e.get("CRAWLER_WORKER_VERSION", "1.0.0"),
        sources=sources,
        storage_drivers=storage_drivers,
    )


def main(argv: list[str] | None = None) -> int:
    _ = argv
    cfg = config_from_env()
    client = ControlClient(cfg)
    adapters = {"hanime": HanimeSource(), **build_maccms_sources()}
    runner = Runner(cfg, client, adapters)
    try:
        runner.run_forever()
    except ControlPlaneError as exc:
        print(
            f"crawler_worker_exit code={exc.code} status={exc.status} message={exc.message}",
            file=sys.stderr,
            flush=True,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
