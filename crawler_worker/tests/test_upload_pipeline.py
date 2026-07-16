"""Unit tests for Hanime download/upload helpers (no network)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from crawler_worker.media.upload_pipeline import (
    _validate_public_http_url,
    abandon_published_media,
    extension_for_url,
    publish_item_media,
    run_storage_test,
    storage_driver_from_snapshot,
)
from crawler_worker.models.api import ClaimedJob, CrawlItemResult, MediaReservation
from crawler_worker.transport.control_client import ControlPlaneError


class UploadPipelineTests(unittest.TestCase):
    def test_storage_driver_from_snapshot(self) -> None:
        self.assertEqual(storage_driver_from_snapshot({"storageDriver": "s3"}), "s3")
        self.assertEqual(
            storage_driver_from_snapshot({"storageConfig": {"driver": "sftp"}}),
            "sftp",
        )
        self.assertIsNone(storage_driver_from_snapshot({}))

    def test_extension_for_url(self) -> None:
        self.assertEqual(extension_for_url("https://cdn.example/a/b.mp4?x=1"), ".mp4")
        self.assertEqual(extension_for_url("https://cdn.example/a/b.jpg"), ".jpg")
        self.assertEqual(extension_for_url("https://cdn.example/a/b.m3u8"), ".bin")

    def test_media_url_validation_rejects_private_targets(self) -> None:
        for url in (
            "http://127.0.0.1/video.mp4",
            "http://169.254.169.254/latest/meta-data",
            "http://localhost/video.mp4",
            "file:///etc/passwd",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                _validate_public_http_url(url)

    def test_publish_item_media_uploads_mp4(self) -> None:
        job = ClaimedJob(
            job_id=9,
            attempt_id=2,
            lease_token="t",
            lease_expires_at="2099-01-01T00:00:00Z",
            kind="crawl",
            status="running",
            config_snapshot_json="{}",
            profile_version_id=1,
            max_attempts=3,
            attempt_no=1,
        )
        item = CrawlItemResult(
            source="hanime",
            source_id="../../outside",
            title="t",
            video_url="https://cdn.example/v.mp4",
            cover_url=None,
            tags=(),
            status="succeeded",
        )
        client = MagicMock()
        client.media_reserve.return_value = MediaReservation(
            upload_id=1,
            staging_key="staging/a",
            final_key="final/a.mp4",
            status="reserved",
        )
        adapter = MagicMock()
        adapter.upload_staging.return_value = "abc"
        from crawler_worker.media.base import UploadResult

        adapter.publish.return_value = UploadResult(
            staging_key="staging/a",
            final_key="final/a.mp4",
            checksum_sha256="abc",
            byte_size=4,
            public_url="https://media.example/final/a.mp4",
        )

        downloaded_to: list[Path] = []
        with tempfile.TemporaryDirectory() as tmp:
            # Monkeypatch download to write a local file without network.
            import crawler_worker.media.upload_pipeline as up

            def fake_download(url: str, dest: Path, **kwargs):  # type: ignore[no-untyped-def]
                downloaded_to.append(dest)
                dest.write_bytes(b"mp4!")
                return dest

            original = up.download_http_file
            up.download_http_file = fake_download  # type: ignore[assignment]
            try:
                out = publish_item_media(
                    client=client,
                    job=job,
                    item=item,
                    snapshot={
                        "storageDriver": "s3",
                        "storageConfig": {
                            "driver": "s3",
                            "bucket": "b",
                            "prefix": "p/",
                            "publicBaseUrl": "https://media.example",
                        },
                    },
                    workdir=Path(tmp),
                    adapter=adapter,
                )
            finally:
                up.download_http_file = original  # type: ignore[assignment]

        self.assertEqual(out.item.video_url, "https://media.example/final/a.mp4")
        self.assertEqual(out.handles[0].upload_id, 1)
        self.assertEqual(downloaded_to[0].parent, Path(tmp))
        self.assertEqual(downloaded_to[0].name, "upload-1.mp4")
        client.media_reserve.assert_called_once()
        adapter.upload_staging.assert_called_once()
        adapter.publish.assert_called_once()
        adapter.cleanup.assert_called_once_with("staging/a")
        self.assertEqual(
            [call.args[2] for call in client.media_status.call_args_list],
            ["uploaded", "published"],
        )

    def test_storage_test_retries_idempotent_complete_and_cleans_probe(self) -> None:
        job = ClaimedJob(2, 3, "t", "2099-01-01T00:00:00Z", "storage_test", "running", "{}", 0, 3, 1)
        client = MagicMock()
        client.media_reserve.return_value = MediaReservation(
            upload_id=9,
            staging_key="staging/test",
            final_key="final/test",
            status="reserved",
        )
        client.complete.side_effect = [
            ControlPlaneError(500, "INTERNAL_ERROR", "temporary"),
            {"status": "succeeded", "replayed": True},
        ]
        adapter = MagicMock()
        from crawler_worker.media.base import UploadResult

        adapter.publish.return_value = UploadResult(
            staging_key="staging/test",
            final_key="final/test",
            checksum_sha256="abc",
            byte_size=1,
            public_url="https://cdn.example/final/test",
        )
        with tempfile.TemporaryDirectory() as tmp, patch(
            "crawler_worker.media.upload_pipeline.build_media_adapter",
            return_value=adapter,
        ), patch("crawler_worker.media.upload_pipeline.time.sleep"):
            run_storage_test(
                client=client,
                job=job,
                snapshot={"storageConfig": {"driver": "s3"}},
                workdir=Path(tmp),
            )

        self.assertEqual(client.complete.call_count, 2)
        self.assertEqual(client.complete.call_args_list[0].args[1], client.complete.call_args_list[1].args[1])
        self.assertEqual(
            [call.args[2] for call in client.media_status.call_args_list],
            ["uploaded", "published", "cleaned"],
        )
        adapter.cleanup.assert_any_call("final/test")
        adapter.close.assert_called_once()

    def test_disabled_cover_keeps_original_cover_url(self) -> None:
        job = ClaimedJob(3, 1, "t", "2099-01-01T00:00:00Z", "crawl", "running", "{}", 1, 3, 1)
        item = CrawlItemResult(
            source="hanime",
            source_id="7",
            title="t",
            video_url="https://cdn.example/v.mp4",
            cover_url="https://cdn.example/c.jpg",
            tags=(),
            status="succeeded",
        )
        client = MagicMock()
        client.media_reserve.return_value = MediaReservation(
            upload_id=1,
            staging_key="staging/v",
            final_key="final/v.mp4",
            status="reserved",
        )
        adapter = MagicMock()
        from crawler_worker.media.base import UploadResult

        adapter.publish.return_value = UploadResult(
            staging_key="staging/v",
            final_key="final/v.mp4",
            checksum_sha256="abc",
            byte_size=4,
            public_url="https://media.example/final/v.mp4",
        )
        with tempfile.TemporaryDirectory() as tmp, patch(
            "crawler_worker.media.upload_pipeline.download_http_file",
            side_effect=lambda _url, dest, **_kwargs: (dest.write_bytes(b"data"), dest)[1],
        ):
            out = publish_item_media(
                client=client,
                job=job,
                item=item,
                snapshot={
                    "storageConfig": {"driver": "s3"},
                    "media": {"enableCover": False, "enableFanart": False},
                },
                workdir=Path(tmp),
                adapter=adapter,
            )
        self.assertEqual(out.item.video_url, "https://media.example/final/v.mp4")
        self.assertEqual(out.item.cover_url, "https://cdn.example/c.jpg")
        self.assertEqual(client.media_reserve.call_count, 1)

    def test_abandon_published_media_cleans_final_and_marks_abandoned(self) -> None:
        job = ClaimedJob(4, 1, "t", "2099-01-01T00:00:00Z", "crawl", "running", "{}", 1, 3, 1)
        client = MagicMock()
        adapter = MagicMock()
        from crawler_worker.media.upload_pipeline import PublishedMediaHandle

        handles = (
            PublishedMediaHandle(upload_id=11, final_key="final/v.mp4", public_url="https://cdn/v.mp4"),
            PublishedMediaHandle(upload_id=12, final_key="final/c.jpg", public_url="https://cdn/c.jpg"),
        )
        abandon_published_media(client=client, job=job, media=adapter, handles=handles)
        self.assertEqual(
            [call.args[0] for call in adapter.cleanup.call_args_list],
            ["final/v.mp4", "final/c.jpg"],
        )
        self.assertEqual(
            [call.args[2] for call in client.media_status.call_args_list],
            ["abandoned", "abandoned"],
        )

    def test_publish_failure_cleans_staging_final_and_marks_abandoned(self) -> None:
        job = ClaimedJob(1, 1, "t", "2099-01-01T00:00:00Z", "crawl", "running", "{}", 1, 3, 1)
        item = CrawlItemResult(
            source="hanime",
            source_id="42",
            title="title",
            video_url="https://cdn.example/v.mp4",
            cover_url=None,
            tags=(),
            status="succeeded",
        )
        client = MagicMock()
        client.media_reserve.return_value = MediaReservation(
            upload_id=8,
            staging_key="staging/v",
            final_key="final/v.mp4",
            status="reserved",
        )
        adapter = MagicMock()
        from crawler_worker.media.base import UploadResult

        adapter.publish.return_value = UploadResult(
            staging_key="staging/v",
            final_key="final/v.mp4",
            checksum_sha256="abc",
            byte_size=4,
            public_url=None,
        )
        with tempfile.TemporaryDirectory() as tmp, patch(
            "crawler_worker.media.upload_pipeline.download_http_file",
            side_effect=lambda _url, dest, **_kwargs: (dest.write_bytes(b"data"), dest)[1],
        ):
            with self.assertRaisesRegex(ValueError, "public URL"):
                publish_item_media(
                    client=client,
                    job=job,
                    item=item,
                    snapshot={"storageConfig": {"driver": "s3"}},
                    workdir=Path(tmp),
                    adapter=adapter,
                )

        self.assertIn((("staging/v",), {}), [(call.args, call.kwargs) for call in adapter.cleanup.call_args_list])
        self.assertIn((("final/v.mp4",), {}), [(call.args, call.kwargs) for call in adapter.cleanup.call_args_list])
        self.assertEqual(client.media_status.call_args_list[-1].args[2], "abandoned")


if __name__ == "__main__":
    unittest.main()
