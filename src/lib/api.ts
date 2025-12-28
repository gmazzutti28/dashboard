export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(joinUrl(API_URL, path), { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<TResponse = unknown>(
  path: string,
  body: Record<string, JsonValue>
): Promise<TResponse> {
  const res = await fetch(joinUrl(API_URL, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed: ${res.status} ${txt}`);
  }

  return res.json() as Promise<TResponse>;
}
