import tempfile
import unittest
from pathlib import Path

from crawler_worker.main import config_from_env


class MainConfigTests(unittest.TestCase):
    def test_configures_and_creates_cover_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cover_dir = Path(tmp) / "covers"
            config = config_from_env(
                {
                    "CRAWLER_CONTROL_URL": "http://app:3000/api/internal/crawler/v1",
                    "CRAWLER_WORKER_ID": "1",
                    "CRAWLER_WORKER_TOKEN": "token",
                    "CRAWLER_COVER_DIR": str(cover_dir),
                    "CRAWLER_TEMP_DIR": str(Path(tmp) / "jobs"),
                }
            )

            self.assertEqual(config.cover_dir, str(cover_dir))
            self.assertTrue(cover_dir.is_dir())


if __name__ == "__main__":
    unittest.main()
