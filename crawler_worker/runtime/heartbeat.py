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
        interval_seconds: float,
        *,
        on_cancel: Optional[Callable[[], None]] = None,
    ) -> None:
        self._client = client
        self._interval = interval_seconds
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
            self._thread.join(timeout=self._interval + 1)
        self._thread = None
        self._stop.clear()

    def _start(self) -> None:
        self.stop()
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="worker-heartbeat", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.wait(self._interval):
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
