import json
import unittest

from crawler_worker.models.config import WorkerRuntimeConfig
from crawler_worker.transport.control_client import ControlClient, ControlPlaneError


class ControlClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cfg = WorkerRuntimeConfig(
            control_base_url="http://app:3000/api/internal/crawler/v1",
            worker_id=1,
            machine_token="token-abc",
        )
        self.calls: list[tuple] = []

    def _transport(self, method, url, data, headers):
        self.calls.append((method, url, data, dict(headers)))
        path = url.split("/v1", 1)[-1]
        if path.endswith("/jobs/claim") and b'"empty"' in data:
            return 204, b""
        if path.endswith("/jobs/claim"):
            body = {
                "data": {
                    "jobId": 9,
                    "attemptId": 3,
                    "leaseToken": "lease-1",
                    "leaseExpiresAt": "2099-01-01T00:00:00.000Z",
                    "kind": "crawl",
                    "status": "leased",
                    "configSnapshotJson": "{}",
                    "profileVersionId": 1,
                    "maxAttempts": 3,
                    "attemptNo": 1,
                }
            }
            return 200, json.dumps(body).encode()
        if "register" in path:
            return 200, json.dumps({"data": {"workerId": 1, "protocolVersion": 1}}).encode()
        if path.endswith("/heartbeat") and "/workers/" in path:
            return 200, json.dumps({"data": {"workerId": 1}}).encode()
        if path.endswith("/start"):
            return 200, json.dumps({"data": {"status": "running"}}).encode()
        if "/jobs/" in path and path.endswith("/heartbeat"):
            return 200, json.dumps(
                {"data": {"cancelRequested": False, "leaseExpiresAt": "t", "status": "running"}}
            ).encode()
        if path.endswith("/events/batch"):
            return 200, json.dumps({"data": {"accepted": 1}}).encode()
        if path.endswith("/items/exists"):
            return 200, json.dumps(
                {"data": {"exists": False, "animeId": None, "target": None}}
            ).encode()
        if path.endswith("/items/commit"):
            return 200, json.dumps(
                {"data": {"replayed": False, "itemId": 1, "status": "succeeded"}}
            ).encode()
        if path.endswith("/complete"):
            return 200, json.dumps({"data": {"status": "succeeded"}}).encode()
        if path.endswith("/credentials/refresh"):
            return 200, json.dumps(
                {"data": {"driver": "s3", "sessionToken": "s", "prefix": "p/"}}
            ).encode()
        if path.endswith("/media/reserve"):
            return 200, json.dumps(
                {
                    "data": {
                        "uploadId": 1,
                        "stagingKey": "staging/a",
                        "finalKey": "final/a",
                        "status": "reserved",
                    }
                }
            ).encode()
        if path.endswith("/media/status"):
            return 200, json.dumps(
                {"data": {"uploadId": 1, "status": "published"}}
            ).encode()
        return 500, json.dumps({"error": {"code": "INTERNAL_ERROR", "message": "x"}}).encode()

    def test_register_and_claim(self):
        client = ControlClient(self.cfg, transport=self._transport)
        reg = client.register()
        self.assertEqual(reg["protocolVersion"], 1)
        job = client.claim()
        self.assertIsNotNone(job)
        self.assertEqual(job.job_id, 9)
        self.assertEqual(job.lease_token, "lease-1")
        auth = self.calls[0][3]["Authorization"]
        self.assertTrue(auth.startswith("Bearer "))

    def test_lease_header_on_start(self):
        client = ControlClient(self.cfg, transport=self._transport)
        job = client.claim()
        client.start(job)
        headers = self.calls[-1][3]
        self.assertEqual(headers["X-Crawler-Lease-Token"], "lease-1")

    def test_item_exists_uses_source_mapping_endpoint(self):
        client = ControlClient(self.cfg, transport=self._transport)
        job = client.claim()
        result = client.item_exists(job, "hanime", "42")
        self.assertFalse(result["exists"])
        self.assertTrue(self.calls[-1][1].endswith("/jobs/9/items/exists"))

    def test_media_status_uses_lease_binding(self):
        client = ControlClient(self.cfg, transport=self._transport)
        job = client.claim()
        result = client.media_status(job, 1, "published")
        self.assertEqual(result["status"], "published")
        method, url, raw, headers = self.calls[-1]
        self.assertEqual(method, "POST")
        self.assertTrue(url.endswith("/jobs/9/media/status"))
        self.assertEqual(json.loads(raw)["uploadId"], 1)
        self.assertEqual(headers["X-Crawler-Lease-Token"], "lease-1")

    def test_batch_too_large(self):
        client = ControlClient(self.cfg, transport=self._transport)
        job = client.claim()
        with self.assertRaises(ControlPlaneError) as ctx:
            client.events_batch(job, [{"sequence": i, "eventType": "x"} for i in range(101)])
        self.assertEqual(ctx.exception.code, "BATCH_TOO_LARGE")

    def test_empty_claim(self):
        def transport(method, url, data, headers):
            return 204, b""

        client = ControlClient(self.cfg, transport=transport)
        self.assertIsNone(client.claim())

    def test_claim_preserves_control_plane_error_code_and_retryability(self):
        def forbidden(method, url, data, headers):
            return 403, json.dumps(
                {"error": {"code": "WORKER_FORBIDDEN", "message": "disabled", "retryable": False}}
            ).encode()

        with self.assertRaises(ControlPlaneError) as ctx:
            ControlClient(self.cfg, transport=forbidden).claim()
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(ctx.exception.code, "WORKER_FORBIDDEN")
        self.assertFalse(ctx.exception.retryable)

        def unavailable(method, url, data, headers):
            return 503, json.dumps(
                {"error": {"code": "SOURCE_UNAVAILABLE", "message": "down", "retryable": True}}
            ).encode()

        with self.assertRaises(ControlPlaneError) as transient:
            ControlClient(self.cfg, transport=unavailable).claim()
        self.assertTrue(transient.exception.retryable)

        with self.assertRaises(ControlPlaneError) as empty_transient:
            ControlClient(
                self.cfg,
                transport=lambda method, url, data, headers: (503, b""),
            ).claim()
        self.assertEqual(empty_transient.exception.status, 503)
        self.assertTrue(empty_transient.exception.retryable)

    def test_capabilities_have_no_db_fields(self):
        caps = self.cfg.capabilities()
        blob = json.dumps(caps)
        for banned in ("host", "password", "DATABASE", "mysql", "table"):
            self.assertNotIn(banned.lower(), blob.lower())

    def test_default_config_sources_include_maccms_presets_when_main_builds(self):
        from crawler_worker.sources.maccms import PROVIDER_PRESETS, build_maccms_sources

        sources = set(build_maccms_sources().keys())
        self.assertIn("maccms", sources)
        for key in PROVIDER_PRESETS:
            self.assertIn(key, sources)
        cfg = WorkerRuntimeConfig(
            control_base_url="http://app:3000/api/internal/crawler/v1",
            worker_id=1,
            machine_token="token-abc",
            sources=("hanime", *sorted(sources)),
        )
        caps = cfg.capabilities()
        self.assertIn("ikun", caps["sources"])
        self.assertIn("hongniu", caps["sources"])


if __name__ == "__main__":
    unittest.main()
