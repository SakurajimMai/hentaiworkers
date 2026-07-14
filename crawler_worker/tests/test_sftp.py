import tempfile
import unittest
from pathlib import Path

from crawler_worker.media.sftp import InMemorySFTPClient, SFTPConfig, SFTPMediaAdapter


class SFTPAdapterTests(unittest.TestCase):
    def test_fingerprint_mismatch_rejected(self):
        with self.assertRaises(PermissionError):
            SFTPMediaAdapter(
                InMemorySFTPClient(),
                SFTPConfig(
                    host="h",
                    port=22,
                    username="u",
                    root_path="/data",
                    host_key_fingerprint="sha256:abcdefghijklmnopqrstuvwxyz",
                ),
                observed_fingerprint="sha256:wrong",
            )

    def test_upload_rename_publish(self):
        client = InMemorySFTPClient()
        cfg = SFTPConfig(
            host="h",
            port=22,
            username="u",
            root_path="/data",
            host_key_fingerprint="sha256:abcdefghijklmnopqrstuvwxyz",
            public_base_url="https://media.example.com",
        )
        adapter = SFTPMediaAdapter(client, cfg, observed_fingerprint=cfg.host_key_fingerprint)
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "v.mp4"
            path.write_bytes(b"video-bytes")
            adapter.upload_staging(path, "staging/j1")
            result = adapter.publish("staging/j1", "final/j1")
            self.assertEqual(result.byte_size, 11)
            self.assertIsNotNone(result.public_url)
            adapter.cleanup("final/j1")

    def test_no_public_mapping_playback_none(self):
        client = InMemorySFTPClient()
        cfg = SFTPConfig(
            host="h",
            port=22,
            username="u",
            root_path="/data",
            host_key_fingerprint="sha256:abcdefghijklmnopqrstuvwxyz",
            public_base_url=None,
        )
        adapter = SFTPMediaAdapter(client, cfg, observed_fingerprint=cfg.host_key_fingerprint)
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "v.mp4"
            path.write_bytes(b"x")
            adapter.upload_staging(path, "staging/a")
            result = adapter.publish("staging/a", "final/a")
            self.assertIsNone(result.public_url)


if __name__ == "__main__":
    unittest.main()
