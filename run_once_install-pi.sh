#!/bin/sh
set -eu

npm_bin=$(command -v npm 2>/dev/null || true)
if [ -z "$npm_bin" ]; then
  for candidate in /opt/homebrew/bin/npm /usr/local/bin/npm; do
    if [ -x "$candidate" ]; then
      npm_bin=$candidate
      break
    fi
  done
fi
if [ -z "$npm_bin" ]; then
  echo "npm is not installed" >&2
  exit 1
fi

"$npm_bin" install --global @earendil-works/pi-coding-agent
