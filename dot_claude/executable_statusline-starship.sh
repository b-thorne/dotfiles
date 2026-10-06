#!/bin/bash
# Managed by chezmoi: dot_claude/executable_statusline-starship.sh. Runs on macOS and Linux.
# Starship-style statusline for Claude Code, mirroring the Pi TUI prompt
# (~/.pi/agent/extensions/starship-ui.ts + ~/.pi/agent/themes/starship.json)
# with the theme's pink accent hue-rotated from #d183e8 to green #83e883.
#
# Two lines, rendered directly above the input box:
#   Opus 5 · 12% ctx · 34% 5h -> 4:15 PM · $1.23     <- Pi's footer content
#   bthorne @ host: ~/work/atomic on  main          <- Pi's identity line

input=$(cat)

MUTED=$'\033[38;2;153;153;153m'    # theme "muted"           #999999
DIM=$'\033[38;2;119;119;119m'      # theme "dim"             #777777
ACCENT=$'\033[38;2;131;232;131m'   # theme "piPink" -> green #83e883
RESET=$'\033[0m'
BRANCH_GLYPH=$'\356\202\240'       # U+E0A0, nerd-font git branch

read_fields=$(printf '%s' "$input" | jq -r '
  def n: if . == null then "" else (. | round | tostring) end;
  [ (.model.display_name // "")
  , ( if .context_window.current_usage
      then ( ( .context_window.current_usage.input_tokens
             + .context_window.current_usage.cache_creation_input_tokens
             + .context_window.current_usage.cache_read_input_tokens )
             * 100 / (.context_window.context_window_size // 200000) ) | n
      else "" end )
  , (.rate_limits.five_hour.used_percentage | n)
  , (.rate_limits.five_hour.resets_at // "" | tostring)
  , (.cost.total_cost_usd // "" | tostring)
  , (.workspace.current_dir // .cwd // "")
  ] | join("\u001f")' 2>/dev/null)

# U+001F, not tab: tab is IFS whitespace, so runs of it collapse and empty
# fields would shift every later field left.
IFS=$'\037' read -r model ctx_pct usage_pct resets_at cost dir <<<"$read_fields"

## -- line 1: Pi's footer -- model, context, session usage, cost -------------
footer="${MUTED}${model:-no model}${RESET}"
[ -n "$ctx_pct" ] && footer="${footer}${DIM} · ${ctx_pct}% ctx${RESET}"

if [ -n "$usage_pct" ]; then
  reset_display=""
  if [ -n "$resets_at" ] && [ "$resets_at" != "null" ]; then
    # macOS: honour the system 24-hour switch; BSD date takes -r <epoch>.
    # Linux: GNU date takes -d @<epoch>; use 24-hour time.
    if [ "$(uname -s)" = Darwin ]; then
      if [ "$(defaults read -g AppleICUForce24HourTime 2>/dev/null)" = "1" ]; then
        reset_time=$(date -r "$resets_at" "+%H:%M" 2>/dev/null)
      else
        reset_time=$(date -r "$resets_at" "+%-I:%M %p" 2>/dev/null)
      fi
    else
      reset_time=$(date -d "@$resets_at" "+%H:%M" 2>/dev/null)
    fi
    [ -n "$reset_time" ] && reset_display=" → ${reset_time}"
  fi
  footer="${footer}${DIM} · ${usage_pct}% 5h${reset_display}${RESET}"
fi

if [ -n "$cost" ] && [ "$cost" != "0" ]; then
  footer="${footer}${DIM} · \$$(printf '%.2f' "$cost")${RESET}"
fi

## -- line 2: Pi's identity line -- user @ host: cwd on  branch ------------
[ -z "$dir" ] && dir="$PWD"
case "$dir" in
  "$HOME")   pretty_dir="~" ;;
  "$HOME"/*) pretty_dir="~${dir#"$HOME"}" ;;
  *)         pretty_dir="$dir" ;;
esac

user=${USER:-$(id -un)}
host=$(hostname -s 2>/dev/null || hostname)

identity="${MUTED}${user} @ ${host}: ${RESET}${ACCENT}${pretty_dir}${RESET}"

branch=$(git -C "$dir" branch --show-current 2>/dev/null)
[ -n "$branch" ] && identity="${identity}${MUTED} on ${BRANCH_GLYPH} ${branch}${RESET}"

printf '%s\n%s\n' "$footer" "$identity"
