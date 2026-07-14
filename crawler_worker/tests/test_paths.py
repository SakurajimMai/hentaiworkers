import unittest
from datetime import datetime, timezone

from crawler_worker.media.paths import build_object_keys, public_url_for


class PathTests(unittest.TestCase):
    def test_build_keys_deterministic(self):
        staging, final = build_object_keys(
            prefix="anime/",
            job_id=1,
            attempt_id=2,
            item_key="ep-1",
            asset_kind="video",
            organize_by_date=True,
            now=datetime(2026, 7, 13, tzinfo=timezone.utc),
        )
        self.assertTrue(staging.startswith("staging/anime/2026-07-13/job-1/attempt-2/video/"))
        self.assertTrue(final.startswith("final/anime/2026-07-13/job-1/attempt-2/video/"))

    def test_sftp_without_public_mapping_rejects_playback_url(self):
        url = public_url_for(
            driver="sftp",
            final_key="final/x",
            public_base_url=None,
            delivery_mode="public",
        )
        self.assertIsNone(url)

    def test_s3_public_url(self):
        url = public_url_for(
            driver="s3",
            final_key="final/a.mp4",
            public_base_url="https://cdn.example.com",
        )
        self.assertEqual(url, "https://cdn.example.com/final/a.mp4")


if __name__ == "__main__":
    unittest.main()
