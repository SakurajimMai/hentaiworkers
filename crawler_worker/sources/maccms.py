"""MacCMS / 苹果 CMS 资源站采集适配器（JSON provide API）。

对接常见影视资源站（iKun / 无尽 / 鸭鸭 / 暴风 / OK / 红牛 等）的
`/api.php/provide/vod/` 接口，默认只采日本/日韩动漫分类。
"""

from __future__ import annotations

import ipaddress
import json
import re
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence
from urllib.parse import urlencode, urljoin, urlparse

from crawler_worker.models.api import CrawlItemResult
from crawler_worker.sources.base import SourceAdapter, should_skip

_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_MAX_JSON_BYTES = 8 * 1024 * 1024


def _vod_id_sort_key(value: object) -> int:
    """Numeric sort key for MacCMS vod_id (larger = usually newer)."""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return -1

# type_name 命中其一即视为动漫相关
_ANIME_TYPE_HINTS = ("动漫", "動畫", "动画", "番剧", "OVA", "剧场版")
# 优先日本/日韩；排除纯国产/大陆/港台/欧美（除非与日韩同现）
_JP_KR_HINTS = ("日本", "日韩", "韩国", "韓國")
_EXCLUDE_REGION_HINTS = ("国产", "大陆", "港台", "中国", "欧美", "内地")

# 内置资源站预设（API base 以 help 页为准，可被配置覆盖）
PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "ikun": {
        "baseUrl": "https://ikunzyapi.com/api.php/provide/vod/",
        "playFrom": "ikm3u8",
        # 日本动漫
        "typeIds": [37],
        "helpUrl": "https://www.ikunzy.com/ikun/help.html",
    },
    "wujin": {
        "baseUrl": "https://api.wujinapi.me/api.php/provide/vod/",
        "playFrom": "wjm3u8",
        "typeIds": [50, 30],  # 日本动漫 / 日韩动漫（以 class 为准可自动解析）
        "helpUrl": "https://help.wujinapi.me/#wlcome",
    },
    "yaya": {
        "baseUrl": "https://cj.yayazy.net/api.php/provide/vod/",
        "playFrom": "yym3u8",
        "typeIds": [59, 30],
        "helpUrl": "https://yayazy3.com/index.php/label/help.html",
    },
    "bfzy": {
        "baseUrl": "https://bfzyapi.com/api.php/provide/vod/",
        "playFrom": "bfzym3u8",
        "typeIds": [41],  # 日韩动漫
        "helpUrl": "https://bfzy2.tv/helps/",
    },
    "okzy": {
        "baseUrl": "https://okzyw.cc/api.php/provide/vod/",
        "playFrom": "okm3u8",
        "typeIds": [59, 30],
        "helpUrl": "https://okzyw.cc/index.php/label/help.html",
    },
    "hongniu": {
        "baseUrl": "https://www.hongniuzy2.com/api.php/provide/vod/",
        "playFrom": "hnm3u8",
        "typeIds": [37],  # 日本动漫
        "helpUrl": "https://www.hongniuziyuan.com/index.php/help",
    },
}


def _is_public_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or address.is_reserved
    )


