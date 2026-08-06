#!/opt/homebrew/bin/node
"use strict";

const { execFileSync } = require("node:child_process");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const PORT = 41419;
const CACHE_DIR = path.join(os.homedir(), "Library/Caches/communication-center");
const CACHE_FILE = path.join(CACHE_DIR, "slack.json");
const API_TOKEN_FILE = path.join(CACHE_DIR, "api-token");
const MAX_ITEMS = 60;
const KEYCHAIN_ACCOUNT = os.userInfo().username;
const APP_TOKEN_SERVICE = "communication-center.slack-app-token";
const USER_TOKEN_SERVICE = "communication-center.slack-user-token";

let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let identity = { userId: null, teamId: null, team: null };
let state = loadState();
const apiToken = loadApiToken();
const userNames = new Map();
const channelNames = new Map();

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return {
      state: "starting",
      error: null,
      connectedAt: saved.connectedAt || null,
      team: saved.team || null,
      generatedAt: new Date().toISOString(),
      items: Array.isArray(saved.items)
        ? saved.items.slice(0, MAX_ITEMS).map((item) => item.kind === "reaction" && !item.threadTs ? { ...item, replyable: false } : item)
        : [],
      threadParents: saved.threadParents && typeof saved.threadParents === "object" ? saved.threadParents : {},
    };
  } catch (_) {
    return { state: "starting", error: null, connectedAt: null, team: null, generatedAt: new Date().toISOString(), items: [], threadParents: {} };
  }
}

function loadApiToken() {
  fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  try {
    return fs.readFileSync(API_TOKEN_FILE, "utf8").trim();
  } catch (_) {
    const token = randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(API_TOKEN_FILE, `${token}\n`, { mode: 0o600, flag: "wx" });
      return token;
    } catch (error) {
      if (error.code === "EEXIST") return fs.readFileSync(API_TOKEN_FILE, "utf8").trim();
      throw error;
    }
  }
}

function validApiToken(value) {
  const received = Buffer.from(String(value || ""));
  const expected = Buffer.from(apiToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function saveState() {
  fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  state.generatedAt = new Date().toISOString();
  const temporary = `${CACHE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temporary, CACHE_FILE);
}

function setStatus(nextState, error = null) {
  state.state = nextState;
  state.error = error;
  saveState();
}

function keychainToken(service, environmentName) {
  if (process.env[environmentName]) return process.env[environmentName].trim();
  try {
    return execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-a", KEYCHAIN_ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch (_) {
    return "";
  }
}

const appToken = keychainToken(APP_TOKEN_SERVICE, "SLACK_APP_TOKEN");
const userToken = keychainToken(USER_TOKEN_SERVICE, "SLACK_USER_TOKEN");

async function slackApi(method, body = {}) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`${method}: ${result.error || response.status}`);
  return result;
}

async function openSocketUrl() {
  const response = await fetch("https://slack.com/api/apps.connections.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${appToken}` },
  });
  const result = await response.json();
  if (!result.ok || !result.url) throw new Error(`apps.connections.open: ${result.error || response.status}`);
  return result.url;
}

