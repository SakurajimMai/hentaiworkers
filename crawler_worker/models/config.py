"""Worker configuration DTOs — no database host/user/password/table fields."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Sequence


StorageDriver = Literal["s3", "sftp"]


@dataclass(frozen=True)
class WorkerRuntimeConfig:
    control_base_url: str
    worker_id: int
    machine_token: str
    protocol_version: int = 1
    worker_version: str = "1.0.0"
    sources: Sequence[str] = field(default_factory=lambda: ("hanime", "getchu"))
    storage_drivers: Sequence[StorageDriver] = field(default_factory=lambda: ("s3", "sftp"))
    config_schema_versions: Sequence[int] = field(default_factory=lambda: (1,))
    max_concurrency: int = 1
    idle_heartbeat_seconds: int = 30
    job_heartbeat_seconds: int = 15
    claim_wait_seconds: int = 20
    temp_dir: str = "/tmp/crawler-worker"
    browser_version: str | None = "chrome"

    def capabilities(self, current_load: int = 0) -> dict[str, Any]:
        return {
            "protocolVersion": self.protocol_version,
            "workerVersion": self.worker_version,
            "sources": list(self.sources),
            "storageDrivers": list(self.storage_drivers),
            "configSchemaVersions": list(self.config_schema_versions),
            "maxConcurrency": self.max_concurrency,
            "currentLoad": current_load,
            "browserVersion": self.browser_version,
        }


@dataclass(frozen=True)
class SourceConfig:
    base_url: str
    quality_priority: Sequence[str] = field(default_factory=lambda: ("1080", "720"))
    skip_keywords: Sequence[str] = field(default_factory=tuple)
    years: Sequence[int] = field(default_factory=tuple)
    months: Sequence[int] = field(default_factory=tuple)
    timeout_seconds: int = 30
    proxy_url: str | None = None
