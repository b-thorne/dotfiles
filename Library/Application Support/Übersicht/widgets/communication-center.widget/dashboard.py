#!/usr/bin/env python3
"""Bridge Übersicht to Apple Mail and the local Slack helper."""

from __future__ import annotations

import base64
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

CACHE_DIR = pathlib.Path.home() / "Library/Caches/communication-center"
CACHE_PATH = CACHE_DIR / "slack.json"
API_TOKEN_PATH = CACHE_DIR / "api-token"
HELPER_URL = "http://127.0.0.1:41419"
MAX_EMAILS = 40

MAIL_JXA = r'''
const mail = Application("Mail");
const limit = 40;
const accounts = [];
const items = [];

function inboxFor(account) {
  for (const candidate of ["INBOX", "Inbox"]) {
    try {
      const box = account.mailboxes.byName(candidate);
      box.name();
      return box;
    } catch (_) {}
  }
  return null;
}

for (const account of mail.accounts()) {
  const name = String(account.name());
  const enabled = Boolean(account.enabled());
  let server = "";
  try { server = String(account.serverName() || ""); } catch (_) {}
  const summary = {name, server, enabled, unread: 0};
  if (!enabled) {
    accounts.push(summary);
    continue;
  }
  const inbox = inboxFor(account);
  if (!inbox) {
    summary.error = "Inbox not found";
    accounts.push(summary);
    continue;
  }
  let unread = [];
  try {
    unread = inbox.messages.whose({readStatus: false})();
  } catch (error) {
    summary.error = String(error);
    accounts.push(summary);
    continue;
  }
  summary.unread = unread.length;
  accounts.push(summary);
  for (const message of unread.slice(0, limit)) {
    let received = null;
    try {
      const value = message.dateReceived();
      received = value ? new Date(value).toISOString() : null;
    } catch (_) {}
    let messageId = "";
    try { messageId = String(message.messageId() || ""); } catch (_) {}
    let internalId = null;
    try { internalId = Number(message.id()); } catch (_) {}
    items.push({
      account: name,
      provider: name.toLowerCase().includes("proton") || ["127.0.0.1", "localhost", "::1"].includes(server.toLowerCase()) ? "proton" : "mail",
      messageId,
      internalId,
      subject: String(message.subject() || "(no subject)"),
      sender: String(message.sender() || "Unknown sender"),
      received,
    });
  }
}
items.sort((a, b) => String(b.received || "").localeCompare(String(a.received || "")));
JSON.stringify({accounts, items: items.slice(0, limit)});
'''

OPEN_MAIL_APPLESCRIPT = r'''
on run argv
  set requestedAccount to item 1 of argv
  set requestedMessageId to item 2 of argv
  set requestedInternalId to item 3 of argv as integer
  tell application "Mail"
    set targetAccount to account requestedAccount
    try
      set inboxBox to mailbox "INBOX" of targetAccount
    on error
      set inboxBox to mailbox "Inbox" of targetAccount
    end try
    set targetMessage to missing value
    if requestedMessageId is not "" then
      try
        set targetMessage to first message of inboxBox whose message id is requestedMessageId
      end try
    end if
    if targetMessage is missing value then
      set targetMessage to first message of inboxBox whose id is requestedInternalId
    end if
    open targetMessage
    activate
  end tell
end run
'''


def decode_payload(encoded: str) -> dict:
    padding = "=" * (-len(encoded) % 4)
    try:
        value = json.loads(base64.urlsafe_b64decode(encoded + padding))
    except (ValueError, json.JSONDecodeError) as error:
        raise RuntimeError("invalid widget payload") from error
    if not isinstance(value, dict):
        raise RuntimeError("invalid widget payload")
    return value


