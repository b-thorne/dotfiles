# Atomic GitHub PRs

An Übersicht panel for open pull requests in:

- `Atomic-Industries/atomic`
- `Atomic-Industries/BlockOpt`
- `Atomic-Industries/VauxhallCorsa`
- `Atomic-Industries/atomic-bench`

Review requests are sorted first and use the Shell cursor-guide cyan (`#85c5da`).
PRs authored by the current GitHub user are next and use the Pi cursor-guide
pink (`#d183e8`). Remaining PRs follow in most-recently-updated order. The list
is scrollable.

## Requirements

- Übersicht
- GitHub CLI (`gh`), authenticated with access to the Atomic-Industries org
- iTerm2 with a browser profile/plugin configured

The widget refreshes every five minutes using authenticated, paginated GitHub
REST requests. Direct and team review requests are both recognized. No GitHub
token is stored in the widget or dotfiles.

Clicking a row asks the Python helper to create a short-lived iTerm2 dynamic
browser profile whose initial URL is that PR. AppleScript opens it as a tab in
the current iTerm2 window, then the temporary profile file is deleted. macOS may
ask once for permission for Übersicht to automate iTerm2. This avoids enabling
iTerm2's Python API or changing the system's default browser. Sign in to GitHub
once in the iTerm2 browser to make private Atomic repository URLs available.

Interactive rows and scrolling require Übersicht's interaction shortcut.
