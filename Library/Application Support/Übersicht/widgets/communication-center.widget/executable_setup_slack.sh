#!/bin/bash
set -euo pipefail

APP_SERVICE="communication-center.slack-app-token"
USER_SERVICE="communication-center.slack-user-token"
LABEL="com.bthorne.communication-center"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

printf '%s\n' "Slack setup for the Übersicht Communications widget"
printf '%s\n' "1. Create a Slack app from slack-manifest.yaml at https://api.slack.com/apps?new_app=1"
printf '%s\n' "2. Under Basic Information, generate an app-level token with connections:write."
printf '%s\n' "3. Install the app to the workspace and copy its User OAuth Token."
printf '\n'

read -r -s -p "App-level token (xapp-…): " app_token
printf '\n'
read -r -s -p "User OAuth token (xoxp-…): " user_token
printf '\n'

if [[ "$app_token" != xapp-* ]]; then
  echo "Expected an xapp- app-level token." >&2
  exit 2
fi
if [[ "$user_token" != xoxp-* ]]; then
  echo "Expected an xoxp- user OAuth token." >&2
  exit 2
fi

printf '%s\n%s\n' "$app_token" "$app_token" \
  | /usr/bin/security add-generic-password -U -s "$APP_SERVICE" -a "$USER" -w >/dev/null
printf '%s\n%s\n' "$user_token" "$user_token" \
  | /usr/bin/security add-generic-password -U -s "$USER_SERVICE" -a "$USER" -w >/dev/null
unset app_token user_token

if [[ ! -f "$PLIST" ]]; then
  echo "Missing $PLIST; apply the dotfiles first." >&2
  exit 1
fi

/bin/launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(id -u)" "$PLIST"
/bin/launchctl kickstart -k "gui/$(id -u)/$LABEL"
printf '%s\n' "Slack helper started. Übersicht will update within 30 seconds."
