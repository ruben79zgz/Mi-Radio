#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_JS = ROOT / "podcasts.js"
OUTPUT = ROOT / "podcasts-data.json"
MAX_EPISODES = None

NS = {
    "itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


def load_config() -> list[dict]:
    text = CONFIG_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.PODCAST_SOURCES\s*=\s*(\[.*\])\s*;\s*$", text, re.S)
    if not m:
        raise RuntimeError("No se pudo leer PODCAST_SOURCES de podcasts.js")
    # podcasts.js usa sintaxis compatible con JSON en esta versión.
    return json.loads(m.group(1))


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    return value.strip()


def child_text(node: ET.Element, name: str) -> str:
    el = node.find(name, NS)
    return clean_text(el.text if el is not None else "")


def parse_date(value: str) -> str:
    if not value:
        return ""
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        pass
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return value


def parse_duration(value: str | None) -> int | None:
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return int(value)
    parts = value.split(":")
    try:
        nums = [int(float(x)) for x in parts]
    except ValueError:
        return None
    if len(nums) == 3:
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    return None


def find_image(node: ET.Element) -> str:
    it = node.find("itunes:image", NS)
    if it is not None and it.attrib.get("href"):
        return it.attrib["href"].strip()
    media_thumb = node.find("media:thumbnail", NS)
    if media_thumb is not None and media_thumb.attrib.get("url"):
        return media_thumb.attrib["url"].strip()
    image = node.find("image")
    if image is not None:
        url = image.find("url")
        if url is not None and url.text:
            return url.text.strip()
    return ""


def find_audio(item: ET.Element) -> tuple[str, int | None]:
    for enc in item.findall("enclosure"):
        url = (enc.attrib.get("url") or "").strip()
        typ = (enc.attrib.get("type") or "").lower()
        if url and (typ.startswith("audio/") or not typ):
            length = enc.attrib.get("length")
            return url, int(length) if length and length.isdigit() else None
    for media in item.findall("media:content", NS):
        url = (media.attrib.get("url") or "").strip()
        typ = (media.attrib.get("type") or "").lower()
        medium = (media.attrib.get("medium") or "").lower()
        if url and (typ.startswith("audio/") or medium == "audio"):
            return url, None
    return "", None


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MiRadioPodcastUpdater/1.0; +https://github.com/)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def parse_feed(source: dict) -> dict:
    raw = fetch_bytes(source["feed"])
    root = ET.fromstring(raw)
    channel = root.find("channel") if root.tag.lower().endswith("rss") else root
    if channel is None:
        raise RuntimeError("RSS sin canal")

    feed_title = child_text(channel, "title") or source.get("name", "")
    feed_description = child_text(channel, "description") or source.get("description", "")
    feed_link = child_text(channel, "link") or source.get("site", "")
    author = child_text(channel, "itunes:author") or source.get("author", "")
    image = find_image(channel)

    episodes = []
    for item in channel.findall("item"):
        audio_url, file_size = find_audio(item)
        if not audio_url:
            continue
        title = child_text(item, "title") or "Episodio"
        description = child_text(item, "description")
        if not description:
            content = item.find("content:encoded", NS)
            description = clean_text(content.text if content is not None else "")
        guid = child_text(item, "guid") or child_text(item, "link") or audio_url
        pub_date = parse_date(child_text(item, "pubDate"))
        duration_node = item.find("itunes:duration", NS)
        duration = parse_duration(duration_node.text if duration_node is not None else None)
        episode_image = find_image(item) or image
        episode_link = child_text(item, "link")
        ident = hashlib.sha1(guid.encode("utf-8", errors="ignore")).hexdigest()[:20]
        episodes.append(
            {
                "id": ident,
                "title": title,
                "description": description,
                "publishedAt": pub_date,
                "duration": duration,
                "audio": audio_url,
                "fileSize": file_size,
                "image": episode_image,
                "link": episode_link,
            }
        )
        if MAX_EPISODES is not None and len(episodes) >= MAX_EPISODES:
            break

    episodes.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)

    return {
        "id": source["id"],
        "name": feed_title,
        "author": author,
        "description": feed_description,
        "image": image,
        "site": feed_link,
        "feed": source["feed"],
        "episodes": episodes,
    }


def load_previous() -> dict:
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except Exception:
        return {"updatedAt": None, "podcasts": []}


def main() -> int:
    sources = load_config()
    previous = load_previous()
    previous_by_id = {x.get("id"): x for x in previous.get("podcasts", [])}
    result = []
    errors = []

    for source in sources:
        try:
            parsed = parse_feed(source)
            result.append(parsed)
            print(f"OK  {source['id']}: {len(parsed['episodes'])} episodios")
        except Exception as exc:
            old = previous_by_id.get(source.get("id"))
            if old:
                result.append(old)
                print(f"WARN {source['id']}: {exc} -> se conserva la versión anterior", file=sys.stderr)
            else:
                result.append(
                    {
                        "id": source["id"],
                        "name": source.get("name", source["id"]),
                        "author": source.get("author", ""),
                        "description": source.get("description", ""),
                        "image": source.get("image", ""),
                        "site": source.get("site", ""),
                        "feed": source.get("feed", ""),
                        "episodes": [],
                    }
                )
                print(f"ERROR {source['id']}: {exc}", file=sys.stderr)
            errors.append(f"{source.get('id')}: {exc}")

    changed = result != previous.get("podcasts", [])
    updated_at = (datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                  if changed else previous.get("updatedAt"))
    payload = {
        "updatedAt": updated_at,
        "podcasts": result,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if errors:
        print("Algunos feeds fallaron, pero se conservaron datos previos cuando existían.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
