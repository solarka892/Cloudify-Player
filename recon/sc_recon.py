#!/usr/bin/env python3
"""
SoundCloud api-v2 recon script.

Standalone, zero-dependency (stdlib only) probe to validate the approach the
Cloudify-Player desktop client will rely on:

  1. Download the soundcloud.com homepage.
  2. Extract every <script src="..."> JS bundle URL.
  3. Scan the bundles for a `client_id:"..."` string.
  4. Hit a couple of public api-v2 endpoints with that client_id to confirm
     the key is live and the internal API answers.

This is deliberately NOT part of the Tauri app. It's a throwaway validator so
we learn early whether SoundCloud has closed the door (see CLAUDE.md). The real
implementation lives in Rust under src-tauri/src/sc_api/.

Usage:
    python3 recon/sc_recon.py
    python3 recon/sc_recon.py --query "lofi"     # try a search
    python3 recon/sc_recon.py --json             # machine-readable output
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HOMEPAGE = "https://soundcloud.com/"
API_V2 = "https://api-v2.soundcloud.com"

# Pretend to be a normal browser; SC serves different markup to bots otherwise.
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# <script ... src="https://a-v2.sndcdn.com/assets/2-xxxx.js"></script>
SCRIPT_SRC_RE = re.compile(r'<script[^>]+src="([^"]+)"', re.IGNORECASE)
# client_id:"XXXX"  or  client_id="XXXX"  or  ,client_id:"XXXX"
CLIENT_ID_RE = re.compile(r'client_id\s*[:=]\s*"([A-Za-z0-9]{20,})"')


def http_get(url: str, timeout: int = 15) -> str:
    """GET a URL and return the decoded body, or raise with context."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def http_get_json(url: str, timeout: int = 15) -> tuple[int, object]:
    """GET a URL expecting JSON. Returns (status, parsed) and never raises on
    HTTP error codes — we want to see 401/403 bodies during recon."""
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body) if body else None
        except json.JSONDecodeError:
            parsed = body[:500]
        return e.code, parsed


def find_bundle_urls(html: str) -> list[str]:
    """Extract JS bundle URLs from homepage HTML, deduped, order preserved."""
    urls: list[str] = []
    seen: set[str] = set()
    for src in SCRIPT_SRC_RE.findall(html):
        if src.endswith(".js") and src not in seen:
            seen.add(src)
            urls.append(src)
    return urls


def extract_client_id(bundle_urls: list[str]) -> tuple[str | None, str | None]:
    """Scan bundles (last first — client_id usually lives in the final chunk).
    Returns (client_id, bundle_url_where_found)."""
    for url in reversed(bundle_urls):
        try:
            body = http_get(url)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  ! failed to fetch {url}: {e}", file=sys.stderr)
            continue
        m = CLIENT_ID_RE.search(body)
        if m:
            return m.group(1), url
    return None, None


def probe_public_track(client_id: str) -> tuple[int, object]:
    """Resolve a known-stable public track URL via api-v2. Uses forss/flickermood,
    one of the oldest tracks on SoundCloud and a de-facto test fixture; any
    public track/user URL works."""
    target = "https://soundcloud.com/forss/flickermood"
    url = (
        f"{API_V2}/resolve?"
        + urllib.parse.urlencode({"url": target, "client_id": client_id})
    )
    return http_get_json(url)


def probe_search(client_id: str, query: str) -> tuple[int, object]:
    url = (
        f"{API_V2}/search/tracks?"
        + urllib.parse.urlencode(
            {"q": query, "client_id": client_id, "limit": 3}
        )
    )
    return http_get_json(url)


