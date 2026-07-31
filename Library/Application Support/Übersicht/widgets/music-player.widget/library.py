#!/usr/bin/env python3
"""Index and stage a Proton Drive music library for the Übersicht player."""

from __future__ import annotations

import hashlib
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urlparse

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}
PLAYLIST_EXTENSIONS = {".m3u", ".m3u8", ".pls"}
CACHE_VERSION = 3
CACHE_DIR = Path.home() / "Library" / "Caches" / "uebersicht-music-player"
INDEX_PATH = CACHE_DIR / "library.json"
WIDGET_DIR = Path(__file__).resolve().parent
STAGE_DIR = WIDGET_DIR / "cache"
MAX_STAGED_TRACKS = 24


def find_library_root() -> Path:
    override = os.environ.get("PROTON_MUSIC_ROOT")
    if override:
        root = Path(override).expanduser()
        if (root / "Music").is_dir():
            return root
        if root.is_dir() and root.name == "Music":
            return root.parent
        raise RuntimeError("PROTON_MUSIC_ROOT does not contain a Music directory")

    cloud_storage = Path.home() / "Library" / "CloudStorage"
    for drive in sorted(cloud_storage.glob("ProtonDrive-*-folder")):
        candidates = (drive / "music", drive / "Music", drive)
        for candidate in candidates:
            if (candidate / "Music").is_dir():
                return candidate
    raise RuntimeError("No Proton Drive music library was found")


def scan_library(media_root: Path) -> tuple[list[Path], list[Path], str]:
    audio: list[Path] = []
    playlists: list[Path] = []
    fingerprint = hashlib.sha256(f"version:{CACHE_VERSION}\n".encode())

    for directory, dirnames, filenames in os.walk(media_root):
        dirnames[:] = sorted(name for name in dirnames if not name.startswith("."))
        for filename in sorted(filenames):
            if filename.startswith("."):
                continue
            path = Path(directory) / filename
            suffix = path.suffix.lower()
            if suffix not in AUDIO_EXTENSIONS and suffix not in PLAYLIST_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            relative = path.relative_to(media_root).as_posix()
            fingerprint.update(
                f"{relative}\0{stat.st_size}\0{stat.st_mtime_ns}\n".encode("utf-8")
            )
            if suffix in AUDIO_EXTENSIONS:
                audio.append(path)
            else:
                playlists.append(path)

    audio.sort(key=lambda path: str(path).casefold())
    playlists.sort(key=lambda path: str(path).casefold())
    return audio, playlists, fingerprint.hexdigest()


def mdls_metadata(path: Path) -> dict:
    try:
        result = subprocess.run(
            ["/usr/bin/mdls", "-plist", "-", str(path)],
            check=True,
            capture_output=True,
            timeout=15,
        )
        return plistlib.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, plistlib.InvalidFileException):
        return {}


def text_value(value, fallback: str) -> str:
    if isinstance(value, list):
        value = value[0] if value else None
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text and text != "(null)" else fallback


