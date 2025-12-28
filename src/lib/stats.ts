// dashboard/src/lib/stats.ts
import { apiGet } from "./api";

type Task = { status?: string };
type AuditLog = { id?: string };

export async function getStats() {
  const [tasks, logs] = await Promise.all([
    apiGet<Task[]>("/api/tasks"),
    apiGet<AuditLog[]>("/api/audit-logs"),
  ]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => (t.status || "").toLowerCase() === "done").length;
  const openTasks = totalTasks - doneTasks;

  return { totalTasks, openTasks, doneTasks, totalLogs: logs.length };
}
