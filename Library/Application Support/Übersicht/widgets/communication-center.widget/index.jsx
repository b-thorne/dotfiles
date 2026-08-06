import { run } from "uebersicht";

const SUMMARY_COMMAND = 'python3 "communication-center.widget/dashboard.py" summary';
export const command = SUMMARY_COMMAND;
export const refreshFrequency = 30 * 1000;

export const initialState = {
  summary: null,
  error: null,
  tab: "slack",
  replyingId: null,
  drafts: {},
  actionId: null,
  actionError: null,
};

const parseSummary = (output) => {
  try {
    const value = JSON.parse(output);
    return value && value.slack && value.email ? value : null;
  } catch (_) {
    return null;
  }
};

export const updateState = (event, previousState = initialState) => {
  switch (event.type) {
    case "TAB":
      return { ...previousState, tab: event.tab, actionError: null };
    case "TOGGLE_REPLY":
      return { ...previousState, replyingId: previousState.replyingId === event.id ? null : event.id, actionError: null };
    case "DRAFT":
      return { ...previousState, drafts: { ...previousState.drafts, [event.id]: event.value } };
    case "ACTION_START":
      return { ...previousState, actionId: event.id, actionError: null };
    case "ACTION_DONE": {
      const drafts = { ...previousState.drafts };
      if (event.clearDraft) delete drafts[event.id];
      return { ...previousState, drafts, actionId: null, replyingId: event.clearDraft ? null : previousState.replyingId, actionError: null };
    }
    case "ACTION_FAILED":
      return { ...previousState, actionId: null, actionError: event.error };
    case "REFRESH_FAILED":
      return { ...previousState, error: event.error };
    default:
      break;
  }
  if (Object.prototype.hasOwnProperty.call(event, "output")) {
    const summary = parseSummary(event.output);
    return summary
      ? { ...previousState, summary, error: null }
      : { ...previousState, error: "The communication helper returned unreadable data." };
  }
  if (event.error) return { ...previousState, error: String(event.error) };
  return previousState;
};

const payload = (value) => {
  const utf8 = unescape(encodeURIComponent(JSON.stringify(value)));
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const refresh = (dispatch) =>
  run(SUMMARY_COMMAND)
    .then((output) => dispatch({ output }))
    .catch((error) => dispatch({ type: "REFRESH_FAILED", error: String(error) }));

const runAction = (id, command, dispatch, clearDraft = false) => {
  dispatch({ type: "ACTION_START", id });
  run(command)
    .then(() => {
      dispatch({ type: "ACTION_DONE", id, clearDraft });
      return refresh(dispatch);
    })
    .catch((error) => dispatch({ type: "ACTION_FAILED", error: String(error).replace(/^Error:\s*/, "") }));
};

const openAction = (command, dispatch) => {
  dispatch({ type: "ACTION_START", id: "open" });
  run(command)
    .then(() => dispatch({ type: "ACTION_DONE", id: "open" }))
    .catch((error) => dispatch({ type: "ACTION_FAILED", error: String(error).replace(/^Error:\s*/, "") }));
};

const relativeAge = (value) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const slackAge = (ts) => {
  const seconds = Number(ts);
  return Number.isFinite(seconds) ? relativeAge(new Date(seconds * 1000).toISOString()) : "";
};

const senderName = (sender) => {
  const match = String(sender || "Unknown sender").match(/^([^<]+)(?:<[^>]+>)?$/);
  return match ? match[1].trim().replace(/^"|"$/g, "") : String(sender || "Unknown sender");
};

const submitReply = (item, text, dispatch) => {
  const reply = String(text || "").trim();
  if (!reply) return;
  runAction(
    item.id,
    `python3 "communication-center.widget/dashboard.py" reply-slack ${payload({ id: item.id, text: reply })}`,
    dispatch,
    true,
  );
};

const SlackItem = ({ item, state, dispatch }) => {
  const replying = state.replyingId === item.id;
  const draft = state.drafts[item.id] || "";
  const busy = state.actionId === item.id;
  return (
    <article className={`item slackitem ${item.unread ? "unread" : "read"}`} key={item.id}>
      <div className="itemtop">
        <span className={`kind ${item.kind}`}>{item.kind}</span>
        <strong>{item.sender}</strong>
        <span className="where">#{item.channel}</span>
        <time>{slackAge(item.ts)}</time>
      </div>
      <button
        className="messagecopy"
        type="button"
        title="Open in Slack"
        onClick={() => openAction(`python3 "communication-center.widget/dashboard.py" open-slack ${payload({ url: item.url })}`, dispatch)}
      >{item.text}</button>
      <div className="itemactions">
        {item.replyable !== false && (
          <button type="button" onClick={() => dispatch({ type: "TOGGLE_REPLY", id: item.id })}>
            {replying ? "cancel" : "reply"}
          </button>
        )}
        {item.unread && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction(item.id, `python3 "communication-center.widget/dashboard.py" dismiss-slack ${payload({ id: item.id })}`, dispatch)}
          >dismiss</button>
        )}
        {item.repliedAt && <span className="replied">replied</span>}
      </div>
      {replying && (
        <div className="replybox">
          <textarea
            autoFocus
            rows="2"
            maxLength="1200"
            value={draft}
            placeholder="Short reply…"
            onInput={(event) => dispatch({ type: "DRAFT", id: item.id, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitReply(item, draft, dispatch);
              }
            }}
          />
          <button type="button" disabled={busy || !draft.trim()} onClick={() => submitReply(item, draft, dispatch)}>
            {busy ? "…" : "send"}
          </button>
        </div>
      )}
    </article>
  );
};

