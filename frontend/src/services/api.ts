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

/** Multipart POST with real upload progress (fetch cannot report upload progress). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((100 * e.loaded) / e.total)); };
    xhr.onerror = () => reject(new ApiError(0, "Cannot reach the CauseLine server. Your complaint was not sent - please try again."));
    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      const d = data as { detail?: unknown; errors?: FieldError[] } | null;
      const msg = typeof d?.detail === "string" ? d.detail : xhr.status === 429 ? "Too many submissions from this network - please wait and try again." : `Submission failed (${xhr.status})`;
      reject(new ApiError(xhr.status, msg, Array.isArray(d?.errors) ? d!.errors : []));
    };
    xhr.send(form);
  });
}

/** Requests authorised by a complaint's private access key (sent as a header, never in the URL). */
export const keyApi = {
  get: <T>(path: string, key: string) => keyRequest<T>("GET", path, key),
  post: <T>(path: string, key: string) => keyRequest<T>("POST", path, key),
  blobUrl: async (path: string, key: string) => {
    const r = await fetch(path, { headers: { "X-Access-Key": key } });
    if (!r.ok) throw new ApiError(r.status, "Image unavailable");
    return URL.createObjectURL(await r.blob());
  },
};

async function keyRequest<T>(method: string, path: string, key: string): Promise<T> {
  const r = await fetch(path, { method, headers: { "X-Access-Key": key } }).catch(() => { throw new ApiError(0, "Cannot reach the CauseLine server."); });
  const data = (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  if (!r.ok) throw new ApiError(r.status, typeof data?.detail === "string" ? data.detail : `Request failed (${r.status})`);
  return data as T;
}
