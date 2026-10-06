# dotfiles

Managed with [chezmoi](https://www.chezmoi.io). The same source renders on
two machines:

| Machine | OS | Role |
| --- | --- | --- |
| `pro` | macOS | MacBook, daily driver |
| `desk` | Pop!_OS 22.04 (Linux) | personal compute box: i7-14700K, 62 GiB, RTX 4070 Ti SUPER |

## Layout

- `dot_zshrc.tmpl` — one zsh config for both; macOS-only parts (Homebrew, iTerm2 Pi toggle) are behind `.chezmoi.os`.
- `dot_config/starship.toml.tmpl` — the prompt. The first item is a machine badge: green `mac` on the laptop, yellow `box` on `desk`.
- `private_dot_ssh/config.tmpl` — documented ssh config. The three paths to `desk` (`desk-dock`, `desk`, `desk-wifi`) are defined and explained there.
- `.chezmoitemplates/` — text shared between files: the writing-style rules and the compute-resources note that go into every agent instruction file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.pi/agent/APPEND_SYSTEM.md`).
- `run_onchange_before_install-packages-darwin.sh.tmpl` — `brew bundle` from `Brewfile`.
- `run_onchange_before_install-packages-linux.sh.tmpl` — pinned user-space binaries (fzf, eza, zoxide, uv) into `~/.local/bin`, plus `zsh` and its plugins through apt when sudo is available.
- `.chezmoiignore` — hides macOS-only targets (Brewfile, iTerm2, Übersicht, launchd) on Linux.

## Bootstrap

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin
~/.local/bin/chezmoi init --apply b-thorne
```

On Linux, run `chezmoi apply` from a terminal the first time so the apt step can ask for the sudo password and `chsh` can switch the login shell.