const SlackPanel = ({ slack, state, dispatch }) => {
  const unread = (slack.items || []).filter((item) => item.unread);
  if (slack.state === "setup") {
    return (
      <div className="setup">
        <span className="setupicon">S</span>
        <strong>Connect Slack</strong>
        <p>Create the private app from <code>slack-manifest.yaml</code>, then run <code>setup_slack.sh</code>.</p>
        <small>{slack.error}</small>
      </div>
    );
  }
  return (
    <div className="content">
      {slack.state !== "connected" && <div className="warning">{slack.error || "Slack is reconnecting…"}</div>}
      {unread.length ? unread.map((item) => <SlackItem key={item.id} item={item} state={state} dispatch={dispatch} />) : (
        <div className="empty"><strong>All clear</strong><span>New DMs, mentions, reactions, and followed-thread replies will appear here.</span></div>
      )}
      {(slack.items || []).some((item) => !item.unread) && (
        <details className="history">
          <summary>recently handled</summary>
          {(slack.items || []).filter((item) => !item.unread).slice(0, 12).map((item) => (
            <SlackItem key={item.id} item={item} state={state} dispatch={dispatch} />
          ))}
        </details>
      )}
    </div>
  );
};

const EmailItem = ({ item, dispatch }) => (
  <button
    className="item emailitem unread"
    type="button"
    title="Open in Mail"
    onClick={() => openAction(`python3 "communication-center.widget/dashboard.py" open-email ${payload(item)}`, dispatch)}
  >
    <span className="itemtop">
      <span className={`kind ${item.provider === "proton" ? "proton" : "mail"}`}>
        {item.provider === "proton" ? "proton" : "mail"}
      </span>
      <strong>{senderName(item.sender)}</strong>
      <time>{relativeAge(item.received)}</time>
    </span>
    <span className="subject">{item.subject}</span>
    <span className="account">{item.account}</span>
  </button>
);

const EmailPanel = ({ email, dispatch }) => {
  if (email.state === "error") {
    return <div className="setup"><span className="setupicon mailglyph">@</span><strong>Mail unavailable</strong><p>Allow Übersicht to control Mail in System Settings → Privacy &amp; Security → Automation.</p><small>{email.error}</small></div>;
  }
  const accountErrors = (email.accounts || []).filter((account) => account.error);
  return (
    <div className="content">
      {!email.protonConfigured && (
        <div className="protonsetup">
          <div><strong>Finish Proton Bridge setup</strong><span>Sign in, then add the Bridge account to Apple Mail.</span></div>
          <button type="button" onClick={() => openAction('open -a "Proton Mail Bridge"', dispatch)}>open bridge</button>
        </div>
      )}
      {accountErrors.length > 0 && (
        <div className="warning">Could not read: {accountErrors.map((account) => account.name).join(", ")}</div>
      )}
      <div className="accountstrip">
        {(email.accounts || []).map((account) => (
          <span key={account.name} title={account.error || account.name}>
            <i className={account.unread ? "hot" : ""} />{account.name}<b>{account.unread || 0}</b>
          </span>
        ))}
      </div>
      {(email.items || []).length ? email.items.map((item, index) => <EmailItem key={`${item.account}-${item.messageId || item.internalId}-${index}`} item={item} dispatch={dispatch} />) : (
        <div className="empty"><strong>{accountErrors.length ? "Mail incomplete" : "Inbox zero"}</strong><span>{accountErrors.length ? "Some accounts could not be checked." : "No unread messages in the Apple Mail accounts."}</span></div>
      )}
    </div>
  );
};

