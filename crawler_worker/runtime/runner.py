"""Cooperative job runner: claim → start → source → commit → complete."""

from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Callable, Optional

from crawler_worker.media.upload_pipeline import (
    abandon_published_media,
    build_media_adapter,
    publish_item_media,
    run_storage_test,
    storage_driver_from_snapshot,
)
from crawler_worker.models.api import ClaimedJob, CrawlItemResult
from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.runtime.heartbeat import HeartbeatLoop
from crawler_worker.sources.base import SourceAdapter
from crawler_worker.sources.getchu import find_getchu_fanart
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
            job_interval_seconds=config.job_heartbeat_seconds,
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
        media_adapter = None
        try:
            self._client.start(job)
            self._hb.start_job(job)
            seq = self._log(job, seq, "job_started", f"job {job.job_id}")

            snapshot = json.loads(job.config_snapshot_json or "{}")

            # Object-storage connectivity smoke (admin storage page).
            if job.kind == "storage_test" or snapshot.get("kind") == "storage_test":
                try:
                    run_storage_test(
                        client=self._client,
                        job=job,
                        snapshot=snapshot,
                        workdir=workdir,
                    )
                    seq = self._log(job, seq, "storage_test", "storage_test succeeded")
                except Exception as exc:
                    self._client.fail(
                        job,
                        f"fail-{job.job_id}-{job.attempt_id}-storage-test",
                        retryable=True,
                        error_code="STORAGE_TEST_FAILED",
                        error_message=str(exc)[:500],
                    )
                return

            source_field = snapshot.get("source")
            source_name = str(
                snapshot.get("requiredSource")
                or (source_field if isinstance(source_field, str) else None)
                or (source_field.get("provider") if isinstance(source_field, dict) else None)
                or "hanime"
            )
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

            results = list(adapter.crawl(snapshot, workdir=workdir, should_stop=lambda: self._cancel))
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
            skipped = 0
            transient_source_failures = 0
            needs_upload = storage_driver_from_snapshot(snapshot) in ("s3", "sftp")
            skip_existing = bool(snapshot.get("skipExisting", True))
            for item in results:
                if self._cancel:
                    break
                published_handles = ()
                if (
                    skip_existing
                    and item.source == "hanime"
                    and item.status == "succeeded"
                    and self._client.item_exists(job, item.source, item.source_id).get("exists")
                ):
                    item = replace(
                        item,
                        video_url=None,
                        status="skipped",
                        error_code=None,
                        error_message="already ingested",
                    )
                elif needs_upload and item.status == "succeeded" and item.video_url:
                    if media_adapter is None:
                        media_adapter = build_media_adapter(snapshot)
                    media_options = (
                        snapshot.get("media") if isinstance(snapshot.get("media"), dict) else {}
                    )
                    if item.source == "hanime" and bool(media_options.get("enableFanart", True)):
                        try:
                            getchu_urls = find_getchu_fanart(
                                item.title,
                                max_images=int(media_options.get("maxFanartImages") or 50),
                            )
                            item = replace(
                                item,
                                fanart_urls=tuple(
                                    dict.fromkeys((*item.fanart_urls, *getchu_urls))
                                ),
                            )
                        except Exception:
                            pass
                    published_handles = ()
                    try:
                        published = publish_item_media(
                            client=self._client,
                            job=job,
                            item=item,
                            snapshot=snapshot,
                            workdir=workdir,
                            adapter=media_adapter,
                        )
                        item = published.item
                        published_handles = published.handles
                        seq = self._log(
                            job,
                            seq,
                            "upload",
                            f"{item.source_id} published {item.video_url}",
                        )
                    except Exception as exc:
                        item = replace(
                            item,
                            video_url=None,
                            status="failed",
                            error_code="STORAGE_UPLOAD_FAILED",
                            error_message=str(exc)[:500],
                        )
                commit_key = f"item-{job.job_id}-{item.source}-{item.source_id}"
                commit = None
                for commit_attempt in range(3):
                    try:
                        commit = self._client.items_commit(
                            job,
                            idempotency_key=commit_key,
                            source=item.source,
                            source_id=item.source_id,
                            status=item.status,
                            title=item.title,
                            title_english=item.title_english,
                            title_japanese=item.title_japanese,
                            video_url=item.video_url,
                            cover_url=item.cover_url,
                            fanart_urls=item.fanart_urls,
                            description=item.description,
                            tags=item.tags,
                            release_year=item.release_year,
                            release_date=item.release_date,
                            remarks=getattr(item, "remarks", None),
                            actors=getattr(item, "actors", None),
                            directors=getattr(item, "directors", None),
                            aliases=getattr(item, "aliases", None),
                            area=getattr(item, "area", None),
                            lang=getattr(item, "lang", None),
                            source_updated_at=getattr(item, "source_updated_at", None),
                            error_code=item.error_code,
                            error_message=item.error_message,
                            play_lines=list(getattr(item, "play_lines", ()) or ()),
                        )
                        break
                    except ControlPlaneError as exc:
                        # The same idempotency key makes replay safe if the first
                        # response was lost after the catalog transaction committed.
                        if exc.status < 500 or commit_attempt == 2:
                            if published_handles and media_adapter is not None:
                                abandon_published_media(
                                    client=self._client,
                                    job=job,
                                    media=media_adapter,
                                    handles=published_handles,
                                )
                                item = replace(
                                    item,
                                    video_url=None,
                                    status="failed",
                                    error_code="RESULT_COMMIT_FAILED",
                                    error_message=str(exc)[:500],
                                )
                                try:
                                    commit = self._client.items_commit(
                                        job,
                                        idempotency_key=f"{commit_key}-failed",
                                        source=item.source,
                                        source_id=item.source_id,
                                        status=item.status,
                                        title=item.title,
                                        title_english=item.title_english,
                                        title_japanese=item.title_japanese,
                                        video_url=None,
                                        cover_url=item.cover_url,
                                        fanart_urls=item.fanart_urls,
                                        description=item.description,
                                        tags=item.tags,
                                        release_year=item.release_year,
                                        release_date=item.release_date,
                                        remarks=getattr(item, "remarks", None),
                                        actors=getattr(item, "actors", None),
                                        directors=getattr(item, "directors", None),
                                        aliases=getattr(item, "aliases", None),
                                        area=getattr(item, "area", None),
                                        lang=getattr(item, "lang", None),
                                        source_updated_at=getattr(item, "source_updated_at", None),
                                        error_code=item.error_code,
                                        error_message=item.error_message,
                                        play_lines=list(getattr(item, "play_lines", ()) or ()),
                                    )
                                except ControlPlaneError:
                                    commit = type(
                                        "R",
                                        (),
                                        {"replayed": False, "item_id": 0, "status": "failed"},
                                    )()
                                break
                            raise
                        self._sleep(2 ** commit_attempt)
                if commit is None:
                    raise RuntimeError("item commit did not return a result")
                if item.status == "succeeded":
                    succeeded += 1
                elif item.status == "failed":
                    failed += 1
                    if item.error_code == "SOURCE_UNAVAILABLE":
                        transient_source_failures += 1
                elif item.status == "skipped":
                    skipped += 1
                err_suffix = f" {item.error_code}" if item.error_code else ""
                if item.error_message:
                    err_suffix += f": {item.error_message[:180]}"
                seq = self._log(
                    job,
                    seq,
                    "item",
                    f"{item.source_id} {item.status} replayed={commit.replayed}{err_suffix}",
                )

            # Pure source outages should re-enter retry_wait (attempts remaining),
            # not terminal-complete as "failed" with no automatic retry.
            if (
                succeeded == 0
                and failed > 0
                and transient_source_failures == failed
            ):
                first_err = next(
                    (i.error_message for i in results if i.status == "failed" and i.error_message),
                    "source unavailable",
                )
                self._client.fail(
                    job,
                    f"fail-{job.job_id}-{job.attempt_id}-source",
                    retryable=True,
                    error_code="SOURCE_UNAVAILABLE",
                    error_message=str(first_err)[:500],
                )
                return

            outcome = "succeeded"
            if failed and succeeded:
                outcome = "partial_succeeded"
            elif failed and not succeeded:
                outcome = "failed"
            self._client.complete(
                job,
                f"complete-{job.job_id}-{job.attempt_id}",
                outcome=outcome,
                succeeded_items=succeeded,
                failed_items=failed,
                continue_on_error=bool(snapshot.get("continueOnError", True)),
            )
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
            if media_adapter is not None:
                try:
                    media_adapter.close()
                except Exception:
                    pass
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
