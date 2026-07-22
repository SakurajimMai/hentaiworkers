import hashlib
import stat
import tempfile
import unittest
from pathlib import Path

from crawler_worker.media.local_cover_store import (
    detect_image_extension,
    save_cover_locally,
)


class LocalCoverStoreTests(unittest.TestCase):
    def test_saves_jpeg_with_content_hash_and_public_route(self) -> None:
        content = b"\xff\xd8\xff" + b"cover-bytes"

        def downloader(_url: str, dest: Path, **_kwargs: object) -> Path:
            dest.write_bytes(content)
            return dest

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            route = save_cover_locally(
                url="https://cdn.example/cover",
                source="ikun",
                referer=None,
                root_dir=root,
                downloader=downloader,
            )
            digest = hashlib.sha256(content).hexdigest()
            expected = root / "ikun" / f"{digest}.jpg"

            self.assertEqual(route, f"/api/media/covers/ikun/{digest}.jpg")
            self.assertEqual(expected.read_bytes(), content)
            self.assertNotEqual(expected.stat().st_mode & stat.S_IROTH, 0)

    def test_detects_supported_image_signatures(self) -> None:
        fixtures = (
            (b"\xff\xd8\xffrest", ".jpg"),
            (b"\x89PNG\r\n\x1a\nrest", ".png"),
            (b"RIFF\x04\x00\x00\x00WEBPrest", ".webp"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            for index, (content, extension) in enumerate(fixtures):
                with self.subTest(extension=extension):
                    path = Path(tmp) / f"image-{index}"
                    path.write_bytes(content)
                    self.assertEqual(detect_image_extension(path), extension)

    def test_rejects_non_image_and_removes_temporary_file(self) -> None:
        def downloader(_url: str, dest: Path, **_kwargs: object) -> Path:
            dest.write_bytes(b"<html>not an image</html>")
            return dest

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaisesRegex(ValueError, "unsupported cover image format"):
                save_cover_locally(
                    url="https://cdn.example/cover",
                    source="ikun",
                    referer=None,
                    root_dir=root,
                    downloader=downloader,
                )
            self.assertEqual(list((root / "ikun").glob(".cover-*")), [])

    def test_existing_content_is_not_replaced(self) -> None:
        content = b"\x89PNG\r\n\x1a\n" + b"same-cover"

        def downloader(_url: str, dest: Path, **_kwargs: object) -> Path:
            dest.write_bytes(content)
            return dest

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            route = save_cover_locally(
                url="https://cdn.example/one.png",
                source="ikun",
                referer=None,
                root_dir=root,
                downloader=downloader,
            )
            digest = hashlib.sha256(content).hexdigest()
            final = root / "ikun" / f"{digest}.png"
            final.touch()
            first_mtime = final.stat().st_mtime_ns

            second_route = save_cover_locally(
                url="https://cdn.example/two.png",
                source="ikun",
                referer=None,
                root_dir=root,
                downloader=downloader,
            )

            self.assertEqual(second_route, route)
            self.assertEqual(final.stat().st_mtime_ns, first_mtime)

    def test_rejects_unsafe_source_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "invalid cover source"):
                save_cover_locally(
                    url="https://cdn.example/cover.jpg",
                    source="../ikun",
                    referer=None,
                    root_dir=Path(tmp),
                    downloader=lambda _url, dest, **_kwargs: dest,
                )


if __name__ == "__main__":
    unittest.main()