def mail_summary() -> dict:
    script = subprocess.run(
        ["/usr/bin/osascript", "-l", "JavaScript"],
        input=MAIL_JXA,
        capture_output=True,
        text=True,
        timeout=45,
    )
    if script.returncode:
        message = script.stderr.strip().splitlines()[-1] if script.stderr.strip() else "Mail automation failed"
        return {"state": "error", "error": message, "accounts": [], "items": []}
    try:
        result = json.loads(script.stdout)
    except json.JSONDecodeError:
        return {"state": "error", "error": "Mail returned an unreadable response", "accounts": [], "items": []}
    proton_configured = any(
        "proton" in account.get("name", "").casefold()
        or account.get("server", "").casefold() in {"127.0.0.1", "localhost", "::1"}
        for account in result.get("accounts", [])
    )
    return {
        "state": "ready",
        "accounts": result.get("accounts", []),
        "items": result.get("items", []),
        "protonConfigured": proton_configured,
        "totalUnread": sum(int(account.get("unread", 0)) for account in result.get("accounts", [])),
    }


def slack_summary() -> dict:
    try:
        raw = CACHE_PATH.read_text(encoding="utf-8")
        value = json.loads(raw)
        return value if isinstance(value, dict) else {"state": "offline", "items": []}
    except FileNotFoundError:
        return {
            "state": "setup",
            "items": [],
            "error": "Run setup_slack.sh after installing the Slack app manifest.",
        }
    except (OSError, json.JSONDecodeError) as error:
        return {"state": "offline", "items": [], "error": str(error)}


def print_summary() -> int:
    print(json.dumps({"slack": slack_summary(), "email": mail_summary()}, separators=(",", ":")))
    return 0


def open_email(encoded: str) -> int:
    payload = decode_payload(encoded)
    account = str(payload.get("account", ""))
    message_id = str(payload.get("messageId", ""))
    try:
        internal_id = int(payload.get("internalId") or 0)
    except (TypeError, ValueError):
        internal_id = 0
    if not message_id and not internal_id:
        raise RuntimeError("email no longer has a usable Mail identifier")
    subprocess.run(
        ["/usr/bin/osascript", "-e", OPEN_MAIL_APPLESCRIPT, account, message_id, str(internal_id)],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    return 0


def open_slack(encoded: str) -> int:
    payload = decode_payload(encoded)
    url = str(payload.get("url", ""))
    if not url.startswith("slack://channel?"):
        raise RuntimeError("invalid Slack link")
    subprocess.run(["/usr/bin/open", url], check=True, timeout=10)
    return 0


def helper_post(path: str, payload: dict) -> dict:
    try:
        api_token = API_TOKEN_PATH.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise RuntimeError("Slack helper API token is unavailable") from error
    request = urllib.request.Request(
        HELPER_URL + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Communication-Token": api_token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            body = json.load(error)
            message = body.get("error") or error.reason
        except (ValueError, AttributeError):
            message = error.reason
        raise RuntimeError(str(message)) from error
    except urllib.error.URLError as error:
        raise RuntimeError("Slack helper is not running") from error


def reply_slack(encoded: str) -> int:
    payload = decode_payload(encoded)
    item_id = str(payload.get("id", ""))
    text = str(payload.get("text", "")).strip()
    if not item_id or not text:
        raise RuntimeError("reply is empty")
    if len(text) > 1200:
        raise RuntimeError("reply is longer than 1200 characters")
    print(json.dumps(helper_post("/reply", {"id": item_id, "text": text})))
    return 0


def dismiss_slack(encoded: str) -> int:
    payload = decode_payload(encoded)
    item_id = str(payload.get("id", ""))
    if not item_id:
        raise RuntimeError("notification identifier is missing")
    print(json.dumps(helper_post("/dismiss", {"id": item_id})))
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "summary":
        return print_summary()
    if len(sys.argv) == 3 and sys.argv[1] == "open-email":
        return open_email(sys.argv[2])
    if len(sys.argv) == 3 and sys.argv[1] == "open-slack":
        return open_slack(sys.argv[2])
    if len(sys.argv) == 3 and sys.argv[1] == "reply-slack":
        return reply_slack(sys.argv[2])
    if len(sys.argv) == 3 and sys.argv[1] == "dismiss-slack":
        return dismiss_slack(sys.argv[2])
    print("usage: dashboard.py summary | open-email PAYLOAD | open-slack PAYLOAD | reply-slack PAYLOAD | dismiss-slack PAYLOAD", file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        message = getattr(error, "stderr", None) or str(error)
        print(f"communication-center: {str(message).strip()}", file=sys.stderr)
        raise SystemExit(1)
