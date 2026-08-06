import { run } from "uebersicht";

const REFRESH_MS = 10 * 60 * 1000;
const HELPER = 'python3 "weather-cities.widget/dashboard.py"';
const TABS = [
  { id: "weather", label: "weather" },
  { id: "rss", label: "rss" },
  { id: "todos", label: "to-do" },
];

export const command = `${HELPER} summary`;
export const refreshFrequency = REFRESH_MS;

export const initialState = {
  dashboard: null,
  error: null,
  activeTab: "weather",
  todoDraft: "",
  editingId: null,
  editDraft: "",
  saving: false,
  actionError: null,
};

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

export const updateState = (event, previousState = initialState) => {
  if (Object.prototype.hasOwnProperty.call(event, "output")) {
    const dashboard = parseJson(event.output);
    if (dashboard) {
      return { ...previousState, dashboard, error: null };
    }
  }
  if (event.error) {
    return { ...previousState, error: String(event.error) };
  }

  switch (event.type) {
    case "SET_TAB":
      return {
        ...previousState,
        activeTab: event.tab,
        editingId: null,
        editDraft: "",
        actionError: null,
      };
    case "TODO_DRAFT":
      return { ...previousState, todoDraft: event.value };
    case "TODO_EDIT_START":
      return {
        ...previousState,
        editingId: event.id,
        editDraft: event.value,
        actionError: null,
      };
    case "TODO_EDIT_DRAFT":
      return { ...previousState, editDraft: event.value };
    case "TODO_EDIT_CANCEL":
      return { ...previousState, editingId: null, editDraft: "" };
    case "TODO_SAVING":
      return { ...previousState, saving: true, actionError: null };
    case "TODO_SYNC":
      return {
        ...previousState,
        dashboard: { ...previousState.dashboard, todos: event.todos },
        todoDraft: event.clearDraft ? "" : previousState.todoDraft,
        editingId: null,
        editDraft: "",
        saving: false,
        actionError: null,
      };
    case "TODO_FAILED":
      return { ...previousState, saving: false, actionError: event.error };
    default:
      return previousState;
  }
};

