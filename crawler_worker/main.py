"""Worker entrypoint — env: CRAWLER_CONTROL_URL, CRAWLER_WORKER_ID, CRAWLER_WORKER_TOKEN."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.runtime.runner import Runner
from crawler_worker.sources.getchu import GetchuSource
from crawler_worker.sources.hanime import HanimeSource
from crawler_worker.transport.control_client import ControlClient


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
    return WorkerRuntimeConfig(
        control_base_url=base.rstrip("/"),
        worker_id=int(worker_id),
        machine_token=token,
        temp_dir=temp,
        worker_version=e.get("CRAWLER_WORKER_VERSION", "1.0.0"),
    )


def main(argv: list[str] | None = None) -> int:
    _ = argv
    cfg = config_from_env()
    client = ControlClient(cfg)
    runner = Runner(
        cfg,
        client,
        {
            "hanime": HanimeSource(),
            "getchu": GetchuSource(),
        },
    )
    runner.run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
