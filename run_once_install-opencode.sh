#!/bin/sh
set -eu

installer=$(mktemp)
trap 'rm -f "$installer"' EXIT HUP INT TERM
curl -fsSL https://opencode.ai/install -o "$installer"
sh "$installer"
