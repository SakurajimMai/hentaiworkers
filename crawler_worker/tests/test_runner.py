import json
import tempfile
import unittest
from pathlib import Path

from crawler_worker.models.api import ClaimedJob, CrawlItemResult
from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.runtime.runner import Runner
from crawler_worker.sources.base import select_quality, should_skip
from crawler_worker.sources.hanime import HanimeSource
from crawler_worker.transport.control_client import ControlClient


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
                                {"requiredSource": "hanime", "fixtureItems": [{"id": "1", "title": "T", "videos": ["1080.mp4"]}]}
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
            if path.endswith("/items/commit"):
                return 200, json.dumps(
                    {"data": {"replayed": False, "itemId": 1, "status": "succeeded"}}
                ).encode()
            if path.endswith("/complete"):
                return 200, json.dumps({"data": {"status": "succeeded", "replayed": False}}).encode()
            return 500, b"{}"

        client = ControlClient(cfg, transport=transport)
        runner = Runner(cfg, client, {"hanime": HanimeSource()}, sleep=lambda _s: None)
        runner.run_forever(max_iterations=2)
        self.assertTrue(state["claimed"])

    def test_quality_and_skip_helpers(self):
        self.assertEqual(select_quality(["720.mp4", "1080.mp4"], ["1080", "720"]), "1080.mp4")
        self.assertTrue(should_skip("Preview PV", ["pv"]))
        self.assertFalse(should_skip("Main", ["pv"]))

    def test_hanime_parse_list_html(self):
        html = '<div data-id="9" data-title="Show" data-video="720.mp4,1080.mp4"></div>'
        src = HanimeSource()
        items = src.parse_list_html(html, priority=["1080"], skip_keywords=[])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].video_url, "1080.mp4")


if __name__ == "__main__":
    unittest.main()
