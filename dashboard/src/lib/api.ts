export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

type Init = { method?: "POST" | "PATCH" | "DELETE"; body?: unknown };

/** Typed fetch for the OSS Inbox API (proxied at /api). Throws ApiError; a 401 sends the browser to /login. */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(path, {
    method: init.method,
    credentials: "include",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && !location.pathname.startsWith("/login")) location.replace("/login");
  // Errors are `{detail}` JSON, but a proxy or a crashed server answers with HTML or plain text: never feed that to res.json().
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new ApiError(res.status, detailOf(res, json, text));
  if (json === undefined && text) throw new ApiError(res.status, "Unexpected response from the server");
  return json as T;
}

function detailOf(res: Response, json: unknown, text: string) {
  const d = (json as { detail?: unknown } | null | undefined)?.detail ?? json;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg ?? JSON.stringify(e)).join("; ");
  if (d != null) return JSON.stringify(d);
  const plain = text.trim();
  return plain && plain.length <= 200 && !plain.startsWith("<") ? plain : res.statusText || `Request failed (HTTP ${res.status})`;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
