#!/usr/bin/env python3
"""Data and persistence helper for the weather/feed/todo Übersicht widget."""

from __future__ import annotations

import base64
import concurrent.futures
import datetime as dt
import email.utils
import fcntl
import hashlib
import html
import json
import os
import re
import secrets
import shlex
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable

LOCATIONS = (
    {
        "name": "San Francisco",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "timezone": "America/Los_Angeles",
    },
    {
        "name": "Portola Valley",
        "latitude": 37.3841,
        "longitude": -122.2352,
        "timezone": "America/Los_Angeles",
    },
    {
        "name": "London",
        "latitude": 51.5074,
        "longitude": -0.1278,
        "timezone": "Europe/London",
    },
)

HOME = Path.home()
NEWSBOAT_URLS = Path(
    os.environ.get("UEBERSICHT_NEWSBOAT_URLS", HOME / ".config/newsboat/urls")
)
STATE_DIR = Path(
    os.environ.get(
        "UEBERSICHT_DASHBOARD_STATE_DIR",
        HOME / "Library/Application Support/Übersicht",
    )
)
CACHE_DIR = Path(
    os.environ.get(
        "UEBERSICHT_DASHBOARD_CACHE_DIR",
        HOME / "Library/Caches/uebersicht-weather-cities",
    )
)
TODO_PATH = STATE_DIR / "weather-cities-todos.json"
TODO_LOCK_PATH = STATE_DIR / ".weather-cities-todos.lock"
RSS_CACHE_PATH = CACHE_DIR / "rss-summary.json"
RSS_CACHE_SECONDS = 9 * 60
MAX_FEED_ITEMS = 10
USER_AGENT = "Uebersicht weather-feed-todo widget/1.0"


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, payload: Any, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path: Path, fallback: Any) -> Any:
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError, TypeError):
        return fallback


def weather_url(location: dict[str, Any]) -> str:
    query = urllib.parse.urlencode(
        {
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "current": "temperature_2m,apparent_temperature,weather_code,is_day",
            "daily": (
                "temperature_2m_max,temperature_2m_min,"
                "precipitation_probability_max"
            ),
            "temperature_unit": "fahrenheit",
            "forecast_days": 1,
            "timezone": location["timezone"],
        }
    )
    return f"https://api.open-meteo.com/v1/forecast?{query}"


def request_bytes(url: str, timeout: float = 9) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(4 * 1024 * 1024)


def rounded(value: Any) -> int | None:
    return round(value) if isinstance(value, (int, float)) else None


def fetch_weather(location: dict[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {"name": location["name"], "available": False}
    try:
        payload = json.loads(request_bytes(weather_url(location)).decode("utf-8"))
        current = payload.get("current") or {}
        daily = payload.get("daily") or {}
        if not current or not daily:
            return row
        current_time = str(current.get("time") or "")
        row.update(
            {
                "available": True,
                "localTime": current_time.split("T", 1)[1]
                if "T" in current_time
                else "—",
                "temperature": rounded(current.get("temperature_2m")),
                "apparent": rounded(current.get("apparent_temperature")),
                "high": rounded((daily.get("temperature_2m_max") or [None])[0]),
                "low": rounded((daily.get("temperature_2m_min") or [None])[0]),
                "rain": rounded(
                    (daily.get("precipitation_probability_max") or [None])[0]
                ),
                "weatherCode": current.get("weather_code"),
                "isDay": current.get("is_day") == 1,
            }
        )
    except (OSError, ValueError, TypeError, IndexError, urllib.error.URLError):
        pass
    return row


def weather_summary() -> dict[str, Any]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(LOCATIONS)) as pool:
        rows = list(pool.map(fetch_weather, LOCATIONS))
    return {
        "rows": rows,
        "online": sum(1 for row in rows if row["available"]),
        "updatedAt": iso_now(),
    }


def read_subscriptions(path: Path = NEWSBOAT_URLS) -> list[str]:
    subscriptions: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return subscriptions

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        try:
            fields = shlex.split(stripped, comments=False)
        except ValueError:
            continue
        if fields and fields[0].startswith(("https://", "http://")):
            subscriptions.append(fields[0])
    return subscriptions


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def element_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return " ".join("".join(element.itertext()).split())


def child_text(element: ET.Element, *names: str) -> str:
    wanted = {name.lower() for name in names}
    for child in element:
        if local_name(child.tag) in wanted:
            return element_text(child)
    return ""


def clean_title(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", html.unescape(value or ""))
    return " ".join(without_tags.split())[:240]


def parse_timestamp(value: str) -> float:
    if not value:
        return 0
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError):
        pass
    try:
        parsed = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError):
        return 0


