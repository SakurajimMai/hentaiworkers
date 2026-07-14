"""HTTP client for /api/internal/crawler/v1 — no database access."""

from __future__ import annotations

import json
from typing import Any, Callable, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from crawler_worker.models.api import (
    ClaimedJob,
    ItemCommitResult,
    JobHeartbeatResult,
    MediaReservation,
)
from crawler_worker.models.config import WorkerRuntimeConfig

LEASE_HEADER = "X-Crawler-Lease-Token"
MAX_EVENT_BATCH = 100
MAX_EVENT_BYTES = 256 * 1024


class ControlPlaneError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.status = status
        self.code = code
        self.message = message


class ControlClient:
    def __init__(
        self,
        config: WorkerRuntimeConfig,
        transport: Optional[Callable[[str, str, bytes, Mapping[str, str]], tuple[int, bytes]]] = None,
    ) -> None:
        self._config = config
        self._transport = transport or self._default_transport
        self._base = config.control_base_url.rstrip("/")

    def register(self) -> dict[str, Any]:
        return self._json(
            "POST",
            "/workers/register",
            {
                "workerId": self._config.worker_id,
                "capabilities": self._config.capabilities(),
            },
        )

    def worker_heartbeat(self, current_load: int = 0) -> dict[str, Any]:
        return self._json(
            "POST",
            f"/workers/{self._config.worker_id}/heartbeat",
            {
                "currentLoad": current_load,
                "capabilities": self._config.capabilities(current_load),
            },
        )

    def claim(self, wait_seconds: Optional[int] = None) -> Optional[ClaimedJob]:
        status, body = self._request(
            "POST",
            "/jobs/claim",
            {
                "capabilities": self._config.capabilities(),
                "waitSeconds": wait_seconds if wait_seconds is not None else self._config.claim_wait_seconds,
            },
        )
        if status == 204 or not body:
            return None
        payload = json.loads(body.decode("utf-8"))
        return ClaimedJob.from_payload(payload["data"])

    def start(self, job: ClaimedJob) -> dict[str, Any]:
        return self._json(
            "POST",
            f"/jobs/{job.job_id}/start",
            {"attemptId": job.attempt_id},
            lease=job.lease_token,
        )

    def job_heartbeat(self, job: ClaimedJob) -> JobHeartbeatResult:
        data = self._json(
            "POST",
            f"/jobs/{job.job_id}/heartbeat",
            {"attemptId": job.attempt_id},
            lease=job.lease_token,
        )
        return JobHeartbeatResult(
            cancel_requested=bool(data.get("cancelRequested")),
            lease_expires_at=str(data.get("leaseExpiresAt", "")),
            status=str(data.get("status", "")),
        )

    def events_batch(self, job: ClaimedJob, events: list[dict[str, Any]]) -> dict[str, Any]:
        if len(events) > MAX_EVENT_BATCH:
            raise ControlPlaneError(413, "BATCH_TOO_LARGE", f"max {MAX_EVENT_BATCH} events")
        raw = json.dumps(events).encode("utf-8")
        if len(raw) > MAX_EVENT_BYTES:
            raise ControlPlaneError(413, "BATCH_TOO_LARGE", f"max {MAX_EVENT_BYTES} bytes")
        return self._json(
            "POST",
            f"/jobs/{job.job_id}/events/batch",
            {"attemptId": job.attempt_id, "events": events},
            lease=job.lease_token,
        )

    def media_reserve(
        self,
        job: ClaimedJob,
        item_key: str,
        asset_kind: str = "video",
        prefix: str = "",
    ) -> MediaReservation:
        data = self._json(
            "POST",
            f"/jobs/{job.job_id}/media/reserve",
            {
                "attemptId": job.attempt_id,
                "itemKey": item_key,
                "assetKind": asset_kind,
                "prefix": prefix,
            },
            lease=job.lease_token,
        )
        return MediaReservation(
            upload_id=int(data["uploadId"]),
            staging_key=str(data["stagingKey"]),
            final_key=str(data["finalKey"]),
            status=str(data["status"]),
        )

    def credentials_refresh(self, job: ClaimedJob, prefix: str = "") -> dict[str, Any]:
        return self._json(
            "POST",
            f"/jobs/{job.job_id}/credentials/refresh",
            {"attemptId": job.attempt_id, "prefix": prefix},
            lease=job.lease_token,
        )

    def items_commit(
        self,
        job: ClaimedJob,
        *,
        idempotency_key: str,
        source: str,
        source_id: str,
        status: str,
        anime_id: Optional[int] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> ItemCommitResult:
        data = self._json(
            "POST",
            f"/jobs/{job.job_id}/items/commit",
            {
                "attemptId": job.attempt_id,
                "idempotencyKey": idempotency_key,
                "source": source,
                "sourceId": source_id,
                "status": status,
                "animeId": anime_id,
                "errorCode": error_code,
                "errorMessage": error_message,
            },
            lease=job.lease_token,
        )
        return ItemCommitResult(
            replayed=bool(data.get("replayed")),
            item_id=int(data["itemId"]),
            status=str(data["status"]),
        )

    def complete(self, job: ClaimedJob, idempotency_key: str, outcome: str = "succeeded") -> dict[str, Any]:
        return self._json(
            "POST",
            f"/jobs/{job.job_id}/complete",
            {
                "attemptId": job.attempt_id,
                "idempotencyKey": idempotency_key,
                "outcome": outcome,
            },
            lease=job.lease_token,
        )

    def fail(
        self,
        job: ClaimedJob,
        idempotency_key: str,
        *,
        retryable: bool,
        error_code: str = "INTERNAL_ERROR",
        error_message: str = "",
    ) -> dict[str, Any]:
        return self._json(
            "POST",
            f"/jobs/{job.job_id}/fail",
            {
                "attemptId": job.attempt_id,
                "idempotencyKey": idempotency_key,
                "retryable": retryable,
                "errorCode": error_code,
                "errorMessage": error_message,
            },
            lease=job.lease_token,
        )

    def cancel_ack(self, job: ClaimedJob) -> dict[str, Any]:
        return self._json(
            "POST",
            f"/jobs/{job.job_id}/cancel-ack",
            {"attemptId": job.attempt_id},
            lease=job.lease_token,
        )

    def _json(
        self,
        method: str,
        path: str,
        body: dict[str, Any],
        lease: Optional[str] = None,
    ) -> dict[str, Any]:
        status, raw = self._request(method, path, body, lease=lease)
        if status == 204:
            return {}
        payload = json.loads(raw.decode("utf-8"))
        if status >= 400:
            err = payload.get("error") or {}
            raise ControlPlaneError(
                status,
                str(err.get("code", "INTERNAL_ERROR")),
                str(err.get("message", "error")),
            )
        return payload.get("data") or payload

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any],
        lease: Optional[str] = None,
    ) -> tuple[int, bytes]:
        headers = {
            "Authorization": f"Bearer {self._config.machine_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if lease:
            headers[LEASE_HEADER] = lease
        data = json.dumps(body).encode("utf-8")
        return self._transport(method, f"{self._base}{path}", data, headers)

    @staticmethod
    def _default_transport(
        method: str,
        url: str,
        data: bytes,
        headers: Mapping[str, str],
    ) -> tuple[int, bytes]:
        req = Request(url, data=data, headers=dict(headers), method=method)
        try:
            with urlopen(req, timeout=60) as resp:
                return resp.status, resp.read()
        except HTTPError as exc:
            return exc.code, exc.read()
        except URLError as exc:
            raise ControlPlaneError(502, "SOURCE_UNAVAILABLE", str(exc.reason)) from exc
