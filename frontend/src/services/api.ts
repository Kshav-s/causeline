/** Thin fetch wrapper. Auth is an httpOnly SameSite=Strict cookie set by the backend; no token is stored in JS. */
export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];
  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function qs(params?: Query): string {
  if (!params) return "";
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.append(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`${path}${qs(query)}`, init);
  } catch {
    throw new ApiError(0, "Cannot reach the CauseLine server. Check your connection and try again.");
  }
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    window.dispatchEvent(new CustomEvent("causeline:unauthorized"));
  }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = typeof data === "object" && data ? (data as { detail?: unknown }).detail : undefined;
    const msg = typeof detail === "string" ? detail : res.status === 429 ? "Too many requests - please wait a moment." : `Request failed (${res.status})`;
    const fe = typeof data === "object" && data && Array.isArray((data as { errors?: FieldError[] }).errors) ? (data as { errors: FieldError[] }).errors : [];
    throw new ApiError(res.status, msg, fe);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, body, query),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

export function downloadUrl(path: string, query?: Query) {
  return `${path}${qs(query)}`;
}
