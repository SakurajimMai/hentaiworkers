"""Idle and task heartbeat helpers."""

from __future__ import annotations

import threading
import time
from typing import Callable, Optional

from crawler_worker.models.api import ClaimedJob
from crawler_worker.transport.control_client import ControlClient, ControlPlaneError


class HeartbeatLoop:
    def __init__(
        self,
        client: ControlClient,
        idle_interval_seconds: float,
        *,
        job_interval_seconds: float | None = None,
        on_cancel: Optional[Callable[[], None]] = None,
    ) -> None:
        self._client = client
        self._idle_interval = idle_interval_seconds
        self._job_interval = (
            job_interval_seconds if job_interval_seconds is not None else idle_interval_seconds
        )
        self._on_cancel = on_cancel
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._job: Optional[ClaimedJob] = None
        self._mode: str = "idle"

    def start_idle(self) -> None:
        self._mode = "idle"
        self._job = None
        self._start()

    def start_job(self, job: ClaimedJob) -> None:
        self._mode = "job"
        self._job = job
        self._start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            join_timeout = max(self._idle_interval, self._job_interval) + 1
            self._thread.join(timeout=join_timeout)
        self._thread = None
        self._stop.clear()

    def _start(self) -> None:
        self.stop()
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="worker-heartbeat", daemon=True)
        self._thread.start()

    def _interval(self) -> float:
        return self._job_interval if self._mode == "job" else self._idle_interval

    def _run(self) -> None:
        # Immediate beat so long first crawl/API cold-start does not burn the whole lease.
        while True:
            try:
                if self._mode == "job" and self._job is not None:
                    result = self._client.job_heartbeat(self._job)
                    if result.cancel_requested and self._on_cancel:
                        self._on_cancel()
                else:
                    self._client.worker_heartbeat(current_load=1 if self._job else 0)
            except ControlPlaneError as exc:
                if exc.code == "LEASE_LOST" and self._on_cancel:
                    self._on_cancel()
                # swallow transient errors; runner will re-evaluate
            except Exception:
                time.sleep(0.1)
            if self._stop.wait(self._interval()):
                break
