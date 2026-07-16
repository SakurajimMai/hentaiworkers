#!/usr/bin/env python3
"""Fetch MacCMS class list for admin UI.

Node/undici frequently hits ConnectionReset against some MacCMS CDNs on Windows;
this helper uses urllib. Supports stdout JSON or -o/--output file.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


def normalize_base(base: str) -> str:
    base = (base or "").strip()
    if not base:
        raise ValueError("empty baseUrl")
    return base if base.endswith("/") else base + "/"


def is_safe_http_url(value: str) -> bool:
    try:
        u = urlparse(value)
    except Exception:
        return False
    if u.scheme not in ("http", "https"):
        return False
    host = (u.hostname or "").lower()
    if not host or host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        return False
    if host.endswith(".local") or host.endswith(".internal"):
        return False
    return True


def list_url(base: str) -> str:
    base = normalize_base(base)
    parsed = urlparse(base)
    q = dict(parse_qsl(parsed.query, keep_blank_values=True))
    q["ac"] = "list"
    return urlunparse(parsed._replace(query=urlencode(q)))


def fetch_json(url: str, *, retries: int = 3) -> dict:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json,text/plain,*/*",
        "Accept-Encoding": "identity",
        "Connection": "close",
        "Cache-Control": "no-cache",
    }
    last: Exception | None = None
    ctx = ssl.create_default_context()
    for attempt in range(max(1, retries)):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                raw = resp.read(2_000_000)
            for enc in ("utf-8", "gbk", "gb2312"):
                try:
                    return json.loads(raw.decode(enc))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
            return json.loads(raw.decode("utf-8", errors="replace"))
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(min(3.0, 0.35 * (2**attempt)))
    assert last is not None
    raise last


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("baseUrl")
    parser.add_argument("-o", "--output", help="Write JSON to file instead of stdout")
    args = parser.parse_args()
    base = args.baseUrl
    try:
        if not is_safe_http_url(normalize_base(base)):
            raise ValueError("invalid or non-public API base URL")
        url = list_url(base)
        payload = fetch_json(url)
        classes = payload.get("class") if isinstance(payload, dict) else None
        if not isinstance(classes, list):
            raise ValueError("API response missing class list")
        flat = []
        for row in classes:
            if not isinstance(row, dict):
                continue
            try:
                type_id = int(row.get("type_id"))
            except (TypeError, ValueError):
                continue
            if type_id <= 0:
                continue
            type_name = str(row.get("type_name") or "").strip()
            if not type_name:
                continue
            try:
                type_pid = int(row.get("type_pid") or 0)
            except (TypeError, ValueError):
                type_pid = 0
            flat.append(
                {
                    "typeId": type_id,
                    "typePid": type_pid,
                    "typeName": type_name,
                }
            )
        body = {
            "ok": True,
            "baseUrl": normalize_base(base),
            "flat": flat,
        }
        text = json.dumps(body, ensure_ascii=False)
        if args.output:
            Path(args.output).write_text(text, encoding="utf-8")
        else:
            sys.stdout.write(text)
            sys.stdout.flush()
        return 0
    except Exception as exc:  # noqa: BLE001
        body = {"ok": False, "error": str(exc)[:500]}
        text = json.dumps(body, ensure_ascii=False)
        if args.output:
            try:
                Path(args.output).write_text(text, encoding="utf-8")
            except Exception:
                pass
        else:
            sys.stdout.write(text)
            sys.stdout.flush()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