export const render = (state, dispatch) => {
  if (!state.summary) {
    return <section className="panel loading"><span className="spinner" /><strong>Loading communications</strong>{state.error && <small>{state.error}</small>}</section>;
  }
  const slackUnread = (state.summary.slack.items || []).filter((item) => item.unread).length;
  const emailUnread = state.summary.email.totalUnread || 0;
  return (
    <section className="panel">
      <header>
        <div className="heading"><span className="title">Comms</span><span className="scope">focus inbox</span></div>
        <span className={`status ${state.summary.slack.state}`}><i />{state.summary.slack.state}</span>
      </header>
      <nav className="tabs">
        <button className={state.tab === "slack" ? "active" : ""} onClick={() => dispatch({ type: "TAB", tab: "slack" })}>
          slack <b>{slackUnread}</b>
        </button>
        <button className={state.tab === "email" ? "active" : ""} onClick={() => dispatch({ type: "TAB", tab: "email" })}>
          email <b>{emailUnread}</b>
        </button>
        <button className="refresh" title="Refresh" onClick={() => refresh(dispatch)}>↻</button>
      </nav>
      {state.error && <div className="warning actionerror">Showing the last update: {state.error}</div>}
      {state.actionError && <div className="warning actionerror">{state.actionError}</div>}
      {state.tab === "slack"
        ? <SlackPanel slack={state.summary.slack} state={state} dispatch={dispatch} />
        : <EmailPanel email={state.summary.email} dispatch={dispatch} />}
      <footer><span>⌃⌥U to interact</span><span>30s refresh</span></footer>
    </section>
  );
};

