import { run } from "uebersicht";

const REFRESH_MS = 5 * 60 * 1000;

export const command = 'python3 "github-prs.widget/github_prs.py" summary';
export const refreshFrequency = REFRESH_MS;

const parseSummary = (output) => {
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch (error) {
    return { error: "GitHub returned an unreadable response", prs: [] };
  }
};

const relativeAge = (value) => {
  const updated = Date.parse(value);
  if (!Number.isFinite(updated)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - updated) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
};

const openPullRequest = (pullRequest) =>
  run(
    `python3 "github-prs.widget/github_prs.py" open ${pullRequest.repo} ${pullRequest.number}`,
  );

const PullRequest = ({ pullRequest }) => {
  const classes = [
    "pull",
    pullRequest.reviewRequested ? "review" : "",
    pullRequest.authoredByViewer ? "mine" : "",
    pullRequest.isDraft ? "draft" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={classes}
      type="button"
      key={`${pullRequest.repo}-${pullRequest.number}`}
      title={`Open ${pullRequest.repo} #${pullRequest.number} in an iTerm2 browser tab`}
      onClick={() => openPullRequest(pullRequest)}
    >
      <span className="accent" />
      <span className="pullcopy">
        <span className="pullmeta">
          <b>{pullRequest.repo}</b>
          <span>#{pullRequest.number}</span>
          {pullRequest.reviewRequested && <i className="flag reviewflag">review</i>}
          {pullRequest.authoredByViewer && <i className="flag mineflag">mine</i>}
          {pullRequest.isDraft && <i className="flag draftflag">draft</i>}
          <time>{relativeAge(pullRequest.updatedAt)}</time>
        </span>
        <span className="pulltitle">{pullRequest.title}</span>
        <span className="author">@{pullRequest.author}</span>
      </span>
      <span className="openmark">↗</span>
    </button>
  );
};

export const render = ({ output }) => {
  const summary = parseSummary(output);

  if (!summary) {
    return (
      <section className="panel loading">
        <span className="spinner" />
        <strong>Loading Atomic pull requests</strong>
      </section>
    );
  }

  if (summary.error) {
    return (
      <section className="panel errorpanel">
        <header>
          <span className="title">github</span>
          <span className="status"><i className="dot warn" />offline</span>
        </header>
        <div className="errorcopy">
          <strong>Pull requests unavailable</strong>
          <span>{summary.error}</span>
          <small>Check `gh auth status` in a terminal.</small>
        </div>
      </section>
    );
  }

  const pulls = summary.prs || [];
  const reviewCount = pulls.filter((pull) => pull.reviewRequested).length;
  const mineCount = pulls.filter((pull) => pull.authoredByViewer).length;

  return (
    <section className="panel">
      <header>
        <div className="heading">
          <span className="title">github</span>
          <span className="scope">Atomic PRs</span>
        </div>
        <span className="status">
          <i className="dot ok" />
          {summary.totalOpen} open
        </span>
      </header>

      <div className="legend">
        <span className="legenditem reviewlegend">
          <i />{reviewCount} review{reviewCount === 1 ? "" : "s"}
        </span>
        <span className="legenditem minelegend">
          <i />{mineCount} mine
        </span>
        <span className="viewer">@{summary.viewer}</span>
      </div>

      <div className="pulls">
        {pulls.length ? (
          pulls.map((pullRequest) => (
            <PullRequest
              key={`${pullRequest.repo}-${pullRequest.number}`}
              pullRequest={pullRequest}
            />
          ))
        ) : (
          <div className="empty">
            <strong>All clear</strong>
            <span>No open PRs in the four watched repositories.</span>
          </div>
        )}
      </div>

      <footer>
        <span>atomic · BlockOpt · VauxhallCorsa · atomic-bench</span>
        <span>{summary.omitted ? `${summary.omitted} not shown · ` : ""}5m refresh</span>
      </footer>
    </section>
  );
};

