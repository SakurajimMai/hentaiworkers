"""Cooperative job runner: claim → start → source → commit → complete."""

from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Callable, Optional

from crawler_worker.models.api import ClaimedJob, CrawlItemResult
from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.runtime.heartbeat import HeartbeatLoop
from crawler_worker.sources.base import SourceAdapter
from crawler_worker.transport.control_client import ControlClient, ControlPlaneError


class Runner:
    def __init__(
        self,
        config: WorkerRuntimeConfig,
        client: ControlClient,
        sources: dict[str, SourceAdapter],
        *,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self._config = config
        self._client = client
        self._sources = sources
        self._sleep = sleep or (lambda s: __import__("time").sleep(s))
        self._cancel = False
        self._hb = HeartbeatLoop(
            client,
            config.idle_heartbeat_seconds,
            on_cancel=self.request_cancel,
        )

    def request_cancel(self) -> None:
        self._cancel = True

    def run_forever(self, max_iterations: Optional[int] = None) -> None:
        self._client.register()
        self._hb.start_idle()
        iterations = 0
        try:
            while max_iterations is None or iterations < max_iterations:
                iterations += 1
                self._cancel = False
                job = self._client.claim()
                if job is None:
                    self._client.worker_heartbeat(current_load=0)
                    self._sleep(1.0)
                    continue
                self._run_job(job)
                self._hb.start_idle()
        finally:
            self._hb.stop()

    def _run_job(self, job: ClaimedJob) -> None:
        workdir = Path(tempfile.mkdtemp(prefix=f"job-{job.job_id}-", dir=self._config.temp_dir if Path(self._config.temp_dir).exists() else None))
        seq = 0
        try:
            self._client.start(job)
            self._hb.start_job(job)
            seq = self._log(job, seq, "job_started", f"job {job.job_id}")

            snapshot = json.loads(job.config_snapshot_json or "{}")
            source_name = str(snapshot.get("requiredSource") or snapshot.get("source") or "hanime")
            adapter = self._sources.get(source_name)
            if adapter is None:
                self._client.fail(
                    job,
                    f"fail-{job.job_id}-{job.attempt_id}",
                    retryable=False,
                    error_code="WORKER_INCOMPATIBLE",
                    error_message=f"no adapter for {source_name}",
                )
                return

            results = adapter.crawl(snapshot, workdir=workdir, should_stop=lambda: self._cancel)
            if self._cancel:
                seq = self._log(job, seq, "cancel", "cancel requested")
                try:
                    self._client.cancel_ack(job)
                except ControlPlaneError:
                    # Fallback if older control plane lacks cancel-ack
                    try:
                        self._client.fail(
                            job,
                            f"cancel-{job.job_id}-{job.attempt_id}",
                            retryable=False,
                            error_code="CANCELLED",
                            error_message="cancelled",
                        )
                    except ControlPlaneError:
                        pass
                return

            succeeded = 0
            failed = 0
            for item in results:
                if self._cancel:
                    break
                commit = self._client.items_commit(
                    job,
                    idempotency_key=f"item-{job.job_id}-{item.source}-{item.source_id}",
                    source=item.source,
                    source_id=item.source_id,
                    status=item.status,
                    error_code=item.error_code,
                    error_message=item.error_message,
                )
                if item.status == "succeeded":
                    succeeded += 1
                elif item.status == "failed":
                    failed += 1
                seq = self._log(job, seq, "item", f"{item.source_id} {item.status} replayed={commit.replayed}")

            outcome = "succeeded"
            if failed and succeeded:
                outcome = "partial_succeeded"
            elif failed and not succeeded:
                outcome = "failed"
            self._client.complete(job, f"complete-{job.job_id}-{job.attempt_id}", outcome=outcome)
        except ControlPlaneError as exc:
            if exc.code == "LEASE_LOST":
                return
            try:
                self._client.fail(
                    job,
                    f"fail-{job.job_id}-{uuid.uuid4().hex[:8]}",
                    retryable=True,
                    error_code=exc.code,
                    error_message=exc.message,
                )
            except ControlPlaneError:
                return
        finally:
            self._hb.stop()
            shutil.rmtree(workdir, ignore_errors=True)

    def _log(self, job: ClaimedJob, seq: int, event_type: str, message: str) -> int:
        next_seq = seq + 1
        try:
            self._client.events_batch(
                job,
                [{"sequence": next_seq, "eventType": event_type, "message": message, "level": "info"}],
            )
        except ControlPlaneError:
            pass
        return next_seq
