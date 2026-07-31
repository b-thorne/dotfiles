#!/usr/bin/env python3
"""Fetch Atomic pull requests and open selected PRs in an iTerm2 browser tab."""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

ORGANIZATION = "Atomic-Industries"
REPOSITORIES = ("atomic", "BlockOpt", "VauxhallCorsa", "atomic-bench")


def gh_executable() -> str:
    discovered = shutil.which("gh")
    if discovered:
        return discovered
    for candidate in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh"):
        if pathlib.Path(candidate).is_file():
            return candidate
    raise RuntimeError("GitHub CLI not found; install gh and run `gh auth login`")


def gh_api(endpoint: str, *, paginate: bool = False):
    arguments = [gh_executable(), "api"]
    if paginate:
        arguments.extend(("--paginate", "--slurp"))
    arguments.append(endpoint)
    completed = subprocess.run(
        arguments,
        check=True,
        capture_output=True,
        text=True,
        timeout=25,
    )
    return json.loads(completed.stdout)


def flatten_pages(pages) -> list[dict]:
    return [item for page in pages for item in page if item]


def query_github() -> tuple[dict, dict[str, list[dict]], set[str]]:
    viewer = gh_api("user")
    repositories = {}
    for repository in REPOSITORIES:
        endpoint = (
            f"repos/{ORGANIZATION}/{repository}/pulls"
            "?state=open&per_page=100&sort=updated&direction=desc"
        )
        repositories[repository] = flatten_pages(gh_api(endpoint, paginate=True))

    requested_team_slugs = {
        team.get("slug", "").casefold()
        for pulls in repositories.values()
        for pull in pulls
        for team in (pull.get("requested_teams") or [])
        if team.get("slug")
    }
    viewer_team_slugs = set()
    if requested_team_slugs:
        try:
            teams = flatten_pages(gh_api("user/teams?per_page=100", paginate=True))
            viewer_team_slugs = {
                team.get("slug", "").casefold()
                for team in teams
                if ((team.get("organization") or {}).get("login") or "").casefold()
                == ORGANIZATION.casefold()
                and team.get("slug")
            }
        except (json.JSONDecodeError, OSError, subprocess.SubprocessError):
            # Direct user requests still work when the token cannot list teams.
            pass

    return viewer, repositories, viewer_team_slugs


def timestamp(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return 0


def build_summary(
    viewer_data: dict,
    repository_data: dict[str, list[dict]],
    viewer_team_slugs: set[str],
) -> dict:
    viewer = (viewer_data.get("login") or "").strip()
    viewer_key = viewer.casefold()
    prs = []
    repositories = []

    for repository_name in REPOSITORIES:
        nodes = repository_data.get(repository_name) or []
        repositories.append({"name": repository_name, "open": len(nodes)})

        for node in nodes:
            author = ((node.get("user") or {}).get("login") or "ghost")
            requested_users = {
                requested.get("login", "").casefold()
                for requested in (node.get("requested_reviewers") or [])
                if requested.get("login")
            }
            requested_teams = {
                team.get("slug", "").casefold()
                for team in (node.get("requested_teams") or [])
                if team.get("slug")
            }
            prs.append(
                {
                    "repo": repository_name,
                    "number": node.get("number"),
                    "title": node.get("title") or "Untitled pull request",
                    "url": node.get("html_url"),
                    "author": author,
                    "isDraft": bool(node.get("draft")),
                    "updatedAt": node.get("updated_at"),
                    "reviewRequested": bool(
                        (viewer_key and viewer_key in requested_users)
                        or requested_teams.intersection(viewer_team_slugs)
                    ),
                    "authoredByViewer": bool(
                        viewer_key and author.casefold() == viewer_key
                    ),
                }
            )

    def sort_key(pr: dict) -> tuple[int, float]:
        priority = 2 if pr["reviewRequested"] else 1 if pr["authoredByViewer"] else 0
        return (-priority, -timestamp(pr.get("updatedAt") or ""))

    prs.sort(key=sort_key)
    return {
        "viewer": viewer,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "repositories": repositories,
        "totalOpen": sum(repository["open"] for repository in repositories),
        "omitted": 0,
        "prs": prs,
    }


def print_summary() -> int:
    try:
        print(json.dumps(build_summary(*query_github()), separators=(",", ":")))
    except (json.JSONDecodeError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        message = str(error).strip().splitlines()[-1] or error.__class__.__name__
        print(json.dumps({"error": message, "prs": [], "repositories": []}))
    return 0


def browser_profile(url: str) -> tuple[pathlib.Path, str]:
    token = uuid.uuid4().hex
    profile_name = f"Ubersicht GitHub {token[:10]}"
    profile = {
        "Profiles": [
            {
                "Name": profile_name,
                "Guid": str(uuid.uuid4()).upper(),
                "Custom Command": "Browser",
                "Initial URL": url,
            }
        ]
    }
    directory = pathlib.Path.home() / "Library/Application Support/iTerm2/DynamicProfiles"
    directory.mkdir(parents=True, exist_ok=True)
    for stale in directory.glob("UbersichtGitHub-*"):
        try:
            if time.time() - stale.stat().st_mtime > 300:
                stale.unlink()
        except OSError:
            pass

    destination = directory / f"UbersichtGitHub-{token}.json"
    temporary = destination.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(profile), encoding="utf-8")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination, profile_name


def create_browser_tab(profile_name: str) -> None:
    script = r'''
on run argv
  set requestedProfile to item 1 of argv
  tell application "iTerm2"
    if (count of windows) is 0 then
      create window with profile requestedProfile
    else
      tell current window to create tab with profile requestedProfile
    end if
    activate
  end tell
end run
'''
    last_error = None
    for delay in (0.45, 0.65, 0.9):
        time.sleep(delay)
        try:
            subprocess.run(
                ["osascript", "-e", script, profile_name],
                check=True,
                capture_output=True,
                text=True,
                timeout=12,
            )
            return
        except subprocess.SubprocessError as error:
            last_error = error
    raise RuntimeError(f"iTerm2 did not load its temporary browser profile: {last_error}")


def open_pull_request(repository: str, number_text: str) -> int:
    if repository not in REPOSITORIES:
        raise RuntimeError("repository is not in the Atomic PR allowlist")
    try:
        number = int(number_text)
    except ValueError as error:
        raise RuntimeError("invalid pull request number") from error
    if number < 1:
        raise RuntimeError("invalid pull request number")

    url = f"https://github.com/{ORGANIZATION}/{quote(repository, safe='')}/pull/{number}"
    profile_path, profile_name = browser_profile(url)
    try:
        create_browser_tab(profile_name)
    finally:
        profile_path.unlink(missing_ok=True)
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "summary":
        return print_summary()
    if len(sys.argv) == 4 and sys.argv[1] == "open":
        return open_pull_request(sys.argv[2], sys.argv[3])
    print("usage: github_prs.py summary | open REPOSITORY NUMBER", file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"github-prs: {error}", file=sys.stderr)
        raise SystemExit(1)