export const className = `
  top: 28px;
  left: 28px;
  width: 334px;
  color: #dde3e9;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  -webkit-font-smoothing: antialiased;

  * { box-sizing: border-box; }
  button { font: inherit; }

  .panel {
    display: flex;
    flex-direction: column;
    width: 334px;
    height: calc(25vh - 22px);
    min-height: 0;
    overflow: hidden;
    background: rgba(13, 15, 19, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
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
  .title {
    color: #aab4bf;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .scope { color: #626c77; font-size: 8px; text-transform: uppercase; }
  .status { color: #7b8590; font-size: 9px; }
  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-right: 7px;
    border-radius: 50%;
  }
  .dot.ok { background: #7fbf9e; }
  .dot.warn { background: #e2b04a; }

  .legend {
    display: flex;
    flex: none;
    align-items: center;
    height: 31px;
    padding: 0 16px;
    color: #66717c;
    border-bottom: 1px solid rgba(255, 255, 255, 0.055);
    font-size: 8px;
  }
  .legenditem { display: flex; align-items: center; margin-right: 13px; }
  .legenditem i {
    width: 6px;
    height: 6px;
    margin-right: 6px;
    border-radius: 2px;
  }
  .reviewlegend { color: rgba(133, 197, 218, 0.84); }
  .reviewlegend i { background: #85c5da; }
  .minelegend { color: rgba(209, 131, 232, 0.84); }
  .minelegend i { background: #d183e8; }
  .viewer {
    margin-left: auto;
    overflow: hidden;
    color: #555f69;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pulls {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(133, 197, 218, 0.26) transparent;
  }
  .pulls::-webkit-scrollbar { width: 5px; }
  .pulls::-webkit-scrollbar-thumb {
    background: rgba(133, 197, 218, 0.23);
    border-radius: 3px;
  }

  .pull {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 52px;
    padding: 7px 25px 7px 16px;
    overflow: hidden;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.052);
    cursor: pointer;
  }
  .pull:hover { background: rgba(255, 255, 255, 0.045); }
  .pull:focus-visible {
    z-index: 1;
    outline: 1px solid rgba(133, 197, 218, 0.72);
    outline-offset: -2px;
  }
  .pull.review { background: rgba(133, 197, 218, 0.065); }
  .pull.review:hover { background: rgba(133, 197, 218, 0.115); }
  .pull.mine { background: rgba(209, 131, 232, 0.055); }
  .pull.mine:hover { background: rgba(209, 131, 232, 0.105); }
  .pull.review.mine {
    background: linear-gradient(90deg, rgba(133, 197, 218, 0.08), rgba(209, 131, 232, 0.06));
  }
  .pull.draft { opacity: 0.72; }

  .accent {
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 0;
    width: 2px;
    background: transparent;
    border-radius: 0 2px 2px 0;
  }
  .pull.review .accent { background: #85c5da; }
  .pull.mine .accent { background: #d183e8; }
  .pull.review.mine .accent {
    background: linear-gradient(to bottom, #85c5da 0 50%, #d183e8 50% 100%);
  }

  .pullcopy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
  .pullmeta { display: flex; align-items: baseline; min-width: 0; height: 12px; }
  .pullmeta b {
    max-width: 104px;
    overflow: hidden;
    color: #77838e;
    font-size: 8px;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pullmeta > span { margin-left: 5px; color: #59636d; font-size: 8px; }
  .pullmeta time {
    margin-left: auto;
    color: #515b65;
    font-size: 7px;
    font-variant-numeric: tabular-nums;
  }
  .flag {
    padding: 1px 4px;
    margin-left: 6px;
    border-radius: 3px;
    font-size: 6.5px;
    font-style: normal;
    letter-spacing: 0.04em;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .reviewflag { color: #9ed5e6; background: rgba(133, 197, 218, 0.12); }
  .mineflag { color: #dfa7ef; background: rgba(209, 131, 232, 0.12); }
  .draftflag { color: #7a8490; background: rgba(255, 255, 255, 0.055); }

  .pulltitle {
    margin-top: 2px;
    overflow: hidden;
    color: #d5dce2;
    font-size: 9.5px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pull.review .pulltitle { color: #a9d9e8; }
  .pull.mine .pulltitle { color: #dfaaee; }
  .pull.review.mine .pulltitle { color: #c6d3ed; }
  .author {
    margin-top: 2px;
    overflow: hidden;
    color: #58636e;
    font-size: 7.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .openmark {
    position: absolute;
    top: 20px;
    right: 11px;
    color: #4e5964;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 10px;
  }
  .pull:hover .openmark { color: #95a1ac; }

  footer {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    height: 27px;
    padding: 0 16px;
    color: #4f5963;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 6.5px;
    letter-spacing: 0.015em;
    text-transform: uppercase;
  }
  footer span:first-child {
    max-width: 230px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  footer span:last-child { flex: none; margin-left: 8px; }

  .loading {
    align-items: center;
    justify-content: center;
    height: 116px;
    gap: 8px;
    color: #6c7681;
    font-size: 9px;
  }
  .loading strong { color: #aab4bf; font-size: 10px; font-weight: 500; }
  .spinner {
    width: 17px;
    height: 17px;
    border: 2px solid rgba(133, 197, 218, 0.18);
    border-top-color: #85c5da;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .errorpanel { height: 154px; }
  .errorcopy {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    padding: 14px 16px;
    gap: 6px;
  }
  .errorcopy strong { color: #e2b04a; font-size: 10px; font-weight: 500; }
  .errorcopy span { color: #7b8590; font-size: 8px; line-height: 1.4; }
  .errorcopy small { color: #555f69; font-size: 7px; }

  .empty {
    display: flex;
    min-height: 180px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #626d78;
    font-size: 8px;
  }
  .empty strong { color: #9ecbb4; font-size: 11px; font-weight: 500; }
`;