export const className = `
  top: calc(25vh + 22px);
  left: 28px;
  width: 334px;
  color: #dde3e9;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  -webkit-font-smoothing: antialiased;

  * { box-sizing: border-box; }
  button, input, textarea { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: default; opacity: 0.45; }

  .panel {
    display: flex;
    flex-direction: column;
    width: 334px;
    height: calc(30vh - 26.4px);
    overflow: hidden;
    background: rgba(13, 15, 19, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(22px) saturate(1.08);
  }

  header {
    display: flex;
    flex: none;
    align-items: baseline;
    justify-content: space-between;
    height: 43px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .heading { display: flex; align-items: baseline; gap: 10px; }
  .title { color: #aab4bf; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; }
  .scope { color: #626c77; font-size: 8px; text-transform: uppercase; }
  .status { color: #737e89; font-size: 8px; text-transform: uppercase; }
  .status i { display: inline-block; width: 5px; height: 5px; margin-right: 6px; background: #e2b04a; border-radius: 50%; }
  .status.connected i { background: #7fbf9e; }
  .status.setup i { background: #d183e8; }

  .tabs { display: flex; flex: none; height: 39px; padding: 6px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .tabs button { padding: 5px 10px; color: #6f7984; background: transparent; border: 0; border-radius: 5px; font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; }
  .tabs button.active { color: #dce3e9; background: rgba(133, 197, 218, 0.13); }
  .tabs button b { min-width: 14px; padding: 1px 4px; margin-left: 5px; color: #9dcfe0; background: rgba(133, 197, 218, 0.12); border-radius: 8px; font-size: 7px; font-weight: 500; }
  .tabs .refresh { margin-left: auto; color: #66717c; font-family: -apple-system, sans-serif; font-size: 14px; }

  .content { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(133, 197, 218, 0.26) transparent; }
  .content::-webkit-scrollbar { width: 5px; }
  .content::-webkit-scrollbar-thumb { background: rgba(133, 197, 218, 0.23); border-radius: 3px; }

  .item { position: relative; display: flex; width: 100%; flex-direction: column; padding: 9px 14px 10px 16px; color: inherit; text-align: left; background: transparent; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.052); }
  .item.unread { background: rgba(133, 197, 218, 0.045); }
  .item.unread::before { position: absolute; top: 10px; bottom: 10px; left: 0; width: 2px; content: ""; background: #85c5da; border-radius: 0 2px 2px 0; }
  .item.read { opacity: 0.57; }
  .itemtop { display: flex; align-items: baseline; min-width: 0; height: 15px; gap: 7px; }
  .itemtop strong { overflow: hidden; color: #b9c2ca; font-size: 8.5px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
  .itemtop time { margin-left: auto; color: #505a65; font-size: 7px; }
  .kind { flex: none; padding: 1px 4px; color: #9ed5e6; background: rgba(133, 197, 218, 0.12); border-radius: 3px; font-size: 6px; letter-spacing: 0.05em; text-transform: uppercase; }
  .kind.dm { color: #dfa7ef; background: rgba(209, 131, 232, 0.12); }
  .kind.reaction { color: #e6c477; background: rgba(226, 176, 74, 0.12); }
  .kind.proton { color: #c5a8ff; background: rgba(132, 92, 220, 0.16); }
  .kind.mail { color: #9ecbb4; background: rgba(127, 191, 158, 0.12); }
  .where { max-width: 92px; overflow: hidden; color: #5d6873; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
  .messagecopy { display: -webkit-box; padding: 2px 0 0; overflow: hidden; color: #d5dce2; background: transparent; border: 0; font-size: 9.5px; line-height: 1.4; text-align: left; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .messagecopy:hover { color: #a9d9e8; }
  .itemactions { display: flex; height: 18px; align-items: end; gap: 10px; }
  .itemactions button { padding: 0; color: #667782; background: transparent; border: 0; font-size: 7px; text-transform: uppercase; }
  .itemactions button:hover { color: #a9d9e8; }
  .replied { margin-left: auto; color: #67947c; font-size: 7px; text-transform: uppercase; }
  .replybox { display: flex; align-items: stretch; gap: 6px; padding-top: 6px; }
  .replybox textarea { flex: 1; min-width: 0; padding: 6px 7px; resize: none; color: #dce3e9; background: rgba(255,255,255,0.055); border: 1px solid rgba(133,197,218,0.23); border-radius: 5px; outline: 0; font-size: 9px; line-height: 1.35; }
  .replybox textarea:focus { border-color: rgba(133,197,218,0.58); }
  .replybox button { width: 42px; color: #b9e1ed; background: rgba(133,197,218,0.16); border: 0; border-radius: 5px; font-size: 7px; text-transform: uppercase; }

  .emailitem:hover { background: rgba(127,191,158,0.075); }
  .emailitem .subject { overflow: hidden; margin-top: 2px; color: #d5dce2; font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
  .emailitem .account { margin-top: 3px; color: #59636e; font-size: 7px; }

  .warning { padding: 7px 12px; color: #d2a94e; background: rgba(226,176,74,0.075); border-bottom: 1px solid rgba(226,176,74,0.1); font-size: 7.5px; line-height: 1.4; }
  .actionerror { flex: none; }
  .protonsetup { display: flex; align-items: center; gap: 10px; padding: 10px 13px; color: #9686bb; background: rgba(132,92,220,0.075); border-bottom: 1px solid rgba(132,92,220,0.12); }
  .protonsetup div { display: flex; flex: 1; flex-direction: column; gap: 3px; }
  .protonsetup strong { color: #c5a8ff; font-size: 8.5px; font-weight: 500; }
  .protonsetup span { color: #786c96; font-size: 7px; line-height: 1.4; }
  .protonsetup button { flex: none; padding: 5px 7px; color: #c5a8ff; background: rgba(132,92,220,0.13); border: 1px solid rgba(132,92,220,0.18); border-radius: 4px; font-size: 6.5px; text-transform: uppercase; }
  .accountstrip { display: flex; min-height: 31px; align-items: center; gap: 9px; padding: 6px 13px; overflow-x: auto; color: #65707b; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 7px; white-space: nowrap; }
  .accountstrip span { display: flex; align-items: center; gap: 4px; }
  .accountstrip i { width: 4px; height: 4px; background: #515b65; border-radius: 50%; }
  .accountstrip i.hot { background: #85c5da; }
  .accountstrip b { color: #7f8a95; font-size: 7px; font-weight: 500; }

  .setup, .empty { display: flex; flex: 1; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; padding: 24px; gap: 7px; color: #66717c; text-align: center; }
  .setupicon { display: grid; width: 28px; height: 28px; place-items: center; margin-bottom: 3px; color: #e2c7ea; background: rgba(209,131,232,0.14); border: 1px solid rgba(209,131,232,0.2); border-radius: 7px; font-size: 13px; }
  .setupicon.mailglyph { color: #a9d9e8; background: rgba(133,197,218,0.12); border-color: rgba(133,197,218,0.18); }
  .setup strong, .empty strong { color: #b8c1c9; font-size: 10px; font-weight: 500; }
  .empty strong { color: #9ecbb4; }
  .setup p, .empty span { max-width: 285px; margin: 0; color: #65707b; font-size: 8px; line-height: 1.55; }
  .setup small { max-width: 285px; color: #535d67; font-size: 7px; line-height: 1.45; }
  code { color: #91a4af; font-family: inherit; }
  .history summary { padding: 8px 14px; color: #59636e; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; font-size: 7px; letter-spacing: 0.07em; text-transform: uppercase; }

  footer { display: flex; flex: none; align-items: center; justify-content: space-between; height: 27px; padding: 0 14px; color: #4f5963; border-top: 1px solid rgba(255,255,255,0.06); font-size: 6.5px; letter-spacing: 0.03em; text-transform: uppercase; }
  .loading { height: 150px; align-items: center; justify-content: center; gap: 8px; color: #6c7681; font-size: 9px; }
  .loading strong { color: #aab4bf; font-size: 10px; font-weight: 500; }
  .loading small { max-width: 280px; color: #e2b04a; text-align: center; }
  .spinner { width: 17px; height: 17px; border: 2px solid rgba(133,197,218,0.18); border-top-color: #85c5da; border-radius: 50%; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