function cleanText(text) {
  return String(text || "")
    .replace(/<@([A-Z0-9]+)>/g, (_, id) => (id === identity.userId ? "@you" : "@user"))
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function userName(userId, fallback = "Unknown sender") {
  if (!userId) return fallback;
  if (userNames.has(userId)) return userNames.get(userId);
  try {
    const result = await slackApi("users.info", { user: userId });
    const profile = result.user.profile || {};
    const name = profile.display_name || profile.real_name || result.user.real_name || result.user.name || fallback;
    userNames.set(userId, name);
    return name;
  } catch (_) {
    return fallback;
  }
}

async function channelName(channelId, channelType) {
  if (channelNames.has(channelId)) return channelNames.get(channelId);
  if (channelType === "im") {
    channelNames.set(channelId, "Direct message");
    return "Direct message";
  }
  try {
    const result = await slackApi("conversations.info", { channel: channelId });
    let name = result.channel.name || (result.channel.is_mpim ? "Group message" : "Slack");
    if (result.channel.is_im && result.channel.user) name = await userName(result.channel.user, "Direct message");
    channelNames.set(channelId, name);
    return name;
  } catch (_) {
    return channelType === "mpim" ? "Group message" : "Slack";
  }
}

function slackUrl(channel, ts) {
  const parameters = new URLSearchParams({ team: identity.teamId || "", id: channel, message: ts });
  return `slack://channel?${parameters.toString()}`;
}

function addItem(item) {
  if (!item.id || state.items.some((existing) => existing.id === item.id)) return;
  state.items.unshift(item);
  state.items.sort((left, right) => Number(right.ts || 0) - Number(left.ts || 0));
  state.items = state.items.slice(0, MAX_ITEMS);
  saveState();
}

async function userParticipatedInThread(channel, threadTs) {
  let cursor;
  try {
    do {
      const result = await slackApi("conversations.replies", {
        channel,
        ts: threadTs,
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      if ((result.messages || []).some((message) => message.user === identity.userId)) return true;
      cursor = result.response_metadata?.next_cursor || "";
    } while (cursor);
    return false;
  } catch (_) {
    return false;
  }
}

function rememberThreadParent(channel, ts, threadTs) {
  if (!channel || !ts || !threadTs) return;
  state.threadParents[`${channel}:${ts}`] = threadTs;
  const keys = Object.keys(state.threadParents);
  for (const key of keys.slice(0, Math.max(0, keys.length - 1000))) delete state.threadParents[key];
  saveState();
}

async function resolveThreadParent(channel, ts) {
  const remembered = state.threadParents[`${channel}:${ts}`];
  if (remembered) return remembered;
  try {
    const result = await slackApi("conversations.history", {
      channel,
      oldest: ts,
      latest: ts,
      inclusive: true,
      limit: 1,
    });
    const message = (result.messages || []).find((candidate) => candidate.ts === ts);
    return message ? message.thread_ts || message.ts : null;
  } catch (_) {
    return null;
  }
}

async function processMessage(event) {
  if (!event.channel || !event.ts) return;
  if (event.thread_ts) rememberThreadParent(event.channel, event.ts, event.thread_ts);
  if (event.user === identity.userId) return;
  if (event.subtype && !["thread_broadcast", "bot_message"].includes(event.subtype)) return;

  const channelType = event.channel_type || (event.channel.startsWith("D") ? "im" : "channel");
  const text = String(event.text || "");
  const isDirect = channelType === "im" || channelType === "mpim";
  const isMention = Boolean(identity.userId && text.includes(`<@${identity.userId}>`));
  const isThread = Boolean(event.thread_ts);
  const isFollowedThread = isThread ? await userParticipatedInThread(event.channel, event.thread_ts) : false;
  if (!isDirect && !isMention && !isFollowedThread) return;

  const sender = event.bot_profile?.name || await userName(event.user, event.username || "Slack app");
  const channel = await channelName(event.channel, channelType);
  const kind = isDirect ? "dm" : isMention ? "mention" : "thread";
  addItem({
    id: `message:${event.channel}:${event.ts}`,
    kind,
    channelId: event.channel,
    channelType,
    channel,
    sender,
    text: cleanText(text) || "Message without text",
    ts: event.ts,
    threadTs: event.thread_ts || null,
    url: slackUrl(event.channel, event.ts),
    unread: true,
  });
}

async function processReaction(event) {
  if (!event.item || event.item.type !== "message" || event.user === identity.userId || event.item_user !== identity.userId) return;
  const sender = await userName(event.user, "Someone");
  const channel = await channelName(event.item.channel, "channel");
  const threadTs = await resolveThreadParent(event.item.channel, event.item.ts);
  addItem({
    id: `reaction:${event.item.channel}:${event.item.ts}:${event.user}:${event.reaction}`,
    kind: "reaction",
    channelId: event.item.channel,
    channelType: "channel",
    channel,
    sender,
    text: `${sender} reacted :${event.reaction}: to your message`,
    ts: event.event_ts || event.item.ts,
    threadTs,
    replyable: Boolean(threadTs),
    url: slackUrl(event.item.channel, event.item.ts),
    unread: true,
  });
}

function processReadMarker(event) {
  const channel = event.channel;
  const marker = Number(event.ts || 0);
  if (!channel || !marker) return;
  let changed = false;
  state.items = state.items.map((item) => {
    if (item.channelId === channel && Number(item.ts || 0) <= marker && item.unread) {
      changed = true;
      return { ...item, unread: false };
    }
    return item;
  });
  if (changed) saveState();
}

async function processEvent(event) {
  if (!event || !event.type) return;
  if (event.type === "message") await processMessage(event);
  else if (event.type === "reaction_added") await processReaction(event);
  else if (["channel_marked", "group_marked", "im_marked", "mpim_marked"].includes(event.type)) processReadMarker(event);
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return;
  setStatus("offline", reason ? String(reason) : "Slack connection closed");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((error) => scheduleReconnect(error.message));
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 60000);
}

async function connect() {
  const url = await openSocketUrl();
  socket = new WebSocket(url);
  socket.addEventListener("open", () => {
    reconnectDelay = 1000;
    state.connectedAt = new Date().toISOString();
    setStatus("connected");
  });
  socket.addEventListener("message", (message) => {
    let envelope;
    try { envelope = JSON.parse(String(message.data)); } catch (_) { return; }
    if (envelope.envelope_id && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
    }
    if (envelope.type === "events_api") {
      processEvent(envelope.payload?.event).catch((error) => {
        state.error = error.message;
        saveState();
      });
    } else if (envelope.type === "disconnect") {
      try { socket.close(); } catch (_) {}
    }
  });
  socket.addEventListener("error", () => scheduleReconnect("Slack WebSocket error"));
  socket.addEventListener("close", () => scheduleReconnect("Slack connection closed"));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 8192) request.destroy(new Error("request too large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function respond(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function replyToItem(payload) {
  const item = state.items.find((candidate) => candidate.id === payload.id);
  const text = String(payload.text || "").trim();
  if (!item) throw new Error("Slack notification is no longer available");
  if (!text) throw new Error("Reply is empty");
  if (text.length > 1200) throw new Error("Reply is longer than 1200 characters");
  const body = { channel: item.channelId, text };
  if (item.kind === "reaction") {
    if (!item.threadTs) throw new Error("Open this reaction in Slack to reply in its thread");
    body.thread_ts = item.threadTs;
  } else if (item.threadTs) body.thread_ts = item.threadTs;
  else if (item.channelType !== "im" && item.kind !== "dm") body.thread_ts = item.ts;
  const result = await slackApi("chat.postMessage", body);
  item.unread = false;
  item.repliedAt = new Date().toISOString();
  saveState();
  return { ok: true, ts: result.ts };
}

const server = http.createServer(async (request, response) => {
  if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::1") {
    respond(response, 403, { error: "loopback only" });
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    respond(response, 200, { state: state.state, team: state.team });
    return;
  }
  if (request.method !== "POST" || !["/reply", "/dismiss"].includes(request.url)) {
    respond(response, 404, { error: "not found" });
    return;
  }
  if (request.headers.origin) {
    respond(response, 403, { error: "browser origins are not allowed" });
    return;
  }
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    respond(response, 415, { error: "application/json required" });
    return;
  }
  if (!validApiToken(request.headers["x-communication-token"])) {
    respond(response, 401, { error: "invalid local API token" });
    return;
  }
  try {
    const payload = await readJson(request);
    if (request.url === "/reply") {
      respond(response, 200, await replyToItem(payload));
    } else {
      const item = state.items.find((candidate) => candidate.id === payload.id);
      if (!item) throw new Error("Slack notification is no longer available");
      item.unread = false;
      saveState();
      respond(response, 200, { ok: true });
    }
  } catch (error) {
    respond(response, 400, { error: error.message || String(error) });
  }
});

async function start() {
  server.listen(PORT, "127.0.0.1");
  if (!appToken || !userToken) {
    setStatus("setup", "Install the Slack app manifest, then run setup_slack.sh.");
    return;
  }
  if (!appToken.startsWith("xapp-") || !userToken.startsWith("xoxp-")) {
    setStatus("setup", "Keychain tokens have unexpected formats; rerun setup_slack.sh.");
    return;
  }
  try {
    const auth = await slackApi("auth.test");
    identity = { userId: auth.user_id, teamId: auth.team_id, team: auth.team };
    state.team = auth.team;
    saveState();
    await connect();
  } catch (error) {
    scheduleReconnect(error.message);
  }
}

process.on("SIGTERM", () => {
  if (socket) socket.close();
  server.close(() => process.exit(0));
});

start().catch((error) => setStatus("offline", error.message));
