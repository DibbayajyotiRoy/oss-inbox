export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

type Init = { method?: "POST" | "PATCH" | "DELETE"; body?: unknown };

/** Typed fetch for the Jev API (proxied at /api). Throws ApiError; a 401 sends the browser to /login. */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(path, {
    method: init.method,
    credentials: "include",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && !location.pathname.startsWith("/login")) location.replace("/login");
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const j = await res.json();
      const d = j?.detail ?? j;
      detail = typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => e?.msg ?? JSON.stringify(e)).join("; ") : JSON.stringify(d);
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
