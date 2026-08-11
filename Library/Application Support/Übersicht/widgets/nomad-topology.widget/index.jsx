// nomad-topology.widget — minimal Nomad cluster panel for Übersicht (macOS)
// ─────────────────────────────────────────────────────────────────────────
// Configure these two lines, drop the folder in your Übersicht widgets dir.
// If the cluster is only reachable via VPN/bastion, tunnel it first, e.g.:
//   ssh -N -L 4646:nomad-server:4646 you@bastion
const NOMAD_ADDR = "http://nomad.service.consul:4646";
const NOMAD_TOKEN = ""; // leave empty if ACLs are off

const SHOW_NODES = ["thebeast", "megabeast"];
const MY_JOB_PREFIX = "bthorne-";

const REFRESH_MS = 15000;
const SEP = "@@NOMAD@@";

const auth = NOMAD_TOKEN ? `-H "X-Nomad-Token: ${NOMAD_TOKEN}"` : "";
const get = (path) => `curl -sm 8 ${auth} "${NOMAD_ADDR}${path}"`;
const storageStatus = "$HOME/.local/bin/nomad-storage-status";

export const command = [
  get("/v1/nodes?resources=true"),
  get("/v1/allocations?resources=true&filter=ClientStatus%20%3D%3D%20%22running%22"),
  get("/v1/jobs"),
  storageStatus,
].join(`; echo "${SEP}"; `);

export const refreshFrequency = REFRESH_MS;

// ── helpers ──────────────────────────────────────────────────────────────

const parse = (s) => {
  try { return JSON.parse(s); } catch (e) { return null; }
};

const storageFrom = (output) => parse((output || "").split(SEP)[3]);

const humanAge = (seconds) => {
  if (seconds == null) return "unknown";
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

const isGpu = (d) =>
  (d.Type || "").toLowerCase() === "gpu" ||
  (d.Name || "").toLowerCase().includes("gpu");

// Sum allocated cpu (MHz), mem (MB), gpu count from an alloc's AllocatedResources
const allocUsage = (alloc) => {
  const tasks = (alloc.AllocatedResources && alloc.AllocatedResources.Tasks) || {};
  let cpu = 0, mem = 0, gpu = 0;
  for (const t of Object.values(tasks)) {
    if (!t) continue;
    cpu += (t.Cpu && t.Cpu.CpuShares) || 0;
    mem += (t.Memory && t.Memory.MemoryMB) || 0;
    for (const d of t.Devices || []) {
      if (isGpu(d)) gpu += (d.DeviceIDs || []).length;
    }
  }
  return { cpu, mem, gpu };
};

const loadClass = (pct) => (pct >= 95 ? "crit" : pct >= 80 ? "warn" : "ok");

// ── model ────────────────────────────────────────────────────────────────

const buildModel = (output) => {
  const parts = (output || "").split(SEP);
  const nodes = parse(parts[0]);
  const allocs = parse(parts[1]) || [];
  const jobs = parse(parts[2]) || [];
  if (!Array.isArray(nodes)) return null;

  const running = allocs.filter((a) => a.ClientStatus === "running");

  const byNode = {};
  for (const a of running) {
    const u = allocUsage(a);
    const acc = byNode[a.NodeID] || { cpu: 0, mem: 0, gpu: 0, allocs: 0 };
    acc.cpu += u.cpu; acc.mem += u.mem; acc.gpu += u.gpu; acc.allocs += 1;
    byNode[a.NodeID] = acc;
  }

  const nodeRows = nodes
    .filter((n) => SHOW_NODES.includes(n.Name))
    .map((n) => {
      const res = n.NodeResources || {};
      const cpuTotal = (res.Cpu && res.Cpu.CpuShares) || 0;
      const memTotal = (res.Memory && res.Memory.MemoryMB) || 0;
      const gpuTotal = (res.Devices || [])
        .filter(isGpu)
        .reduce((s, d) => s + (d.Instances || []).length, 0);
      const used = byNode[n.ID] || { cpu: 0, mem: 0, gpu: 0, allocs: 0 };
      return {
        name: n.Name,
        ready: n.Status === "ready",
        drain: !!n.Drain,
        cpuPct: cpuTotal ? Math.min(100, Math.round((used.cpu / cpuTotal) * 100)) : 0,
        memPct: memTotal ? Math.min(100, Math.round((used.mem / memTotal) * 100)) : 0,
        gpuUsed: used.gpu,
        gpuTotal,
        allocs: used.allocs,
      };
    })
    .sort((a, b) => (b.gpuTotal - a.gpuTotal) || a.name.localeCompare(b.name));

  const jobRows = jobs
    .filter((j) => j.Status !== "dead" && j.Type !== "sysbatch")
    .filter((j) => (j.Name || j.ID || "").startsWith(MY_JOB_PREFIX))
    .map((j) => {
      let run = 0, queued = 0;
      const summary = (j.JobSummary && j.JobSummary.Summary) || {};
      for (const tg of Object.values(summary)) {
        run += tg.Running || 0;
        queued += (tg.Queued || 0) + (tg.Starting || 0);
      }
      return { name: j.Name || j.ID, type: j.Type, status: j.Status, run, queued };
    })
    .sort((a, b) => b.run - a.run);

  return {
    nodeRows,
    jobRows,
    ready: nodeRows.filter((n) => n.ready).length,
    totalNodes: nodeRows.length,
    runningAllocs: nodeRows.reduce((s, n) => s + n.allocs, 0),
  };
};

// ── view ─────────────────────────────────────────────────────────────────

const Bar = ({ label, pct }) => (
  <div className="metric">
    <span className="mlabel">{label}</span>
    <span className="track">
      <span className={`fill ${loadClass(pct)}`} style={{ width: `${pct}%` }} />
    </span>
    <span className="pct">{pct}%</span>
  </div>
);

const GpuSlots = ({ used, total }) => (
  <div className="metric">
    <span className="mlabel">gpu</span>
    <span className="slots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < used ? "slot busy" : "slot free"} />
      ))}
    </span>
    <span className="pct">{total - used} free</span>
  </div>
);

