## Dotfiles workflow

When changing any of my dotfiles or user-level configuration:

- Keep the chezmoi source repository at `~/.local/share/chezmoi` as the canonical copy; do not leave changes only in their destination paths.
- Add or update the corresponding file in chezmoi, then review the source diff and `chezmoi diff` where possible.
- Never commit credentials, tokens, private keys, or rendered secrets. Preserve secret-manager templates and references instead.
- Commit the reviewed dotfile changes with a descriptive message and push them to the configured upstream repository.
- If committing or pushing cannot be completed, report the exact blocker and the unpushed changes.