def _is_safe_http_url(value: str, *, resolve_dns: bool = False) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        hostname = parsed.hostname.rstrip(".").lower()
        if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
            return False
        try:
            address = ipaddress.ip_address(hostname)
            return _is_public_address(address)
        except ValueError:
            if not resolve_dns:
                return True
            addresses = {
                item[4][0]
                for item in socket.getaddrinfo(hostname, parsed.port or 443, type=socket.SOCK_STREAM)
            }
            return bool(addresses) and all(
                _is_public_address(ipaddress.ip_address(address)) for address in addresses
            )
    except (OSError, ValueError):
        return False


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    text = re.sub(r"&nbsp;|&#160;", " ", text, flags=re.I)
    text = re.sub(r"&amp;", "&", text, flags=re.I)
    text = re.sub(r"&lt;", "<", text, flags=re.I)
    text = re.sub(r"&gt;", ">", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_play_groups(
    play_from: str | None,
    play_url: str | None,
) -> list[tuple[str, list[tuple[str, str]]]]:
    """Parse MacCMS multi-source play fields.

    Returns list of (source_flag, [(episode_name, url), ...]).
    """
    flags = [p.strip() for p in (play_from or "").split("$$$") if p.strip()]
    groups = [g for g in (play_url or "").split("$$$")]
    if not flags and not groups:
        return []
    # Align lengths
    while len(flags) < len(groups):
        flags.append(f"src{len(flags)}")
    while len(groups) < len(flags):
        groups.append("")

    result: list[tuple[str, list[tuple[str, str]]]] = []
    for flag, group in zip(flags, groups):
        episodes: list[tuple[str, str]] = []
        for part in group.split("#"):
            part = part.strip()
            if not part:
                continue
            if "$" in part:
                name, url = part.split("$", 1)
            else:
                name, url = f"E{len(episodes) + 1}", part
            url = url.strip()
            if url:
                episodes.append((name.strip() or f"E{len(episodes) + 1}", url))
        result.append((flag, episodes))
    return result


def _play_from_matches(flag: str, preferred_from: str) -> bool:
    flag_value = flag.strip().lower()
    preferred_value = preferred_from.strip().lower()
    return bool(
        flag_value
        and preferred_value
        and (preferred_value in flag_value or flag_value in preferred_value)
    )


def pick_video_url(
    play_from: str | None,
    play_url: str | None,
    *,
    preferred_from: str | None = None,
    prefer_m3u8: bool = True,
    episode: str = "latest",
) -> str | None:
    """Choose one playable HTTP(S) URL from MacCMS play fields."""
    groups = parse_play_groups(play_from, play_url)
    if not groups:
        return None

    ordered = groups
    if preferred_from:
        ordered = sorted(
            groups,
            key=lambda g: (
                0
                if _play_from_matches(g[0], preferred_from)
                else 1
                if (prefer_m3u8 and "m3u8" in g[0].lower())
                else 2
            ),
        )
    elif prefer_m3u8:
        ordered = sorted(groups, key=lambda g: 0 if "m3u8" in g[0].lower() else 1)

    for _flag, episodes in ordered:
        candidates = episodes
        if prefer_m3u8:
            m3u8s = [e for e in episodes if ".m3u8" in e[1].lower()]
            if m3u8s:
                candidates = m3u8s
        if not candidates:
            continue
        chosen = candidates[-1] if episode == "latest" else candidates[0]
        url = chosen[1]
        if url.startswith("//"):
            url = "https:" + url
        if _is_safe_http_url(url):
            return url
    return None



def play_lines_payload(
    play_from: str | None,
    play_url: str | None,
    *,
    source_play_from: str | None = None,
    local_play_from: str | None = None,
) -> tuple[dict[str, object], ...]:
    """Serialize all play lines for catalog storage (tabs + episode grid)."""
    lines: list[dict[str, object]] = []
    for flag, episodes in parse_play_groups(play_from, play_url):
        safe_eps: list[dict[str, str]] = []
        for name, url in episodes:
            u = url
            if u.startswith("//"):
                u = "https:" + u
            if not _is_safe_http_url(u):
                continue
            safe_eps.append({"name": name, "url": u})
        if safe_eps:
            stored_flag = flag
            if (
                source_play_from
                and local_play_from
                and _play_from_matches(flag, source_play_from)
            ):
                stored_flag = local_play_from.strip()
            lines.append(
                {"name": stored_flag, "flag": stored_flag, "episodes": safe_eps}
            )
    return tuple(lines)


def is_jp_kr_anime_type(type_name: str) -> bool:
    name = type_name or ""
    if not any(h in name for h in _ANIME_TYPE_HINTS) and "动漫" not in name and name not in ("动漫", "动漫片"):
        # 允许仅「日本动漫」等含 动漫 的已覆盖；纯「日本剧」不算动漫
        if not any(h in name for h in ("动漫", "動畫", "动画")):
            return False
    if any(h in name for h in _EXCLUDE_REGION_HINTS) and not any(h in name for h in _JP_KR_HINTS):
        return False
    # 顶级「动漫」目录：可接受（后续按 area 再滤）
    if name in ("动漫", "动漫片", "動畫") or any(h in name for h in _JP_KR_HINTS):
        return any(h in name for h in _ANIME_TYPE_HINTS) or name in ("动漫", "动漫片", "動畫") or any(
            h in name for h in _JP_KR_HINTS
        )
    return any(h in name for h in _ANIME_TYPE_HINTS)


def is_jp_kr_item(item: dict[str, Any]) -> bool:
    """Filter detail rows to Japan / Korea anime by type_name + area."""
    type_name = str(item.get("type_name") or "")
    area = str(item.get("vod_area") or "")
    blob = f"{type_name} {area}"
    if any(h in blob for h in _EXCLUDE_REGION_HINTS) and not any(h in blob for h in _JP_KR_HINTS):
        # still allow if type explicitly 日本动漫
        if not any(h in type_name for h in _JP_KR_HINTS):
            return False
    if any(h in blob for h in _JP_KR_HINTS):
        return True
    # type is generic 动漫 — require area JP/KR keywords or empty area with anime type
    if any(h in type_name for h in _ANIME_TYPE_HINTS) or type_name in ("动漫", "动漫片"):
        if not area or any(h in area for h in _JP_KR_HINTS):
            return True
    return False


class MacCmsSource(SourceAdapter):
    """Generic MacCMS JSON provider. `name` is the capability / requiredSource key."""

    def __init__(
        self,
        name: str = "maccms",
        *,
        fetch_json: Callable[[str], dict[str, Any]] | None = None,
        default_preset: str | None = None,
    ) -> None:
        self.name = name
        self._fetch = fetch_json or self._fetch_json
        self._default_preset = default_preset or (name if name in PROVIDER_PRESETS else None)

    @staticmethod
    def _fetch_json(url: str, *, retries: int = 6) -> dict[str, Any]:
        """Fetch JSON with multi-transport retries.

        Windows workers frequently see ConnectionResetError(10054) against
        some MacCMS CDNs; alternate urllib/requests and back off hard.
        """
        if not _is_safe_http_url(url, resolve_dns=True):
            raise ValueError("API URL must be a public HTTP(S) URL")

        last_error: Exception | None = None
        attempts = max(1, retries)
        headers = {
            "User-Agent": _USER_AGENT,
            "Accept": "application/json,text/plain,*/*",
            "Accept-Encoding": "identity",
            "Connection": "close",
            "Cache-Control": "no-cache",
        }

        def _parse_body(raw: bytes) -> dict[str, Any]:
            if len(raw) > _MAX_JSON_BYTES:
                raise ValueError("API response is too large")
            for enc in ("utf-8", "gbk", "gb2312"):
                try:
                    return json.loads(raw.decode(enc))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
            return json.loads(raw.decode("utf-8", errors="replace"))

        def _via_requests() -> dict[str, Any]:
            import requests
            from requests.adapters import HTTPAdapter

            session = requests.Session()
            session.headers.update(headers)
            # Avoid keep-alive pooling that Windows occasionally tears down mid-body.
            adapter = HTTPAdapter(pool_connections=1, pool_maxsize=1, max_retries=0)
            session.mount("http://", adapter)
            session.mount("https://", adapter)
            try:
                response = session.get(
                    url,
                    timeout=(20, 90),
                    allow_redirects=True,
                    stream=False,
                )
                response.raise_for_status()
                if not _is_safe_http_url(str(response.url), resolve_dns=False):
                    raise ValueError("API redirected to a non-public URL")
                length = int(response.headers.get("content-length") or 0)
                if length > _MAX_JSON_BYTES:
                    raise ValueError("API response is too large")
                return _parse_body(response.content[: _MAX_JSON_BYTES + 1])
            finally:
                session.close()

        def _via_urllib() -> dict[str, Any]:
            import ssl
            import urllib.request

            req = urllib.request.Request(url, headers=headers)
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=90, context=ctx) as response:
                final = str(response.geturl())
                if not _is_safe_http_url(final, resolve_dns=False):
                    raise ValueError("API redirected to a non-public URL")
                raw = response.read(_MAX_JSON_BYTES + 1)
            return _parse_body(raw)

        import time

        for attempt in range(attempts):
            # Alternate transport order: urllib is often stabler on Windows RST paths.
            transporters = (
                (_via_urllib, _via_requests)
                if attempt % 2
                else (_via_requests, _via_urllib)
            )
            for transport in transporters:
                try:
                    return transport()
                except Exception as exc:  # noqa: BLE001 — retried at call site
                    last_error = exc
                    # Always try the other transport on this attempt; only
                    # decide final failure after all attempts are exhausted.
                    continue
            delay = min(12.0, 0.8 * (2 ** attempt))
            time.sleep(delay)

        assert last_error is not None
        raise last_error

    def crawl(
        self,
        snapshot: dict[str, Any],
        *,
        workdir: Path,
        should_stop: Callable[[], bool],
    ) -> Sequence[CrawlItemResult]:
        workdir.mkdir(parents=True, exist_ok=True)
        cfg = self._resolve_config(snapshot)
        base_url = str(cfg["baseUrl"]).rstrip("/") + "/"
        if not _is_safe_http_url(base_url):
            return [self._failure("source", "RESULT_INVALID", "invalid API base URL")]

        type_ids = list(cfg["typeIds"])
        if not type_ids and cfg.get("autoDetectTypes", True):
            try:
                type_ids = self._detect_type_ids(base_url)
            except Exception as exc:
                return [
                    self._failure(
                        "source",
                        "SOURCE_UNAVAILABLE",
                        f"failed to detect anime types: {exc}",
                    )
                ]
        if not type_ids:
            return [
                self._failure(
                    "source",
                    "RESULT_INVALID",
                    "no JP/KR anime typeIds configured or detected",
                )
            ]

        max_pages = max(1, min(200, int(cfg.get("maxPages") or 3)))
        configured_max_items = int(
            cfg.get("maxItems") if cfg.get("maxItems") is not None else 100
        )
        max_items = (
            None
            if configured_max_items == 0
            else max(1, min(5000, configured_max_items))
        )
        hours = cfg.get("hours")
        source_play_from = cfg.get("sourcePlayFrom")
        local_play_from = cfg.get("playFrom")
        skip_keywords = list(cfg.get("skipKeywords") or [])
        years = set(int(y) for y in (cfg.get("years") or []) if str(y).isdigit() or isinstance(y, int))
        filter_jp_kr = bool(cfg.get("filterJpKr", True))
        page_order = str(cfg.get("pageOrder") or "reverse").strip().lower()
        if page_order not in {"reverse", "forward", "from_end"}:
            page_order = "reverse"
        page_workers = max(1, min(16, int(cfg.get("pageConcurrency") or cfg.get("parseConcurrency") or 2)))

        results: list[CrawlItemResult] = []
        seen_ids: set[str] = set()

        for type_id in type_ids:
            if should_stop() or (
                max_items is not None and len(results) >= max_items
            ):
                break

            pages = self._plan_pages(
                base_url=base_url,
                type_id=int(type_id),
                max_pages=max_pages,
                hours=hours,
                page_order=page_order,
            )
            if not pages:
                continue

            page_payloads = self._fetch_pages_parallel(
                base_url=base_url,
                type_id=int(type_id),
                pages=pages,
                hours=hours,
                workdir=workdir,
                workers=page_workers,
                should_stop=should_stop,
            )

            # Preserve planned page order when merging (newest-first for reverse).
            ordered_raw_items: list[dict[str, Any]] = []
            for page in pages:
                if should_stop() or (
                    max_items is not None
                    and len(results) + len(ordered_raw_items) >= max_items * 2
                ):
                    break
                payload = page_payloads.get(page)
                if payload is None:
                    results.append(
                        self._failure(
                            f"t{type_id}-p{page}",
                            "SOURCE_UNAVAILABLE",
                            "page fetch failed",
                        )
                    )
                    continue
                if isinstance(payload, Exception):
                    results.append(
                        self._failure(
                            f"t{type_id}-p{page}",
                            "SOURCE_UNAVAILABLE",
                            str(payload)[:500],
                        )
                    )
                    continue
                items = payload.get("list") if isinstance(payload, dict) else None
                if not isinstance(items, list) or not items:
                    continue
                for raw in items:
                    if isinstance(raw, dict):
                        ordered_raw_items.append(raw)

            # Default reverse: newest vod_id first within the collected window.
            if page_order in {"reverse", "from_end"}:
                ordered_raw_items.sort(
                    key=lambda row: _vod_id_sort_key(row.get("vod_id")),
                    reverse=True,
                )

            for raw in ordered_raw_items:
                if should_stop() or (
                    max_items is not None and len(results) >= max_items
                ):
                    break
                item = self._item_from_raw(
                    raw,
                    preferred_from=source_play_from,
                    local_play_from=local_play_from,
                    skip_keywords=skip_keywords,
                    years=years,
                    filter_jp_kr=filter_jp_kr,
                    seen_ids=seen_ids,
                )
                if item is not None:
                    results.append(item)

        if not results:
            return [
                self._failure(
                    "source",
                    "RESULT_INVALID",
                    "no JP/KR anime items matched filters",
                )
            ]
        return results

    def _plan_pages(
        self,
        *,
        base_url: str,
        type_id: int,
        max_pages: int,
        hours: Any,
        page_order: str,
    ) -> list[int]:
        """Return page numbers to crawl. reverse/from_end prefer newest content."""
        if page_order != "from_end":
            # reverse + forward both start at page 1 (CMS page 1 is usually newest).
            return list(range(1, max_pages + 1))

        pagecount = self._discover_pagecount(base_url, type_id, hours)
        if pagecount is None or pagecount < 1:
            # Fall back to newest-first pages if pagecount is unknown.
            return list(range(1, max_pages + 1))
        start = max(1, pagecount - max_pages + 1)
        # Walk from last page down so oldest pages come first in this mode.
        return list(range(pagecount, start - 1, -1))

    def _discover_pagecount(self, base_url: str, type_id: int, hours: Any) -> int | None:
        params: dict[str, Any] = {"ac": "detail", "t": int(type_id), "pg": 1}
        if hours is not None:
            try:
                params["h"] = int(hours)
            except (TypeError, ValueError):
                pass
        try:
            payload = self._fetch(base_url + ("?" + urlencode(params)))
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        for key in ("pagecount", "pageCount", "total_pages", "totalPages"):
            raw = payload.get(key)
            try:
                value = int(raw)
                if value > 0:
                    return value
            except (TypeError, ValueError):
                continue
        # Some CMS only expose total + limit.
        try:
            total = int(payload.get("total") or 0)
            limit = int(payload.get("limit") or payload.get("pagesize") or 0)
            if total > 0 and limit > 0:
                return max(1, (total + limit - 1) // limit)
        except (TypeError, ValueError):
            pass
        return None

    def _fetch_pages_parallel(
        self,
        *,
        base_url: str,
        type_id: int,
        pages: Sequence[int],
        hours: Any,
        workdir: Path,
        workers: int,
        should_stop: Callable[[], bool],
    ) -> dict[int, dict[str, Any] | Exception | None]:
        out: dict[int, dict[str, Any] | Exception | None] = {}

        def one(page: int) -> tuple[int, dict[str, Any] | Exception]:
            params: dict[str, Any] = {
                "ac": "detail",
                "t": int(type_id),
                "pg": int(page),
            }
            if hours is not None:
                try:
                    params["h"] = int(hours)
                except (TypeError, ValueError):
                    pass
            url = base_url + ("?" + urlencode(params))
            try:
                payload = self._fetch(url)
                try:
                    (workdir / f"list-t{type_id}-p{page}.json").write_text(
                        json.dumps(payload, ensure_ascii=False)[:200_000],
                        encoding="utf-8",
                    )
                except Exception:
                    pass
                return page, payload if isinstance(payload, dict) else {}
            except Exception as exc:
                return page, exc

        if workers <= 1 or len(pages) <= 1:
            for page in pages:
                if should_stop():
                    break
                p, payload = one(page)
                out[p] = payload
            return out

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(one, page) for page in pages]
            for fut in as_completed(futures):
                if should_stop():
                    break
                try:
                    page, payload = fut.result()
                    out[page] = payload
                except Exception as exc:
                    # Should be rare because one() already catches.
                    out[-1] = exc
        return out

    def _item_from_raw(
        self,
        raw: dict[str, Any],
        *,
        preferred_from: Any,
        local_play_from: Any,
        skip_keywords: Sequence[str],
        years: set[int],
        filter_jp_kr: bool,
        seen_ids: set[str],
    ) -> CrawlItemResult | None:
        vod_id = str(raw.get("vod_id") or "").strip()
        if not vod_id or vod_id in seen_ids:
            return None
        seen_ids.add(vod_id)

        title = _strip_html(str(raw.get("vod_name") or f"vod-{vod_id}"))
        if should_skip(title, skip_keywords):
            return CrawlItemResult(
                source=self.name,
                source_id=vod_id,
                title=title,
                video_url=None,
                cover_url=None,
                tags=(),
                status="skipped",
                error_code="SKIPPED",
                error_message="matched skip keyword",
            )

        if filter_jp_kr and not is_jp_kr_item(raw):
            return None

        year_raw = str(raw.get("vod_year") or "").strip()
        year_match = re.search(r"(19|20)\d{2}", year_raw)
        release_year = int(year_match.group(0)) if year_match else None
        if years and release_year is not None and release_year not in years:
            return None

        play_from_raw = str(raw.get("vod_play_from") or "")
        play_url_raw = str(raw.get("vod_play_url") or "")
        video_url = pick_video_url(
            play_from_raw,
            play_url_raw,
            preferred_from=str(preferred_from) if preferred_from else None,
        )
        cover = str(raw.get("vod_pic") or "").strip() or None
        if cover and cover.startswith("//"):
            cover = "https:" + cover
        if cover and not _is_safe_http_url(cover):
            cover = None

        tags = self._tags_from_item(raw)
        description = _strip_html(str(raw.get("vod_content") or raw.get("vod_blurb") or "")) or None
        title_en = _strip_html(str(raw.get("vod_en") or "")) or None
        title_ja = _strip_html(str(raw.get("vod_sub") or "")) or None
        if title_ja and title_ja == title:
            title_ja = None
        remarks = _strip_html(str(raw.get("vod_remarks") or "")) or None

        def _meta_text(value: object) -> str | None:
            text = _strip_html(str(value or ""))
            if not text or text in {"暂无", "无", "未知", "N/A", "n/a", "null"}:
                return None
            return text

        actors = _meta_text(raw.get("vod_actor"))
        directors = _meta_text(raw.get("vod_director"))
        aliases = title_ja
        area = _meta_text(raw.get("vod_area"))
        lang = _meta_text(raw.get("vod_lang"))
        source_updated_at = str(raw.get("vod_time") or "").strip()[:32] or None
        pubdate = str(raw.get("vod_pubdate") or "").strip()
        release_date = None
        if re.match(r"^\d{4}-\d{2}-\d{2}", pubdate):
            release_date = pubdate[:10]
        elif source_updated_at and re.match(r"^\d{4}-\d{2}-\d{2}", source_updated_at):
            release_date = source_updated_at[:10]

        if not video_url:
            return self._failure(
                vod_id,
                "RESULT_INVALID",
                "no playable m3u8/http video url",
                title,
            )

        lines = play_lines_payload(
            play_from_raw,
            play_url_raw,
            source_play_from=str(preferred_from) if preferred_from else None,
            local_play_from=str(local_play_from) if local_play_from else None,
        )
        return CrawlItemResult(
            source=self.name,
            source_id=vod_id,
            title=title,
            video_url=video_url,
            cover_url=cover,
            tags=tags,
            status="succeeded",
            title_english=title_en,
            title_japanese=title_ja,
            description=description,
            fanart_urls=(),
            release_year=release_year,
            release_date=release_date,
            remarks=remarks,
            actors=actors,
            directors=directors,
            aliases=aliases,
            area=area,
            lang=lang,
            source_updated_at=source_updated_at,
            play_lines=lines,
        )

    def _resolve_config(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        source = snapshot.get("source") if isinstance(snapshot.get("source"), dict) else {}
        preset: dict[str, Any] = {}
        preset_key = (
            str(source.get("provider") or self._default_preset or self.name or "").strip().lower()
        )
        if preset_key in PROVIDER_PRESETS:
            preset = dict(PROVIDER_PRESETS[preset_key])

        base_url = (
            str(source.get("baseUrl") or source.get("apiBase") or preset.get("baseUrl") or "").strip()
        )
        type_ids = source.get("typeIds") or source.get("t") or preset.get("typeIds") or []
        if isinstance(type_ids, (str, int)):
            type_ids = [type_ids]
        parsed_ids: list[int] = []
        for value in type_ids:
            try:
                parsed_ids.append(int(value))
            except (TypeError, ValueError):
                continue

        # Optional single type field from admin form
        single_type = source.get("type")
        if single_type not in (None, ""):
            try:
                parsed_ids = [int(single_type)]
            except (TypeError, ValueError):
                pass

        date_filter = snapshot.get("dateFilter") if isinstance(snapshot.get("dateFilter"), dict) else {}
        years = date_filter.get("years") or source.get("years") or []

        concurrency = snapshot.get("concurrency") if isinstance(snapshot.get("concurrency"), dict) else {}
        page_order = str(source.get("pageOrder") or snapshot.get("pageOrder") or "reverse").strip().lower()
        if page_order not in {"reverse", "forward", "from_end"}:
            page_order = "reverse"

        has_source_play_from = source.get("sourcePlayFrom") not in (None, "")
        source_play_from = (
            source.get("sourcePlayFrom")
            if has_source_play_from
            else source.get("playFrom") or preset.get("playFrom")
        )
        local_play_from = source.get("playFrom") if has_source_play_from else None
        source_max_items = source.get("maxItems")
        snapshot_max_items = snapshot.get("maxItems")

        return {
            "baseUrl": base_url,
            "typeIds": parsed_ids,
            "sourcePlayFrom": source_play_from,
            "playFrom": local_play_from,
            "maxPages": source.get("maxPages") or snapshot.get("maxPages") or 3,
            "maxItems": (
                source_max_items
                if source_max_items is not None
                else snapshot_max_items
                if snapshot_max_items is not None
                else 100
            ),
            "hours": source.get("hours") if source.get("hours") not in (None, "") else None,
            "autoDetectTypes": source.get("autoDetectTypes", not parsed_ids),
            "filterJpKr": source.get("filterJpKr", True),
            "pageOrder": page_order,
            "pageConcurrency": (
                source.get("pageConcurrency")
                or concurrency.get("page")
                or concurrency.get("parse")
                or 2
            ),
            "parseConcurrency": concurrency.get("parse") or 2,
            "skipKeywords": snapshot.get("skipKeywords") or source.get("skipKeywords") or [],
            "years": years,
        }

    def _detect_type_ids(self, base_url: str) -> list[int]:
        payload = self._fetch(base_url + "?ac=list")
        classes = payload.get("class") if isinstance(payload, dict) else None
        if not isinstance(classes, list):
            return []
        preferred: list[int] = []
        fallback: list[int] = []
        for row in classes:
            if not isinstance(row, dict):
                continue
            name = str(row.get("type_name") or "")
            try:
                type_id = int(row.get("type_id"))
            except (TypeError, ValueError):
                continue
            if any(h in name for h in ("日本动漫", "日韩动漫", "日本動畫")):
                preferred.append(type_id)
            elif is_jp_kr_anime_type(name):
                fallback.append(type_id)
        return preferred or fallback

    def _tags_from_item(self, item: dict[str, Any]) -> tuple[str, ...]:
        """Genre labels from MacCMS (vod_class / vod_tag), e.g. 剧情,喜剧,动画,同性.

        Intentionally excludes type_name / area / lang / remarks so the UI can
        show real genres instead of "日本动漫 · 日语 · 更新至02集".
        """
        tags: list[str] = []
        for key in ("vod_class", "vod_tag"):
            value = _strip_html(str(item.get(key) or ""))
            if not value:
                continue
            for part in re.split(r"[,，/|]+", value):
                part = part.strip()
                if not part or part in tags:
                    continue
                # Drop pure whitespace / placeholder empties.
                if part in {"暂无", "无", "N/A", "n/a"}:
                    continue
                tags.append(part)
        return tuple(tags[:20])

    def _failure(
        self,
        source_id: str,
        code: str,
        message: str,
        title: str | None = None,
    ) -> CrawlItemResult:
        return CrawlItemResult(
            source=self.name,
            source_id=source_id,
            title=title or source_id,
            video_url=None,
            cover_url=None,
            tags=(),
            status="failed",
            error_code=code,
            error_message=message,
        )


def build_maccms_sources() -> dict[str, SourceAdapter]:
    """Register generic + per-provider adapters for worker capabilities."""
    sources: dict[str, SourceAdapter] = {
        "maccms": MacCmsSource("maccms"),
    }
    for key in PROVIDER_PRESETS:
        sources[key] = MacCmsSource(key, default_preset=key)
    return sources
