import DashboardClient from "../components/DashboardClient";

type TaskRow = {
  id: string;
  type: string;
  status: string;
  priority: number;
  title: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function fetchJSON<T>(base: string, path: string): Promise<T> {
  const res = await fetch(joinUrl(base, path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) ${path}`);
  return (await res.json()) as T;
}

export default async function Page() {
  const apiBase =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000";

  const [tasks, auditLogs] = await Promise.all([
    fetchJSON<TaskRow[]>(apiBase, "/api/tasks?limit=50"),
    fetchJSON<AuditLogRow[]>(apiBase, "/api/audit-logs?limit=100"),
  ]);

  return <DashboardClient initialTasks={tasks} initialAuditLogs={auditLogs} />;
}
