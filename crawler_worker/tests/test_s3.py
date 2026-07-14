import tempfile
import unittest
from pathlib import Path

from crawler_worker.media.s3 import InMemoryS3Client, S3Credentials, S3MediaAdapter


class S3AdapterTests(unittest.TestCase):
    def test_upload_publish_cleanup(self):
        client = InMemoryS3Client()
        creds = S3Credentials(
            access_key_id="A",
            secret_access_key="S",
            session_token="T",
            expires_at="2099-01-01T00:00:00Z",
            bucket="b",
            region="auto",
        )
        adapter = S3MediaAdapter(
            client,
            creds,
            public_base_url="https://cdn.example.com",
            verify_tls=True,
        )
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "f.bin"
            path.write_bytes(b"hello-media")
            digest = adapter.upload_staging(path, "staging/k")
            self.assertEqual(len(digest), 64)
            published = adapter.publish("staging/k", "final/k")
            self.assertEqual(published.byte_size, 11)
            self.assertTrue(published.public_url.endswith("final/k"))
            adapter.cleanup("final/k")
            self.assertNotIn("final/k", client.objects)

    def test_tls_required(self):
        with self.assertRaises(ValueError):
            S3MediaAdapter(
                InMemoryS3Client(),
                S3Credentials("a", "s", "t", "e", "b", "r"),
                verify_tls=False,
            )

    def test_refresh_credentials(self):
        client = InMemoryS3Client()
        adapter = S3MediaAdapter(
            client,
            S3Credentials("a", "s", "t", "e", "b", "r"),
        )
        adapter.refresh_credentials(
            S3Credentials("a2", "s2", "t2", "e2", "b", "r", prefix="jobs/1/")
        )
        self.assertEqual(adapter._creds.session_token, "t2")


if __name__ == "__main__":
    unittest.main()