def safe_http_url(value: str) -> str:
    try:
        parsed = urllib.parse.urlparse(value.strip())
    except (AttributeError, ValueError):
        return ""
    return value.strip() if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def article_record(title: str, link: str, source: str, published: str) -> dict[str, Any] | None:
    url = safe_http_url(link)
    cleaned_title = clean_title(title)
    if not url or not cleaned_title:
        return None
    timestamp = parse_timestamp(published)
    return {
        "id": hashlib.sha256(url.encode("utf-8")).hexdigest()[:16],
        "title": cleaned_title,
        "url": url,
        "source": clean_title(source)[:80] or urllib.parse.urlparse(url).netloc,
        "publishedAt": (
            dt.datetime.fromtimestamp(timestamp, dt.timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
            if timestamp
            else None
        ),
        "timestamp": timestamp,
    }


def parse_feed(document: bytes, feed_url: str) -> list[dict[str, Any]]:
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", document, flags=re.IGNORECASE):
        raise ET.ParseError("Feed DTDs and entities are not supported")
    root = ET.fromstring(document)
    atom_entries = [node for node in root.iter() if local_name(node.tag) == "entry"]
    records: list[dict[str, Any]] = []

    if atom_entries:
        source = child_text(root, "title") or urllib.parse.urlparse(feed_url).netloc
        for entry in atom_entries[:40]:
            link = ""
            for candidate in entry:
                if local_name(candidate.tag) != "link":
                    continue
                relation = candidate.attrib.get("rel", "alternate")
                candidate_url = candidate.attrib.get("href", "")
                if relation == "alternate" and safe_http_url(candidate_url):
                    link = candidate_url
                    break
            record = article_record(
                child_text(entry, "title"),
                link or child_text(entry, "link"),
                source,
                child_text(entry, "published", "updated", "date"),
            )
            if record:
                records.append(record)
        return records

    channel = next(
        (node for node in root.iter() if local_name(node.tag) == "channel"), root
    )
    source = child_text(channel, "title") or urllib.parse.urlparse(feed_url).netloc
    items = [node for node in root.iter() if local_name(node.tag) == "item"]
    for item in items[:40]:
        link = child_text(item, "link")
        if not link:
            for candidate in item:
                if local_name(candidate.tag) == "guid" and candidate.attrib.get(
                    "isPermaLink", "true"
                ).lower() != "false":
                    link = element_text(candidate)
                    break
        record = article_record(
            child_text(item, "title"),
            link,
            source,
            child_text(item, "pubDate", "published", "updated", "date"),
        )
        if record:
            records.append(record)
    return records


def fetch_feed(feed_url: str) -> tuple[bool, list[dict[str, Any]]]:
    try:
        return True, parse_feed(request_bytes(feed_url), feed_url)
    except (ET.ParseError, OSError, ValueError, urllib.error.URLError):
        return False, []


def subscription_fingerprint(urls: list[str]) -> str:
    return hashlib.sha256("\n".join(urls).encode("utf-8")).hexdigest()[:20]


def cached_rss(urls: list[str]) -> dict[str, Any] | None:
    cached = read_json(RSS_CACHE_PATH, None)
    if not isinstance(cached, dict):
        return None
    if cached.get("fingerprint") != subscription_fingerprint(urls):
        return None
    try:
        age = utc_now().timestamp() - float(cached["generatedTimestamp"])
    except (KeyError, TypeError, ValueError):
        return None
    return cached if 0 <= age < RSS_CACHE_SECONDS else None


def rss_summary() -> dict[str, Any]:
    urls = read_subscriptions()
    fresh_cache = cached_rss(urls)
    if fresh_cache:
        return {key: value for key, value in fresh_cache.items() if key != "generatedTimestamp"}

    prior = read_json(RSS_CACHE_PATH, None)
    results: list[tuple[bool, list[dict[str, Any]]]] = []
    if urls:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(urls))) as pool:
            results = list(pool.map(fetch_feed, urls))

    available = sum(1 for success, _ in results if success)
    articles = [article for _, items in results for article in items]
    deduplicated: dict[str, dict[str, Any]] = {}
    for article in articles:
        deduplicated.setdefault(article["url"], article)
    items = sorted(
        deduplicated.values(),
        key=lambda article: (article["timestamp"], article["title"].lower()),
        reverse=True,
    )[:MAX_FEED_ITEMS]

    stale = False
    error = None
    if urls and not available and isinstance(prior, dict) and prior.get("items"):
        items = prior["items"]
        stale = True
        error = "Feeds could not be refreshed; showing cached articles"
    elif not urls:
        error = "No Newsboat subscriptions found"
    elif not available:
        error = "Feeds could not be reached"

    for item in items:
        item.pop("timestamp", None)

    summary = {
        "items": items,
        "configured": len(urls),
        "available": available,
        "updatedAt": iso_now(),
        "stale": stale,
        "error": error,
        "fingerprint": subscription_fingerprint(urls),
        "generatedTimestamp": utc_now().timestamp(),
    }
    atomic_write_json(RSS_CACHE_PATH, summary)
    return {key: value for key, value in summary.items() if key != "generatedTimestamp"}


def normalized_task_text(value: str) -> str:
    text = " ".join(value.strip().split())
    if not text:
        raise ValueError("Task text cannot be empty")
    if len(text) > 240:
        raise ValueError("Task text is limited to 240 characters")
    return text


