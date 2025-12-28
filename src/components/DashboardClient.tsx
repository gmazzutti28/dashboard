// dashboard/src/app/DashboardClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, API_URL } from "../lib/api";

type TaskRow = {
  id: string;
  type: string;
  status: string;
  priority: number;
  title: string;
  payload: any;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  actor: string;
  action: string;
  detail: any;
  created_at: string;
};

type AgentsResponse = {
  ok: boolean;
  agents: string[];
};

export default function DashboardClient({
  initialTasks,
  initialAuditLogs,
}: {
  initialTasks: TaskRow[];
  initialAuditLogs: AuditLogRow[];
}) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [audit, setAudit] = useState<AuditLogRow[]>(initialAuditLogs);

  const [agentsList, setAgentsList] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- fetch agents list (real registry) ----
  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet<AgentsResponse>("/api/agents");
        if (res?.ok && Array.isArray(res.agents)) setAgentsList(res.agents);
      } catch {
        // keep silent — UI will fallback to static view
      }
    })();
  }, []);

  const kpis = useMemo(() => {
    const openTasks = tasks.filter((t) => (t.status || "").toLowerCase() === "open").length;
    const doneTasks = tasks.filter((t) => (t.status || "").toLowerCase() === "done").length;
    const high = tasks.filter((t) => t.priority === 1).length;

    const overdue = tasks.filter((t) => t.type === "invoice_overdue").length;
    const dueSoon = tasks.filter((t) => t.type === "invoice_due_soon").length;

    return [
      { label: "Open tasks", value: String(openTasks), sub: `${high} high priority • ${doneTasks} done`, chip: "Live", trend: "↔" },
      { label: "Collections tasks", value: String(overdue + dueSoon), sub: `${overdue} overdue • ${dueSoon} due soon`, chip: "Agent", trend: "↔" },
      { label: "Audit logs", value: String(audit.length), sub: "Last 100 events", chip: "Explainable", trend: "↔" },
      { label: "API", value: "OK", sub: API_URL, chip: "Connected", trend: "✅" },
    ];
  }, [tasks, audit]);

  const uiTasks = useMemo(() => {
    return tasks.map((t) => {
      const amount = t.payload?.amount_cents ? `$${(t.payload.amount_cents / 100).toFixed(2)}` : "";
      const due = t.payload?.due_date ? `due ${String(t.payload.due_date).slice(0, 10)}` : "";
      const channel = t.payload?.suggested_channel ? `via ${t.payload.suggested_channel}` : "";
      const meta = [amount, due, channel].filter(Boolean).join(" • ") || `${t.type} • ${t.status}`;

      return { id: t.id, title: t.title, meta, tag: t.priority === 1 ? "High" : "Medium" };
    });
  }, [tasks]);

  // Build agent cards from /api/agents + audit logs
  const agents = useMemo(() => {
    const fallback = ["collections", "comms", "deadlines", "documents", "orchestrator"];
    const list = agentsList.length ? agentsList : fallback;

    // helper: try to infer last run time by actor contains agent name
    const lastFor = (name: string) => {
      const n = name.toLowerCase();
      const found = audit.find((l) => (l.actor || "").toLowerCase().includes(n));
      return found?.created_at || null;
    };

    const prettyName = (name: string) =>
      name
        .split("_")
        .join(" ")
        .split("-")
        .join(" ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

    const toneFor = (name: string) => {
      if (runningAgent === name) return "running" as const;
      return "ok" as const;
    };

    return list.map((name) => {
      const last = lastFor(name);
      return {
        key: name,
        name: prettyName(name) + (name === "orchestrator" ? " (Run all)" : ""),
        status: runningAgent === name ? "Running" : "Ready",
        detail: last ? `Last: ${new Date(last).toLocaleString()}` : "No runs yet",
        tone: toneFor(name),
        raw: name,
      };
    });
  }, [agentsList, audit, runningAgent]);

  async function refresh() {
    const [t, a] = await Promise.all([
      apiGet<TaskRow[]>("/api/tasks?limit=50"),
      apiGet<AuditLogRow[]>("/api/audit-logs?limit=100"),
    ]);
    setTasks(t);
    setAudit(a);
  }

  async function runAgent(agent: string) {
    setError(null);
    setRunning(true);
    setRunningAgent(agent);
    try {
      await apiPost("/api/agents/run", { agent });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setRunning(false);
      setRunningAgent(null);
    }
  }

  async function runCollectionsNow() {
    return runAgent("collections");
  }

  async function runAllAgents() {
    // expects api registry to include orchestrator
    return runAgent("orchestrator");
  }

  const Badge = ({ children, variant }: { children: any; variant: "high" | "med" }) => (
    <span
      className={
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold " +
        (variant === "high"
          ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow shadow-fuchsia-600/20"
          : "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow shadow-sky-500/20")
      }
    >
      {children}
    </span>
  );

  const AgentPill = ({
    tone,
    children,
  }: {
    tone: "running" | "ok" | "idle";
    children: any;
  }) => {
    const base = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1";
    if (tone === "running")
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-200`}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {children}
        </span>
      );
    if (tone === "ok")
      return (
        <span className={`${base} bg-emerald-50/70 text-emerald-700 ring-emerald-200/70`}>
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {children}
        </span>
      );
    return (
      <span className={`${base} bg-zinc-50/70 text-zinc-700 ring-zinc-200/70`}>
        <span className="h-2 w-2 rounded-full bg-zinc-400" />
        {children}
      </span>
    );
  };

  const Tab = ({ active, children }: { active?: boolean; children: any }) => (
    <button
      className={
        "rounded-2xl px-3 py-1.5 text-sm font-semibold ring-1 transition " +
        (active
          ? "bg-white/15 text-white ring-white/20"
          : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10 hover:text-white")
      }
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(168,85,247,0.28),transparent),radial-gradient(900px_500px_at_90%_10%,rgba(14,165,233,0.25),transparent),radial-gradient(900px_500px_at_50%_120%,rgba(34,197,94,0.18),transparent)] bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Top bar */}
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Live demo mode • API connected
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              AI Backoffice
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75 md:text-base">
              Collections, follow-ups, and audit trails — automated by agents.
            </p>

            {error ? (
              <div className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-500/20">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-3 md:max-w-md">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 ring-1 ring-white/15 focus-within:ring-white/30">
                  <span className="text-white/60">⌘</span>
                  <input
                    placeholder="Search customers, invoices, tasks…"
                    className="w-full bg-transparent text-sm text-white placeholder:text-white/45 outline-none"
                  />
                </div>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-sky-500 ring-1 ring-white/15" />
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                Export
              </button>
              <button className="rounded-2xl bg-gradient-to-r from-fuchsia-600 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-600/20 hover:opacity-95">
                Create invoice
              </button>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="group relative overflow-hidden rounded-3xl bg-white/10 p-5 ring-1 ring-white/15 transition hover:bg-white/12 hover:ring-white/25"
            >
              <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-fuchsia-500/35 to-sky-400/25 blur-2xl transition group-hover:opacity-90" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/75">{k.label}</div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/15">
                    {k.chip}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-4xl font-semibold text-white">{k.value}</div>
                  <div className="rounded-xl bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                    {k.trend}
                  </div>
                </div>

                <div className="mt-2 text-sm text-white/75">{k.sub}</div>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-400/80 to-sky-400/80" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Tasks */}
          <div className="lg:col-span-2 rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Priority Tasks</h2>
                <p className="mt-1 text-sm text-white/75">
                  Real tasks from Postgres (via your API).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Tab active>All</Tab>
                <Tab>High</Tab>
                <Tab>Due soon</Tab>
                <button
                  onClick={refresh}
                  className="ml-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5 divide-y divide-white/10">
              {uiTasks.length === 0 ? (
                <div className="py-8 text-white/75">
                  No tasks yet. Click <span className="font-semibold">Run agents</span> (or run seed).
                </div>
              ) : (
                uiTasks.map((t) => (
                  <div key={t.id} className="group flex items-start justify-between gap-4 py-5">
                    <div>
                      <div className="font-semibold text-white">{t.title}</div>
                      <div className="mt-1 text-sm text-white/75">{t.meta}</div>

                      <div className="mt-3 hidden gap-2 group-hover:flex">
                        <button className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                          Open
                        </button>
                        <button className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                          Snooze
                        </button>
                        <button className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                          Mark done
                        </button>
                      </div>
                    </div>

                    {t.tag === "High" ? <Badge variant="high">High</Badge> : <Badge variant="med">Medium</Badge>}
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={runCollectionsNow}
                disabled={running}
                className={
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-lg " +
                  (running
                    ? "bg-white/10 ring-1 ring-white/15 opacity-70"
                    : "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-emerald-500/20 hover:opacity-95")
                }
              >
                {runningAgent === "collections" ? "Running Collections..." : "Run collections"}
              </button>

              <button
                onClick={runAllAgents}
                disabled={running}
                className={
                  "rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-lg " +
                  (running
                    ? "bg-white/10 ring-1 ring-white/15 opacity-70"
                    : "bg-gradient-to-r from-fuchsia-600 to-sky-500 shadow-fuchsia-600/20 hover:opacity-95")
                }
              >
                {runningAgent === "orchestrator" ? "Running All..." : "Run all agents"}
              </button>

              <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                Create task
              </button>
              <button className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                Settings
              </button>
            </div>
          </div>

          {/* Agents */}
          <div className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Agents</h2>
                <p className="mt-1 text-sm text-white/75">Real registry from API + last audit log</p>
              </div>
              <button
                onClick={runAllAgents}
                disabled={running}
                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
              >
                Run all (orchestrator)
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {agents.map((a) => (
                <div
                  key={a.key}
                  className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 transition hover:bg-white/7"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-white">{a.name}</div>
                    <AgentPill tone={a.tone}>{a.status}</AgentPill>
                  </div>
                  <div className="mt-2 text-sm text-white/75">{a.detail}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => runAgent(a.raw)}
                      disabled={running}
                      className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
                    >
                      Run {a.raw}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-gradient-to-r from-fuchsia-600/15 to-sky-500/15 p-4 ring-1 ring-white/10">
              <div className="text-sm font-semibold text-white">Sales demo tip</div>
              <div className="mt-1 text-sm text-white/75">
                Click “Run all agents” (orchestrator), then show tasks + audit logs updating instantly.
              </div>
            </div>
          </div>
        </div>

        {/* Audit preview */}
        <div className="mt-6 rounded-3xl bg-white/10 p-6 ring-1 ring-white/15">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Latest Audit Logs</h2>
              <p className="mt-1 text-sm text-white/75">“Por que o agente fez isso”</p>
            </div>
            <button
              onClick={refresh}
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 divide-y divide-white/10">
            {audit.length === 0 ? (
              <div className="py-6 text-white/75">No audit logs yet.</div>
            ) : (
              audit.slice(0, 10).map((l) => (
                <div key={l.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/10">
                      {l.actor}
                    </span>
                    <div className="text-sm font-semibold text-white">{l.action}</div>
                    <div className="text-xs text-white/60">
                      {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                  <pre className="mt-3 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-white/80 ring-1 ring-white/10">
                    {JSON.stringify(l.detail, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 flex flex-col gap-2 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} AI Backoffice</div>
          <div className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Connected (local demo)
          </div>
        </div>
      </div>
    </div>
  );
}