def probe_stream(client_id: str, track: dict) -> tuple[int, str | None]:
    """Resolve the progressive transcoding of a track to a signed CDN URL, then
    Range-request the first bytes to confirm it's real audio. Returns
    (http_status_of_cdn, cdn_url)."""
    auth = track.get("track_authorization", "")
    transcodings = (track.get("media") or {}).get("transcodings", [])
    prog = next(
        (t for t in transcodings
         if (t.get("format") or {}).get("protocol") == "progressive"),
        None,
    )
    if not prog:
        return 0, None
    resolve_url = prog["url"] + "?" + urllib.parse.urlencode(
        {"client_id": client_id, "track_authorization": auth}
    )
    status, body = http_get_json(resolve_url)
    if status != 200 or not isinstance(body, dict):
        return status, None
    cdn = body.get("url")
    if not cdn:
        return status, None
    # Range-request the first bytes; MP3 frames start with 0xFF 0xFB.
    req = urllib.request.Request(
        cdn, headers={"User-Agent": UA, "Range": "bytes=0-15"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            head = resp.read(4)
            ok = head[:1] == b"\xff"
            return (206 if ok and resp.status in (200, 206) else resp.status), cdn
    except urllib.error.HTTPError as e:
        return e.code, cdn


def probe_likes(client_id: str, user_id: int) -> tuple[int, int, bool]:
    """Fetch a public user's likes with pagination. Returns
    (status, item_count, has_next_href)."""
    url = f"{API_V2}/users/{user_id}/likes?" + urllib.parse.urlencode(
        {"client_id": client_id, "limit": 2, "linked_partitioning": 1}
    )
    status, body = http_get_json(url)
    if isinstance(body, dict):
        return status, len(body.get("collection", [])), bool(body.get("next_href"))
    return status, 0, False


def main() -> int:
    ap = argparse.ArgumentParser(description="SoundCloud api-v2 recon")
    ap.add_argument("--query", default="lofi hip hop",
                    help="search query to validate /search/tracks")
    ap.add_argument("--json", action="store_true",
                    help="emit machine-readable JSON summary")
    args = ap.parse_args()

    result: dict = {"ok": False}

    def log(msg: str) -> None:
        if not args.json:
            print(msg)

    log("→ Fetching homepage ...")
    try:
        html = http_get(HOMEPAGE)
    except Exception as e:  # noqa: BLE001 - recon, surface anything
        print(f"FATAL: cannot fetch homepage: {e}", file=sys.stderr)
        return 2

    bundles = find_bundle_urls(html)
    result["bundle_count"] = len(bundles)
    log(f"  found {len(bundles)} JS bundle(s)")
    if not bundles:
        print("FATAL: no JS bundles found — markup changed?", file=sys.stderr)
        return 2

    log("→ Scanning bundles for client_id ...")
    client_id, found_in = extract_client_id(bundles)
    if not client_id:
        print("FATAL: no client_id found in any bundle", file=sys.stderr)
        return 2
    result["client_id"] = client_id
    result["client_id_bundle"] = found_in
    log(f"  client_id = {client_id}")
    log(f"  (from {found_in})")

    log("→ Probing api-v2 /resolve ...")
    r_status, r_body = probe_public_track(client_id)
    result["resolve_status"] = r_status
    track = r_body if isinstance(r_body, dict) else {}
    kind = track.get("kind")
    log(f"  HTTP {r_status}  kind={kind}")

    log(f"→ Probing api-v2 /search/tracks q={args.query!r} ...")
    s_status, s_body = probe_search(client_id, args.query)
    result["search_status"] = s_status
    hits = len(s_body.get("collection", [])) if isinstance(s_body, dict) else 0
    result["search_hits"] = hits
    log(f"  HTTP {s_status}  hits={hits}")
    if not args.json and isinstance(s_body, dict):
        for t in s_body.get("collection", [])[:3]:
            title = t.get("title", "?")
            user = (t.get("user") or {}).get("username", "?")
            log(f"    • {title} — {user}")

    stream_status = 0
    likes_status = 0
    if track.get("kind") == "track":
        log("→ Probing stream resolution (progressive) ...")
        stream_status, cdn = probe_stream(client_id, track)
        result["stream_status"] = stream_status
        log(f"  HTTP {stream_status}  audio={'yes' if stream_status in (200, 206) else 'no'}")

        log("→ Probing public likes pagination ...")
        likes_status, n, has_next = probe_likes(client_id, track.get("user_id", 0))
        result["likes_status"] = likes_status
        result["likes_has_next"] = has_next
        log(f"  HTTP {likes_status}  items={n}  next_href={has_next}")

    result["ok"] = all(
        st == 200 for st in (r_status, s_status, likes_status)
    ) and stream_status in (200, 206)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print()
        print("=" * 40)
        print("RESULT:", "✅ approach works" if result["ok"]
              else "❌ something failed — see above")

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