def load_todos(strict: bool = False) -> list[dict[str, Any]]:
    sentinel = object()
    payload = read_json(TODO_PATH, sentinel)
    if payload is sentinel:
        if TODO_PATH.exists() and strict:
            raise ValueError("The to-do file is unreadable; refusing to overwrite it")
        return []
    if not isinstance(payload, dict) or not isinstance(payload.get("tasks", []), list):
        if strict:
            raise ValueError("The to-do file has an unknown format; refusing to overwrite it")
        return []

    valid: list[dict[str, Any]] = []
    invalid = False
    for task in payload.get("tasks", []):
        if not isinstance(task, dict) or not re.fullmatch(
            r"[0-9a-f]{16}", str(task.get("id", ""))
        ):
            invalid = True
            continue
        try:
            text = normalized_task_text(str(task.get("text", "")))
        except ValueError:
            invalid = True
            continue
        valid.append(
            {
                "id": task["id"],
                "text": text,
                "done": bool(task.get("done")),
                "createdAt": task.get("createdAt") or iso_now(),
                "updatedAt": task.get("updatedAt") or task.get("createdAt") or iso_now(),
            }
        )
    if invalid and strict:
        raise ValueError("The to-do file contains invalid tasks; refusing to overwrite it")
    return valid


def mutate_todos(mutator: Callable[[list[dict[str, Any]]], None]) -> list[dict[str, Any]]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with TODO_LOCK_PATH.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        tasks = load_todos(strict=True)
        mutator(tasks)
        atomic_write_json(TODO_PATH, {"version": 1, "tasks": tasks})
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return tasks


def decode_text(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(value + padding).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as error:
        raise ValueError("Task text was not valid UTF-8") from error


def require_task_id(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{16}", value):
        raise ValueError("Invalid task identifier")
    return value


def find_task(tasks: list[dict[str, Any]], task_id: str) -> dict[str, Any]:
    task = next((candidate for candidate in tasks if candidate["id"] == task_id), None)
    if task is None:
        raise ValueError("Task no longer exists")
    return task


def todo_add(encoded_text: str) -> list[dict[str, Any]]:
    text = normalized_task_text(decode_text(encoded_text))

    def add(tasks: list[dict[str, Any]]) -> None:
        timestamp = iso_now()
        tasks.append(
            {
                "id": secrets.token_hex(8),
                "text": text,
                "done": False,
                "createdAt": timestamp,
                "updatedAt": timestamp,
            }
        )

    return mutate_todos(add)


def todo_edit(task_id: str, encoded_text: str) -> list[dict[str, Any]]:
    task_id = require_task_id(task_id)
    text = normalized_task_text(decode_text(encoded_text))

    def edit(tasks: list[dict[str, Any]]) -> None:
        task = find_task(tasks, task_id)
        task.update({"text": text, "updatedAt": iso_now()})

    return mutate_todos(edit)


def todo_toggle(task_id: str) -> list[dict[str, Any]]:
    task_id = require_task_id(task_id)

    def toggle(tasks: list[dict[str, Any]]) -> None:
        task = find_task(tasks, task_id)
        task.update({"done": not task["done"], "updatedAt": iso_now()})

    return mutate_todos(toggle)


def todo_delete(task_id: str) -> list[dict[str, Any]]:
    task_id = require_task_id(task_id)

    def delete(tasks: list[dict[str, Any]]) -> None:
        task = find_task(tasks, task_id)
        tasks.remove(task)

    return mutate_todos(delete)


def open_article(article_id: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{16}", article_id):
        raise ValueError("Invalid article identifier")
    cached = read_json(RSS_CACHE_PATH, {})
    article = next(
        (
            item
            for item in cached.get("items", [])
            if isinstance(item, dict) and item.get("id") == article_id
        ),
        None,
    )
    if not article or not safe_http_url(str(article.get("url", ""))):
        raise ValueError("Article is no longer in the feed cache")
    subprocess.run(["/usr/bin/open", article["url"]], check=True)


def print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def summary() -> dict[str, Any]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        weather_future = pool.submit(weather_summary)
        rss_future = pool.submit(rss_summary)
        return {
            "weather": weather_future.result(),
            "rss": rss_future.result(),
            "todos": load_todos(),
        }


def main(argv: list[str]) -> int:
    try:
        action = argv[1] if len(argv) > 1 else "summary"
        if action == "summary" and len(argv) == 2:
            print_json(summary())
        elif action == "todo-add" and len(argv) == 3:
            print_json({"todos": todo_add(argv[2])})
        elif action == "todo-edit" and len(argv) == 4:
            print_json({"todos": todo_edit(argv[2], argv[3])})
        elif action == "todo-toggle" and len(argv) == 3:
            print_json({"todos": todo_toggle(argv[2])})
        elif action == "todo-delete" and len(argv) == 3:
            print_json({"todos": todo_delete(argv[2])})
        elif action == "rss-open" and len(argv) == 3:
            open_article(argv[2])
            print_json({"opened": True})
        else:
            raise ValueError("Unknown or incomplete dashboard command")
        return 0
    except Exception as error:  # Keep the widget's command surface concise.
        print(f"weather-cities: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
