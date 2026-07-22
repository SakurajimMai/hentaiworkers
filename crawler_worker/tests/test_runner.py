import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from crawler_worker.models.api import ClaimedJob, CrawlItemResult
from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.runtime.runner import Runner
from crawler_worker.sources.base import select_quality, should_skip
from crawler_worker.sources.hanime import HanimeSource
from crawler_worker.sources.maccms import MacCmsSource
from crawler_worker.transport.control_client import ControlClient, ControlPlaneError


class FakeSource:
    name = "hanime"

    def crawl(self, snapshot, *, workdir, should_stop):
        return [
            CrawlItemResult(
                source="hanime",
                source_id="1",
                title="A",
                video_url="https://cdn/v.mp4",
                cover_url=None,
                tags=(),
                status="succeeded",
            )
        ]


class RunnerTests(unittest.TestCase):
    def test_auth_failure_exits_without_retrying(self):
        class Client:
            def __init__(self):
                self.register_calls = 0

            def register(self):
                self.register_calls += 1
                raise ControlPlaneError(403, "WORKER_FORBIDDEN", "disabled")

        sleeps = []
        client = Client()
        runner = Runner(
            WorkerRuntimeConfig("https://control.example", 1, "t"),
            client,
            {},
            sleep=sleeps.append,
        )
        with self.assertRaises(ControlPlaneError) as ctx:
            runner.run_forever(max_iterations=1)
        self.assertEqual(ctx.exception.code, "WORKER_FORBIDDEN")
        self.assertEqual(client.register_calls, 1)
        self.assertEqual(sleeps, [])

    def test_transient_registration_and_claim_failures_use_bounded_backoff(self):
        class Client:
            def __init__(self):
                self.register_calls = 0
                self.claim_calls = 0
                self.heartbeat_calls = 0

            def register(self):
                self.register_calls += 1
                if self.register_calls < 3:
                    raise ControlPlaneError(503, "SOURCE_UNAVAILABLE", "down", retryable=True)
                return {}

            def claim(self):
                self.claim_calls += 1
                if self.claim_calls < 3:
                    raise ControlPlaneError(503, "SOURCE_UNAVAILABLE", "down", retryable=True)
                return None

            def worker_heartbeat(self, current_load=0):
                self.heartbeat_calls += 1
                return {}

        sleeps = []
        client = Client()
        runner = Runner(
            WorkerRuntimeConfig("https://control.example", 1, "t", idle_heartbeat_seconds=3600),
            client,
            {},
            sleep=sleeps.append,
        )
        runner.run_forever(max_iterations=3)
        self.assertEqual(client.register_calls, 3)
        self.assertEqual(client.claim_calls, 3)
        self.assertGreaterEqual(client.heartbeat_calls, 1)
        self.assertEqual(sleeps[:4], [1.0, 2.0, 1.0, 2.0])
        self.assertLessEqual(max(sleeps), 30.0)

    def test_empty_claim_keeps_idle_heartbeat_running(self):
        class Client:
            def __init__(self):
                self.heartbeat_calls = 0

            def register(self):
                return {}

            def claim(self):
                return None

            def worker_heartbeat(self, current_load=0):
                self.heartbeat_calls += 1
                return {}

        client = Client()
        runner = Runner(
            WorkerRuntimeConfig("https://control.example", 1, "t", idle_heartbeat_seconds=3600),
            client,
            {},
            sleep=lambda _seconds: None,
        )
        runner.run_forever(max_iterations=2)
        self.assertGreaterEqual(client.heartbeat_calls, 2)

    def test_run_one_job_with_fixture_source(self):
        cfg = WorkerRuntimeConfig(
            control_base_url="http://app/api/internal/crawler/v1",
            worker_id=1,
            machine_token="t",
            temp_dir=tempfile.mkdtemp(),
        )
        state = {"claimed": False}

        def transport(method, url, data, headers):
            path = url
            if path.endswith("/register"):
                return 200, json.dumps({"data": {"workerId": 1, "protocolVersion": 1}}).encode()
            if path.endswith("/jobs/claim"):
                if state["claimed"]:
                    return 204, b""
                state["claimed"] = True
                return 200, json.dumps(
                    {
                        "data": {
                            "jobId": 1,
                            "attemptId": 1,
                            "leaseToken": "L",
                            "leaseExpiresAt": "2099-01-01T00:00:00Z",
                            "kind": "crawl",
                            "status": "leased",
                            "configSnapshotJson": json.dumps(
                                {"requiredSource": "hanime"}
                            ),
                            "profileVersionId": 1,
                            "maxAttempts": 3,
                            "attemptNo": 1,
                        }
                    }
                ).encode()
            if path.endswith("/start"):
                return 200, json.dumps({"data": {"status": "running"}}).encode()
            if path.endswith("/heartbeat"):
                if "/workers/" in path:
                    return 200, json.dumps({"data": {"workerId": 1}}).encode()
                return 200, json.dumps(
                    {"data": {"cancelRequested": False, "leaseExpiresAt": "t", "status": "running"}}
                ).encode()
            if path.endswith("/events/batch"):
                return 200, json.dumps({"data": {"accepted": 1}}).encode()
            if path.endswith("/items/exists"):
                return 200, json.dumps({"data": {"exists": False}}).encode()
            if path.endswith("/items/commit"):
                return 200, json.dumps(
                    {"data": {"replayed": False, "itemId": 1, "status": "succeeded"}}
                ).encode()
            if path.endswith("/complete"):
                return 200, json.dumps({"data": {"status": "succeeded", "replayed": False}}).encode()
            return 500, b"{}"

        client = ControlClient(cfg, transport=transport)
        runner = Runner(cfg, client, {"hanime": FakeSource()}, sleep=lambda _s: None)
        runner.run_forever(max_iterations=2)
        self.assertTrue(state["claimed"])

    def test_skip_existing_avoids_storage_and_getchu_and_preserves_metadata(self):
        class ExistingSource:
            name = "hanime"

            def crawl(self, snapshot, *, workdir, should_stop):
                return [
                    CrawlItemResult(
                        source="hanime",
                        source_id="42",
                        title="Existing",
                        video_url="https://cdn.example/v.mp4",
                        cover_url="https://cdn.example/c.jpg",
                        tags=("Drama",),
                        status="succeeded",
                        actors="Actor A",
                        directors="Director D",
                        aliases="Alias",
                        area="日本",
                        lang="日语",
                        play_lines=({"name": "line", "episodes": []},),
                    )
                ]

        class Client:
            def __init__(self):
                self.commit = None
                self.completed = False

            def start(self, job):
                return None

            def item_exists(self, job, source, source_id):
                return {"exists": True, "animeId": 77}

            def items_commit(self, job, **kwargs):
                self.commit = kwargs
                return type("R", (), {"replayed": False})()

            def complete(self, *args, **kwargs):
                self.completed = True
                return {"status": "succeeded"}

            def fail(self, *args, **kwargs):
                raise AssertionError("skip-existing job should not fail")

            def events_batch(self, job, events):
                return None

            def job_heartbeat(self, job):
                return type(
                    "HB",
                    (),
                    {"cancel_requested": False, "lease_expires_at": "t", "status": "running"},
                )()

        cfg = WorkerRuntimeConfig(
            control_base_url="https://control.example",
            worker_id=1,
            machine_token="t",
        )
        job = ClaimedJob(
            job_id=1,
            attempt_id=1,
            lease_token="lease",
            lease_expires_at="2099-01-01T00:00:00Z",
            kind="crawl",
            status="leased",
            config_snapshot_json=json.dumps(
                {
                    "requiredSource": "hanime",
                    "storageDriver": "s3",
                    "storageConfig": {"driver": "s3"},
                    "skipExisting": True,
                    "requestDelaySeconds": 0,
                }
            ),
            profile_version_id=1,
            max_attempts=3,
            attempt_no=1,
        )
        client = Client()
        runner = Runner(cfg, client, {"hanime": ExistingSource()}, sleep=lambda _s: None)
        with patch(
            "crawler_worker.runtime.runner.build_media_adapter",
            side_effect=AssertionError("storage must not initialize"),
        ), patch(
            "crawler_worker.runtime.runner.find_getchu_fanart",
            side_effect=AssertionError("Getchu must not run"),
        ):
            runner._run_job(job)

        self.assertTrue(client.completed)
        self.assertEqual(client.commit["status"], "skipped")
        self.assertEqual(client.commit["actors"], "Actor A")
        self.assertEqual(client.commit["directors"], "Director D")
        self.assertEqual(client.commit["aliases"], "Alias")
        self.assertEqual(client.commit["play_lines"], [{"name": "line", "episodes": []}])

    def test_commit_failure_after_publish_abandons_media_and_records_failed_item(self):
        class Source:
            name = "hanime"

            def crawl(self, snapshot, *, workdir, should_stop):
                return [
                    CrawlItemResult(
                        source="hanime",
                        source_id="55",
                        title="Published",
                        video_url="https://cdn.example/v.mp4",
                        cover_url=None,
                        tags=(),
                        status="succeeded",
                    )
                ]

        class Client:
            def __init__(self):
                self.commits = []
                self.completed = False

            def start(self, job):
                return None

            def item_exists(self, job, source, source_id):
                return {"exists": False}

            def items_commit(self, job, **kwargs):
                self.commits.append(kwargs)
                if kwargs["status"] == "succeeded":
                    raise ControlPlaneError(500, "INTERNAL_ERROR", "commit unavailable")
                return type("R", (), {"replayed": False, "item_id": 9, "status": kwargs["status"]})()

            def complete(self, *args, **kwargs):
                self.completed = True
                return {"status": "failed"}

            def fail(self, *args, **kwargs):
                raise AssertionError("item-level commit failure should not fail the job lease")

            def events_batch(self, job, events):
                return None

            def job_heartbeat(self, job):
                return type(
                    "HB",
                    (),
                    {"cancel_requested": False, "lease_expires_at": "t", "status": "running"},
                )()

        cfg = WorkerRuntimeConfig(
            control_base_url="https://control.example",
            worker_id=1,
            machine_token="t",
        )
        job = ClaimedJob(
            job_id=8,
            attempt_id=1,
            lease_token="lease",
            lease_expires_at="2099-01-01T00:00:00Z",
            kind="crawl",
            status="leased",
            config_snapshot_json=json.dumps(
                {
                    "requiredSource": "hanime",
                    "storageDriver": "s3",
                    "storageConfig": {"driver": "s3"},
                    "skipExisting": False,
                    "continueOnError": True,
                }
            ),
            profile_version_id=1,
            max_attempts=3,
            attempt_no=1,
        )
        client = Client()
        runner = Runner(cfg, client, {"hanime": Source()}, sleep=lambda _s: None)
        from crawler_worker.media.upload_pipeline import PublishedItemMedia, PublishedMediaHandle

        published = PublishedItemMedia(
            item=CrawlItemResult(
                source="hanime",
                source_id="55",
                title="Published",
                video_url="https://media.example/final.mp4",
                cover_url=None,
                tags=(),
                status="succeeded",
            ),
            handles=(
                PublishedMediaHandle(
                    upload_id=3,
                    final_key="final/video.mp4",
                    public_url="https://media.example/final.mp4",
                ),
            ),
        )
        abandoned = {"called": False}

        with patch(
            "crawler_worker.runtime.runner.build_media_adapter",
            return_value=object(),
        ), patch(
            "crawler_worker.runtime.runner.publish_item_media",
            return_value=published,
        ), patch(
            "crawler_worker.runtime.runner.abandon_published_media",
            side_effect=lambda **kwargs: abandoned.__setitem__("called", True),
        ):
            runner._run_job(job)

        self.assertTrue(client.completed)
        self.assertTrue(abandoned["called"])
        self.assertEqual(client.commits[-1]["status"], "failed")
        self.assertEqual(client.commits[-1]["error_code"], "RESULT_COMMIT_FAILED")

    def test_quality_and_skip_helpers(self):
        self.assertEqual(select_quality(["720.mp4", "1080.mp4"], ["1080", "720"]), "1080.mp4")
        self.assertTrue(should_skip("Preview PV", ["pv"]))
        self.assertFalse(should_skip("Main", ["pv"]))

    def test_maccms_job_commits_latest_m3u8(self):
        pages = {
            "https://api.example/provide/vod/?ac=detail&t=37&pg=1": {
                "code": 1,
                "list": [
                    {
                        "vod_id": 77,
                        "vod_name": "MacCMS 日番",
                        "type_name": "日本动漫",
                        "vod_area": "日本",
                        "vod_year": "2026",
                        "vod_play_from": "ikm3u8",
                        "vod_play_url": "第1集$https://cdn.example/e1.m3u8#第2集$https://cdn.example/e2.m3u8",
                        "vod_pic": "https://img.example/c.jpg",
                    }
                ],
            }
        }
        from crawler_worker.sources.maccms import MacCmsSource

        class Client:
            def __init__(self):
                self.commits = []
                self.completed = False

            def register(self):
                return None

            def claim(self):
                if self.completed:
                    return None
                return ClaimedJob(
                    job_id=9,
                    attempt_id=1,
                    lease_token="tok",
                    lease_expires_at="2099-01-01T00:00:00Z",
                    kind="crawl",
                    status="leased",
                    config_snapshot_json=json.dumps(
                        {
                            "requiredSource": "ikun",
                            "source": {
                                "baseUrl": "https://api.example/provide/vod/",
                                "typeIds": [37],
                                "maxPages": 1,
                                "filterJpKr": True,
                            },
                            "dateFilter": {"years": [2026], "months": [7]},
                            "media": {"enableCover": False},
                        }
                    ),
                    profile_version_id=1,
                    max_attempts=3,
                    attempt_no=1,
                )

            def start(self, job):
                return None

            def items_commit(self, job, **kwargs):
                self.commits.append(kwargs)
                return type("R", (), {"replayed": False, "item_id": 1, "status": kwargs["status"]})()

            def complete(self, job, idempotency_key, outcome="succeeded", **kwargs):
                self.completed = True
                return {"status": outcome}

            def fail(self, *a, **k):
                raise AssertionError("should not fail")

            def cancel_ack(self, job):
                return None

            def worker_heartbeat(self, current_load=0):
                return None

            def job_heartbeat(self, job):
                return type(
                    "HB",
                    (),
                    {"cancel_requested": False, "lease_expires_at": "t", "status": "running"},
                )()

            def events_batch(self, job, events):
                return None

        cfg = WorkerRuntimeConfig(
            control_base_url="https://control.example",
            worker_id=1,
            machine_token="t",
            sources=("ikun",),
        )
        client = Client()
        runner = Runner(
            cfg,
            client,
            {"ikun": MacCmsSource("ikun", fetch_json=lambda url: pages[url])},
            sleep=lambda _s: None,
        )
        runner.run_forever(max_iterations=1)
        self.assertTrue(client.completed)
        self.assertEqual(len(client.commits), 1)
        self.assertEqual(client.commits[0]["video_url"], "https://cdn.example/e2.m3u8")
        self.assertIsNone(client.commits[0]["cover_url"])
        self.assertEqual(client.commits[0]["source"], "ikun")


    def test_transient_source_unavailable_calls_fail_retryable(self):
        class Client:
            def __init__(self):
                self.failed = None
                self.completed = False
                self.commits = []

            def register(self):
                return None

            def claim(self, sources=None, max_jobs=1):
                return type(
                    "J",
                    (),
                    {
                        "job_id": 9,
                        "attempt_id": 90,
                        "lease_token": "lease",
                        "lease_expires_at": "2099-01-01T00:00:00Z",
                        "kind": "crawl",
                        "status": "leased",
                        "config_snapshot_json": json.dumps(
                            {
                                "requiredSource": "ikun",
                                "source": {
                                    "baseUrl": "https://api.example/provide/vod/",
                                    "typeIds": [37],
                                    "maxPages": 1,
                                    "filterJpKr": False,
                                    "autoDetectTypes": False,
                                },
                                "dateFilter": {"years": [2026], "months": [7]},
                                "continueOnError": True,
                            }
                        ),
                        "profile_version_id": 1,
                        "max_attempts": 3,
                        "attempt_no": 1,
                    },
                )()

            def start(self, job):
                return None

            def items_commit(self, job, **kwargs):
                self.commits.append(kwargs)
                return type("R", (), {"replayed": False, "item_id": 1, "status": kwargs["status"]})()

            def complete(self, *a, **k):
                self.completed = True
                raise AssertionError("pure source outage should not complete")

            def fail(self, job, idempotency_key, *, retryable, error_code="", error_message=""):
                self.failed = {
                    "retryable": retryable,
                    "error_code": error_code,
                    "error_message": error_message,
                }
                return {"status": "retry_wait"}

            def cancel_ack(self, job):
                return None

            def worker_heartbeat(self, current_load=0):
                return None

            def job_heartbeat(self, job):
                return type(
                    "HB",
                    (),
                    {"cancel_requested": False, "lease_expires_at": "t", "status": "running"},
                )()

            def events_batch(self, job, events):
                return None

        def boom(_url: str):
            raise ConnectionResetError(10054, "远程主机强迫关闭了一个现有的连接。")

        cfg = WorkerRuntimeConfig(
            control_base_url="https://control.example",
            worker_id=1,
            machine_token="t",
            sources=("ikun",),
        )
        client = Client()
        runner = Runner(
            cfg,
            client,
            {"ikun": MacCmsSource("ikun", fetch_json=boom)},
            sleep=lambda _s: None,
        )
        runner.run_forever(max_iterations=1)
        self.assertFalse(client.completed)
        self.assertIsNotNone(client.failed)
        self.assertTrue(client.failed["retryable"])
        self.assertEqual(client.failed["error_code"], "SOURCE_UNAVAILABLE")
        self.assertEqual(len(client.commits), 1)
        self.assertEqual(client.commits[0]["status"], "failed")

    def test_hanime_parse_list_html(self):
        html = '<div data-id="9" data-title="Show" data-video="720.mp4,1080.mp4"></div>'
        src = HanimeSource()
        items = src.parse_list_html(html, priority=["1080"], skip_keywords=[])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].video_url, "1080.mp4")


if __name__ == "__main__":
    unittest.main()