const conditionFor = (code, isDay) => {
  if (code === 0) return { icon: isDay ? "☀" : "☾", label: "Clear" };
  if (code === 1) return { icon: isDay ? "◒" : "☾", label: "Mostly clear" };
  if (code === 2) return { icon: "◒", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "≋", label: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { icon: "☂", label: "Drizzle" };
  }
  if ([61, 63, 65, 66, 67].includes(code)) {
    return { icon: "☂", label: "Rain" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { icon: "✦", label: "Snow" };
  }
  if ([80, 81, 82].includes(code)) {
    return { icon: "☂", label: "Showers" };
  }
  if ([95, 96, 99].includes(code)) {
    return { icon: "ϟ", label: "Thunderstorms" };
  }
  return { icon: "–", label: "Unavailable" };
};

const degree = (value) => (Number.isFinite(value) ? `${value}°` : "—");
const percent = (value) => (Number.isFinite(value) ? `${value}%` : "—");

const relativeAge = (value) => {
  const published = Date.parse(value);
  if (!Number.isFinite(published)) return "recent";
  const minutes = Math.max(0, Math.floor((Date.now() - published) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
};

const encodeText = (value) => {
  const bytes = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_, hexadecimal) => String.fromCharCode(parseInt(hexadecimal, 16)),
  );
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const syncTodos = (argumentsString, dispatch, clearDraft = false) => {
  dispatch({ type: "TODO_SAVING" });
  run(`${HELPER} ${argumentsString}`)
    .then((output) => {
      const result = parseJson(output);
      if (!result || !Array.isArray(result.todos)) {
        throw new Error("The to-do helper returned an unreadable response");
      }
      dispatch({ type: "TODO_SYNC", todos: result.todos, clearDraft });
    })
    .catch((error) =>
      dispatch({ type: "TODO_FAILED", error: String(error) }),
    );
};

const addTodo = (state, dispatch) => {
  const text = state.todoDraft.trim();
  if (!text || state.saving) return;
  syncTodos(`todo-add ${encodeText(text)}`, dispatch, true);
};

const editTodo = (state, dispatch) => {
  const text = state.editDraft.trim();
  if (!text || state.saving || !/^[0-9a-f]{16}$/.test(state.editingId || "")) {
    return;
  }
  syncTodos(`todo-edit ${state.editingId} ${encodeText(text)}`, dispatch);
};

const openArticle = (article) => {
  if (/^[0-9a-f]{16}$/.test(article.id || "")) {
    run(`${HELPER} rss-open ${article.id}`);
  }
};

const TabHeader = ({ state, dispatch, status }) => (
  <header className="head">
    <nav className="tabs" role="tablist" aria-label="Dashboard sections">
      {TABS.map((tab) => (
        <button
          className={`tab ${state.activeTab === tab.id ? "active" : ""}`}
          type="button"
          role="tab"
          aria-selected={state.activeTab === tab.id}
          key={tab.id}
          onClick={() => dispatch({ type: "SET_TAB", tab: tab.id })}
        >
          {tab.label}
        </button>
      ))}
    </nav>
    {status}
  </header>
);

const WeatherStatus = ({ weather }) => (
  <span className="sub">
    <i className={`dot ${weather.online === weather.rows.length ? "ok" : "warn"}`} />
    {weather.online}/{weather.rows.length} cities · °F
  </span>
);

const WeatherPanel = ({ weather }) => (
  <div className="cities tabbody" role="tabpanel">
    {weather.rows.map((row) => {
      const condition = conditionFor(row.weatherCode, row.isDay);
      return (
        <div className={`city ${row.available ? "" : "offline"}`} key={row.name}>
          <div className="cityhead">
            <span className="cityname">{row.name}</span>
            <span className="localtime">
              {row.available ? `${row.localTime} local` : "unavailable"}
            </span>
          </div>

          {row.available ? (
            <div className="weatherline">
              <span className="conditionicon">{condition.icon}</span>
              <span className="temperature">{degree(row.temperature)}</span>
              <span className="condition">
                {condition.label}
                {row.apparent !== row.temperature && (
                  <small>feels {degree(row.apparent)}</small>
                )}
              </span>
              <span className="forecast">
                <b>H {degree(row.high)}</b>
                <span>L {degree(row.low)}</span>
                <span>rain {percent(row.rain)}</span>
              </span>
            </div>
          ) : (
            <div className="unavailable">Open-Meteo could not be reached</div>
          )}
        </div>
      );
    })}
  </div>
);

const RssStatus = ({ rss }) => (
  <span className="sub">
    <i className={`dot ${rss.available === rss.configured ? "ok" : "warn"}`} />
    {rss.available}/{rss.configured} feeds
  </span>
);

const RssPanel = ({ rss }) => (
  <div className="feed tabbody" role="tabpanel">
    {rss.items && rss.items.length ? (
      rss.items.slice(0, 5).map((article) => (
        <button
          className="article"
          type="button"
          key={article.id}
          title={`Open “${article.title}”`}
          onClick={() => openArticle(article)}
        >
          <span className="articlecopy">
            <strong>{article.title}</strong>
            <small>
              <span>{article.source}</span>
              <time>{relativeAge(article.publishedAt)}</time>
            </small>
          </span>
          <span className="openmark">↗</span>
        </button>
      ))
    ) : (
      <div className="empty">
        <strong>No articles yet</strong>
        <span>{rss.error || "The subscribed feeds returned no items."}</span>
      </div>
    )}
  </div>
);

const TodosStatus = ({ todos, saving }) => {
  const open = todos.filter((task) => !task.done).length;
  return (
    <span className="sub">
      <i className={`dot ${saving ? "busy" : "ok"}`} />
      {saving ? "saving" : `${open} open`}
    </span>
  );
};

const TodoPanel = ({ state, dispatch, todos }) => {
  const ordered = [...todos].sort(
    (left, right) => Number(left.done) - Number(right.done),
  );
  return (
    <div className="todos tabbody" role="tabpanel">
      <form
        className="addtodo"
        onSubmit={(event) => {
          event.preventDefault();
          addTodo(state, dispatch);
        }}
      >
        <input
          type="text"
          maxLength="240"
          value={state.todoDraft}
          placeholder="Add a task…"
          aria-label="New task"
          disabled={state.saving}
          onChange={(event) =>
            dispatch({ type: "TODO_DRAFT", value: event.target.value })
          }
        />
        <button
          type="submit"
          aria-label="Add task"
          disabled={state.saving || !state.todoDraft.trim()}
        >
          +
        </button>
      </form>

      {state.actionError && <div className="todoerror">Could not save this change</div>}

      <div className="todolist">
        {ordered.length ? (
          ordered.map((task) => (
            <div className={`todo ${task.done ? "done" : ""}`} key={task.id}>
              <button
                className="check"
                type="button"
                aria-label={task.done ? "Mark task incomplete" : "Mark task complete"}
                disabled={state.saving}
                onClick={() => syncTodos(`todo-toggle ${task.id}`, dispatch)}
              >
                {task.done && "✓"}
              </button>

              {state.editingId === task.id ? (
                <form
                  className="edittodo"
                  onSubmit={(event) => {
                    event.preventDefault();
                    editTodo(state, dispatch);
                  }}
                >
                  <input
                    type="text"
                    maxLength="240"
                    autoFocus
                    value={state.editDraft}
                    aria-label="Edit task"
                    disabled={state.saving}
                    onChange={(event) =>
                      dispatch({ type: "TODO_EDIT_DRAFT", value: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        dispatch({ type: "TODO_EDIT_CANCEL" });
                      }
                    }}
                  />
                  <button type="submit" aria-label="Save task" disabled={!state.editDraft.trim()}>
                    ✓
                  </button>
                </form>
              ) : (
                <button
                  className="todotext"
                  type="button"
                  title="Edit task"
                  disabled={state.saving}
                  onClick={() =>
                    dispatch({ type: "TODO_EDIT_START", id: task.id, value: task.text })
                  }
                >
                  {task.text}
                </button>
              )}

              {state.editingId !== task.id && (
                <button
                  className="delete"
                  type="button"
                  aria-label={`Delete ${task.text}`}
                  disabled={state.saving}
                  onClick={() => syncTodos(`todo-delete ${task.id}`, dispatch)}
                >
                  ×
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="empty todoempty">
            <strong>Nothing to do</strong>
            <span>Add a task above; it stays on this Mac.</span>
          </div>
        )}
      </div>
    </div>
  );
};

const statusFor = (state, dashboard) => {
  if (state.activeTab === "rss") return <RssStatus rss={dashboard.rss} />;
  if (state.activeTab === "todos") {
    return <TodosStatus todos={dashboard.todos} saving={state.saving} />;
  }
  return <WeatherStatus weather={dashboard.weather} />;
};

const footerFor = (state, dashboard) => {
  if (state.activeTab === "rss") {
    return dashboard.rss.stale
      ? "Newsboat subscriptions · cached articles"
      : "Newsboat subscriptions · updates every 10 minutes";
  }
  if (state.activeTab === "todos") {
    const count = dashboard.todos.length;
    return `${count} task${count === 1 ? "" : "s"} · saved locally`;
  }
  return "Open-Meteo · updates every 10 minutes";
};

export const render = (state, dispatch) => {
  if (!state.dashboard) {
    return (
      <section className="panel loading">
        <span className="spinner" />
        <strong>Loading dashboard</strong>
        {state.error && <small>{state.error}</small>}
      </section>
    );
  }

  const dashboard = state.dashboard;
  return (
    <section className="panel">
      <TabHeader state={state} dispatch={dispatch} status={statusFor(state, dashboard)} />

      {state.activeTab === "weather" && <WeatherPanel weather={dashboard.weather} />}
      {state.activeTab === "rss" && <RssPanel rss={dashboard.rss} />}
      {state.activeTab === "todos" && (
        <TodoPanel state={state} dispatch={dispatch} todos={dashboard.todos} />
      )}

      <footer>{footerFor(state, dashboard)}</footer>
    </section>
  );
};

export const className = `
  top: 234px;
  right: 28px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  color: #dde3e9;
  -webkit-font-smoothing: antialiased;

  * { box-sizing: border-box; }

  button, input { font: inherit; }
  button { color: inherit; }

  .panel {
    display: flex;
    flex-direction: column;
    width: 334px;
    height: 274px;
    padding: 12px 16px 10px;
    overflow: hidden;
    background: rgba(13, 15, 19, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
  }

  .head {
    display: flex;
    flex: 0 0 30px;
    align-items: flex-start;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .tabs {
    display: flex;
    align-self: stretch;
    gap: 13px;
  }

  .tab {
    position: relative;
    height: 30px;
    padding: 0;
    background: transparent;
    border: 0;
    color: #69737e;
    cursor: pointer;
    font-size: 9px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    transition: color 120ms ease;
  }
  .tab:hover { color: #b7c0c9; }
  .tab.active { color: #dce3e9; }
  .tab.active::after {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 1px;
    background: #85c5da;
    content: "";
  }

  .sub {
    margin-left: auto;
    padding-top: 2px;
    color: #7b8590;
    font-size: 8px;
    line-height: 18px;
    white-space: nowrap;
  }

  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-right: 7px;
    border-radius: 50%;
  }
  .dot.ok { background: #7fbf9e; }
  .dot.warn { background: #e2b04a; }
  .dot.busy { background: #85c5da; animation: pulse 900ms infinite alternate; }

  .tabbody {
    flex: 1 1 auto;
    min-height: 0;
  }

  .city {
    padding: 8px 0 7px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.075);
  }
  .city:last-child { border-bottom: 0; padding-bottom: 5px; }
  .city.offline { opacity: 0.58; }

  .cityhead {
    display: flex;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .cityname { color: #e8edf2; font-size: 10px; }
  .localtime {
    margin-left: auto;
    color: #6b7480;
    font-size: 8px;
    font-variant-numeric: tabular-nums;
  }

  .weatherline { display: flex; align-items: center; min-height: 29px; }
  .conditionicon {
    width: 26px;
    color: #85c5da;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 18px;
    line-height: 1;
  }
  .temperature {
    width: 49px;
    color: #f1f4f6;
    font-size: 20px;
    font-weight: 500;
    letter-spacing: -0.06em;
    font-variant-numeric: tabular-nums;
  }
  .condition {
    max-width: 91px;
    color: #aab3bd;
    font-size: 8px;
    line-height: 1.2;
  }
  .condition small {
    display: block;
    margin-top: 2px;
    color: #6b7480;
    font-size: 7px;
  }
  .forecast {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-left: auto;
    color: #6b7480;
    font-size: 7px;
    line-height: 1.2;
    text-align: right;
    white-space: nowrap;
  }
  .forecast b { color: #9ba5af; font-weight: 500; }

  .unavailable {
    padding: 5px 0 2px 26px;
    color: #e2b04a;
    font-size: 8px;
  }

  .feed {
    overflow: hidden;
  }

  .article {
    display: flex;
    width: 100%;
    min-height: 39px;
    padding: 6px 0 5px;
    background: transparent;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    cursor: pointer;
    text-align: left;
  }
  .article:last-child { border-bottom: 0; }
  .article:hover strong { color: #ffffff; }
  .article:hover .openmark { color: #85c5da; transform: translate(1px, -1px); }

  .articlecopy {
    display: block;
    min-width: 0;
    padding-right: 8px;
  }
  .article strong {
    display: block;
    overflow: hidden;
    color: #dce2e8;
    font-size: 9px;
    font-weight: 500;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 120ms ease;
  }
  .article small {
    display: flex;
    gap: 7px;
    margin-top: 3px;
    color: #69737e;
    font-size: 7px;
    line-height: 1;
  }
  .article small span {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .article time { color: #56606a; }
  .openmark {
    margin: 4px 1px 0 auto;
    color: #56606a;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 10px;
    transition: color 120ms ease, transform 120ms ease;
  }

  .todos {
    display: flex;
    flex-direction: column;
    padding-top: 8px;
  }
  .addtodo {
    display: flex;
    flex: 0 0 27px;
    gap: 6px;
    margin-bottom: 6px;
  }
  .addtodo input, .edittodo input {
    min-width: 0;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 4px;
    color: #e6ebef;
    outline: none;
  }
  .addtodo input {
    flex: 1;
    height: 27px;
    padding: 0 8px;
    font-size: 9px;
  }
  input::placeholder { color: #59636e; }
  input:focus { border-color: rgba(133, 197, 218, 0.55); }
  .addtodo button {
    width: 27px;
    padding: 0;
    background: rgba(133, 197, 218, 0.12);
    border: 1px solid rgba(133, 197, 218, 0.26);
    border-radius: 4px;
    color: #9ed5e6;
    cursor: pointer;
    font-size: 14px;
  }
  button:disabled { cursor: default; opacity: 0.42; }

  .todolist {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .todolist::-webkit-scrollbar { display: none; }
  .todo {
    display: flex;
    min-height: 30px;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.065);
  }
  .todo:last-child { border-bottom: 0; }
  .check {
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    margin-right: 8px;
    padding: 0;
    background: transparent;
    border: 1px solid #64707b;
    border-radius: 3px;
    color: #0d0f13;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 9px;
    line-height: 12px;
  }
  .todo.done .check { background: #7fbf9e; border-color: #7fbf9e; }
  .todotext {
    min-width: 0;
    flex: 1;
    padding: 6px 0;
    overflow: hidden;
    background: transparent;
    border: 0;
    color: #d8dfe5;
    cursor: text;
    font-size: 9px;
    line-height: 1.25;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo.done .todotext {
    color: #626c76;
    text-decoration: line-through;
    text-decoration-color: #59626b;
  }
  .delete {
    flex: 0 0 20px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 0;
    color: #4f5963;
    cursor: pointer;
    font-size: 13px;
  }
  .delete:hover { color: #d78383; }
  .edittodo {
    display: flex;
    min-width: 0;
    flex: 1;
    gap: 4px;
  }
  .edittodo input {
    min-width: 0;
    flex: 1;
    height: 23px;
    padding: 0 6px;
    font-size: 9px;
  }
  .edittodo button {
    width: 21px;
    padding: 0;
    background: transparent;
    border: 0;
    color: #7fbf9e;
    cursor: pointer;
  }
  .todoerror {
    flex: 0 0 auto;
    margin: -2px 0 4px;
    color: #d99a72;
    font-size: 7px;
  }

  .empty {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #68727c;
    text-align: center;
  }
  .empty strong { color: #9aa4ae; font-size: 10px; font-weight: 500; }
  .empty span { max-width: 220px; margin-top: 5px; font-size: 8px; line-height: 1.35; }
  .todoempty { min-height: 100px; }

  footer {
    flex: 0 0 18px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #59616b;
    font-size: 7px;
    letter-spacing: 0.04em;
    text-align: right;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .loading {
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #9aa4ae;
    font-size: 10px;
  }
  .loading small { max-width: 260px; color: #d99a72; font-size: 8px; text-align: center; }
  .spinner {
    width: 14px;
    height: 14px;
    border: 1px solid rgba(133, 197, 218, 0.28);
    border-top-color: #85c5da;
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { from { opacity: 0.35; } to { opacity: 1; } }
`;