const stateClass = (state) =>
  state === "mounted" || state === "working" ? "ok" : state === "stale" ? "warn" : "crit";

const Storage = ({ status }) => {
  const nas = (status && status.nas) || { state: "unknown", path: "/Volumes/nomad" };
  const cloud = (status && status.cloudMounter) || {
    state: "unknown",
    path: "~/Library/CloudStorage/CloudMounter-nucleus",
  };
  return (
    <div className="storage">
      <div className="storagehead">storage</div>
      <div className="storageRow">
        <span className={`dot ${stateClass(nas.state)}`} />
        <span className="storageName">nas</span>
        <span className="storagePath">{nas.path}</span>
        <span className={`storageState ${stateClass(nas.state)}`}>{nas.state}</span>
      </div>
      <div className="storageRow">
        <span className={`dot ${stateClass(cloud.state)}`} />
        <span className="storageName">cloud</span>
        <span className="storagePath">{cloud.path}</span>
        <span className={`storageState ${stateClass(cloud.state)}`}>{cloud.state}</span>
      </div>
      <div className="storageMeta">
        CloudMounter {cloud.running ? "running" : "stopped"} · activity {humanAge(cloud.lastActivityAgeSeconds)}
      </div>
    </div>
  );
};

export const render = ({ output }) => {
  const storage = storageFrom(output);
  const m = buildModel(output);
  if (!m) {
    return (
      <div className="panel">
        <div className="head"><span className="title">nomad</span></div>
        <div className="offline">cluster unreachable · {NOMAD_ADDR.replace(/^https?:\/\//, "")}</div>
        <Storage status={storage} />
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="head">
        <span className="title">nomad</span>
        <span className="sub">
          <span className={m.ready === m.totalNodes ? "dot ok" : "dot warn"} />
          {m.ready}/{m.totalNodes} nodes · {m.runningAllocs} allocs
        </span>
      </div>

      {m.nodeRows.map((n) => (
        <div className={`node ${n.ready ? "" : "down"}`} key={n.name}>
          <div className="nodehead">
            <span className={`dot ${n.ready ? "ok" : "crit"}`} />
            <span className="nodename">{n.name}</span>
            <span className="allocs">{n.drain ? "draining" : `${n.allocs} alloc`}</span>
          </div>
          <Bar label="cpu" pct={n.cpuPct} />
          <Bar label="mem" pct={n.memPct} />
          {n.gpuTotal > 0 && <GpuSlots used={n.gpuUsed} total={n.gpuTotal} />}
        </div>
      ))}

      {m.jobRows.length > 0 && (
        <div className="jobs">
          <div className="jobshead">my jobs</div>
          {m.jobRows.slice(0, 8).map((j) => (
            <div className="job" key={j.name}>
              <span className={`dot ${j.status === "running" ? "ok" : "warn"}`} />
              <span className="jobname">{j.name}</span>
              <span className="jobmeta">
                {j.run > 0 && `${j.run} run`}
                {j.queued > 0 && ` · ${j.queued} queued`}
              </span>
            </div>
          ))}
          {m.jobRows.length > 8 && (
            <div className="more">+ {m.jobRows.length - 8} more</div>
          )}
        </div>
      )}

      <Storage status={storage} />
    </div>
  );
};

// ── styles ───────────────────────────────────────────────────────────────

export const className = `
  top: 28px;
  right: 28px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  color: #dde3e9;
  -webkit-font-smoothing: antialiased;

  .panel {
    width: 300px;
    max-height: 264px;
    padding: 14px 16px 12px;
    overflow-y: auto;
    scrollbar-width: none;
    background: rgba(13, 15, 19, 0.72);
    backdrop-filter: blur(18px);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
  }
  .panel::-webkit-scrollbar { display: none; }

  .head {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 10px; margin-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .title { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #8b95a1; }
  .sub { font-size: 10px; color: #8b95a1; }

  .node { margin-bottom: 12px; }
  .node.down { opacity: 0.45; }
  .nodehead { display: flex; align-items: baseline; margin-bottom: 4px; }
  .nodename { font-size: 11px; color: #e8edf2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .allocs { margin-left: auto; font-size: 9px; color: #6b7480; }

  .metric { display: flex; align-items: center; margin: 3px 0; }
  .mlabel { width: 28px; font-size: 9px; color: #6b7480; }
  .pct { width: 46px; text-align: right; font-size: 9px; color: #8b95a1; font-variant-numeric: tabular-nums; }

  .track {
    flex: 1; height: 3px; border-radius: 2px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
  }
  .fill { display: block; height: 100%; border-radius: 2px; transition: width 0.6s ease; }
  .fill.ok   { background: #85c5da; }
  .fill.warn { background: #e2b04a; }
  .fill.crit { background: #e26d5a; }

  .slots { flex: 1; display: flex; gap: 4px; }
  .slot { width: 9px; height: 9px; border-radius: 2px; }
  .slot.busy { background: #85c5da; }
  .slot.free { background: transparent; box-shadow: inset 0 0 0 1px rgba(133, 197, 218, 0.45); }

  .dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 7px; flex: none; }
  .dot.ok   { background: #7fbf9e; }
  .dot.warn { background: #e2b04a; }
  .dot.crit { background: #e26d5a; }

  .jobs { margin-top: 2px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .jobshead { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #6b7480; margin-bottom: 6px; }
  .job { display: flex; align-items: baseline; font-size: 10px; margin: 3px 0; }
  .jobname { color: #cfd6dd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .jobmeta { margin-left: auto; padding-left: 10px; font-size: 9px; color: #6b7480; white-space: nowrap; }
  .more { font-size: 9px; color: #6b7480; margin-top: 4px; }

  .storage { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .storagehead { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #6b7480; margin-bottom: 6px; }
  .storageRow { display: flex; align-items: baseline; min-width: 0; font-size: 9px; margin: 4px 0; }
  .storageName { width: 38px; flex: none; color: #cfd6dd; }
  .storagePath { min-width: 0; flex: 1; color: #6b7480; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .storageState { margin-left: 8px; flex: none; }
  .storageState.ok { color: #7fbf9e; }
  .storageState.warn { color: #e2b04a; }
  .storageState.crit { color: #e26d5a; }
  .storageMeta { margin: 5px 0 0 12px; font-size: 8px; color: #58616c; }

  .offline { font-size: 10px; color: #e2b04a; margin-bottom: 8px; }
`;