def int_value(value, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def float_value(value, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def filename_title(path: Path) -> str:
    title = re.sub(r"^(?:\(?disc\s*\d+\)?\s*)?\d+[\s._-]+", "", path.stem, flags=re.I)
    return title.strip() or path.stem


def track_record(path: Path, media_root: Path, metadata: dict) -> dict:
    relative = path.relative_to(media_root)
    parts = relative.parts
    if parts and parts[0].casefold() in {"music", "audiobooks"}:
        parts = parts[1:]
    path_artist = parts[0] if len(parts) >= 3 else "Unknown Artist"
    path_album = parts[1] if len(parts) >= 3 else (
        parts[0] if len(parts) >= 2 else "Loose Tracks"
    )

    authors = metadata.get("kMDItemAuthors")
    if isinstance(authors, list):
        artist = " & ".join(str(author).strip() for author in authors if str(author).strip())
    else:
        artist = text_value(authors, path_artist)

    relative_string = relative.as_posix()
    track_id = hashlib.sha256(relative_string.encode("utf-8")).hexdigest()[:16]
    return {
        "id": track_id,
        "title": text_value(metadata.get("kMDItemTitle"), filename_title(path)),
        "artist": artist or path_artist,
        "album": text_value(metadata.get("kMDItemAlbum"), path_album),
        "track": int_value(metadata.get("kMDItemAudioTrackNumber")),
        "disc": int_value(metadata.get("kMDItemAudioDiscNumber"), 1),
        "duration": round(float_value(metadata.get("kMDItemDurationSeconds")), 3),
        "extension": path.suffix.lower(),
        "relative": relative_string,
    }


def read_playlist_lines(path: Path) -> list[str]:
    try:
        raw = path.read_bytes()
    except OSError:
        return []
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return []

    if path.suffix.lower() == ".pls":
        entries = []
        for line in text.splitlines():
            match = re.match(r"\s*File\d+\s*=\s*(.+)\s*$", line, re.I)
            if match:
                entries.append(match.group(1))
        return entries

    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def playlist_track_id(
    entry: str,
    playlist_path: Path,
    media_root: Path,
    by_relative: dict[str, str],
    by_filename: dict[str, list[str]],
) -> str | None:
    entry = unquote(entry.strip())
    if entry.lower().startswith("file://"):
        entry = unquote(urlparse(entry).path)
    entry = entry.replace("\\", "/")

    candidates: list[Path] = []
    raw_path = Path(entry).expanduser()
    if raw_path.is_absolute():
        candidates.append(raw_path)
    else:
        candidates.extend((playlist_path.parent / raw_path, media_root / raw_path))

    for candidate in candidates:
        try:
            relative = candidate.resolve(strict=False).relative_to(media_root.resolve())
        except ValueError:
            continue
        track_id = by_relative.get(relative.as_posix().casefold())
        if track_id:
            return track_id

    marker = "/Music/"
    if marker in entry:
        tail = entry.split(marker, 1)[1]
        for relative in (tail, f"Music/{tail}"):
            track_id = by_relative.get(relative.casefold())
            if track_id:
                return track_id

    filename_matches = by_filename.get(Path(entry).name.casefold(), [])
    return filename_matches[0] if len(filename_matches) == 1 else None


def build_playlists(
    playlist_paths: list[Path], tracks: list[dict], media_root: Path
) -> list[dict]:
    by_relative = {track["relative"].casefold(): track["id"] for track in tracks}
    by_filename: dict[str, list[str]] = {}
    for track in tracks:
        by_filename.setdefault(Path(track["relative"]).name.casefold(), []).append(track["id"])

    playlists: list[dict] = []
    for path in playlist_paths:
        track_ids = []
        for entry in read_playlist_lines(path):
            track_id = playlist_track_id(
                entry, path, media_root, by_relative, by_filename
            )
            if track_id:
                track_ids.append(track_id)
        relative = path.relative_to(media_root).as_posix()
        playlists.append(
            {
                "id": hashlib.sha256(relative.encode("utf-8")).hexdigest()[:16],
                "name": path.stem,
                "trackIds": track_ids,
            }
        )

    playlist_roots = (media_root / "playlists", media_root / "Music" / "playlists")
    for playlist_root in playlist_roots:
        if not playlist_root.is_dir():
            continue
        for directory in sorted(
            (path for path in playlist_root.iterdir() if path.is_dir()),
            key=lambda path: path.name.casefold(),
        ):
            track_ids = []
            for path in sorted(directory.rglob("*")):
                if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS:
                    try:
                        relative = path.relative_to(media_root).as_posix().casefold()
                    except ValueError:
                        continue
                    track_id = by_relative.get(relative)
                    if track_id:
                        track_ids.append(track_id)
            if track_ids:
                playlists.append(
                    {
                        "id": hashlib.sha256(
                            directory.relative_to(media_root).as_posix().encode("utf-8")
                        ).hexdigest()[:16],
                        "name": directory.name,
                        "trackIds": track_ids,
                    }
                )

    return sorted(playlists, key=lambda playlist: playlist["name"].casefold())


def load_cache() -> dict | None:
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_cache(payload: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = INDEX_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(INDEX_PATH)


def build_index(media_root: Path, audio_paths: list[Path], playlist_paths: list[Path], fingerprint: str) -> dict:
    workers = min(12, max(4, (os.cpu_count() or 4)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        metadata = list(pool.map(mdls_metadata, audio_paths))

    tracks = [
        track_record(path, media_root, item)
        for path, item in zip(audio_paths, metadata, strict=True)
    ]
    tracks.sort(
        key=lambda track: (
            track["artist"].casefold(),
            track["album"].casefold(),
            track["disc"],
            track["track"],
            track["title"].casefold(),
        )
    )
    playlists = build_playlists(playlist_paths, tracks, media_root)
    return {
        "version": CACHE_VERSION,
        "fingerprint": fingerprint,
        "generatedAt": int(time.time()),
        "tracks": tracks,
        "playlists": playlists,
    }


def public_payload(cache: dict) -> dict:
    tracks = [
        {key: value for key, value in track.items() if key != "relative"}
        for track in cache["tracks"]
    ]
    artists = {track["artist"] for track in tracks}
    albums = {(track["artist"], track["album"]) for track in tracks}
    return {
        "generatedAt": cache["generatedAt"],
        "tracks": tracks,
        "playlists": cache["playlists"],
        "stats": {
            "tracks": len(tracks),
            "artists": len(artists),
            "albums": len(albums),
            "playlists": len(cache["playlists"]),
        },
    }


def index_command() -> None:
    library_root = find_library_root()
    media_root = library_root
    audio_paths, playlist_paths, fingerprint = scan_library(media_root)
    cache = load_cache()
    if (
        not cache
        or cache.get("version") != CACHE_VERSION
        or cache.get("fingerprint") != fingerprint
    ):
        cache = build_index(media_root, audio_paths, playlist_paths, fingerprint)
        write_cache(cache)
    print(json.dumps(public_payload(cache), ensure_ascii=False, separators=(",", ":")))


def stage_command(track_id: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{16}", track_id):
        raise RuntimeError("Invalid track id")
    cache = load_cache()
    if not cache:
        raise RuntimeError("The music index has not been built")
    track = next((item for item in cache["tracks"] if item["id"] == track_id), None)
    if not track:
        raise RuntimeError("Track not found")

    media_root = find_library_root()
    source = media_root / track["relative"]
    if not source.is_file():
        raise RuntimeError("Track is not available in Proton Drive")

    STAGE_DIR.mkdir(parents=True, exist_ok=True)
    destination = STAGE_DIR / f"{track_id}{source.suffix.lower()}"
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    try:
        subprocess.run(
            ["/bin/cp", "-c", str(source), str(temporary)],
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.SubprocessError):
        shutil.copy2(source, temporary)
    os.utime(temporary, None)
    temporary.replace(destination)

    staged = sorted(
        (
            path
            for path in STAGE_DIR.iterdir()
            if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for stale in staged[MAX_STAGED_TRACKS:]:
        stale.unlink(missing_ok=True)

    print(
        json.dumps(
            {
                "id": track_id,
                "url": f"/music-player.widget/cache/{destination.name}",
            },
            separators=(",", ":"),
        )
    )


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "index"
    if command == "index":
        index_command()
    elif command == "stage" and len(sys.argv) == 3:
        stage_command(sys.argv[2])
    else:
        raise RuntimeError("Usage: library.py index | library.py stage TRACK_ID")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
