# Communications widget

An Übersicht focus inbox with two tabs:

- **Slack:** new direct messages, personal mentions, reactions to your messages, and replies to threads in which you have participated. Short replies are sent through Slack's supported `chat.postMessage` API.
- **Email:** unread messages from every enabled Apple Mail account, including Proton after Proton Mail Bridge is connected. Selecting a message opens it in Mail.

## Interaction

Enable Übersicht's interaction shortcut and Accessibility access. This machine uses **Control–Option–U** (`⌃⌥U`) to make widgets interactive.

## Slack setup

1. Open <https://api.slack.com/apps?new_app=1>, choose **From an app manifest**, select the workspace, and paste `slack-manifest.yaml`.
2. In **Basic Information → App-Level Tokens**, generate an `xapp-…` token with `connections:write`.
3. Install the app to the workspace. Copy the **User OAuth Token** (`xoxp-…`) from **OAuth & Permissions**.
4. Run:

   ```bash
   cd "$HOME/Library/Application Support/Übersicht/widgets/communication-center.widget"
   ./setup_slack.sh
   ```

The setup script stores both tokens in macOS Keychain and restarts the local launchd helper. Tokens are never written to the widget or dotfiles.

The helper listens only on `127.0.0.1:41419`; mutation requests require a random mode-0600 capability from `~/Library/Caches/communication-center/api-token`, and browser-origin requests are rejected. It keeps normalized notifications in `~/Library/Caches/communication-center/slack.json`. Logs are in `~/Library/Logs/communication-center.log` and `communication-center.error.log`.

Slack does not expose its complete Activity feed as one supported endpoint. This widget intentionally tracks the useful subset above and starts collecting events after the helper connects.

## Proton setup

1. Open Proton Mail Bridge and sign in.
2. Use Bridge's client setup to add the account to Apple Mail.
3. Leave the account enabled in Mail. It appears in the widget automatically on the next refresh.

Proton Mail Desktop does not expose a supported local inbox API, so the widget does not scrape its private Electron storage.

## Troubleshooting

- **Mail unavailable:** allow Übersicht to control Mail under **System Settings → Privacy & Security → Automation**.
- **Slack setup/offline:** run `./setup_slack.sh`, then inspect the helper error log.
- **No Slack history:** expected on first connection; this widget does not bulk-fetch old messages.
- **Refresh:** use the ↻ button or Übersicht's **Refresh all widgets** menu item.
