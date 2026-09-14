const API_BASE = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE ?? "";

const TOKEN_KEY = "akara_auth_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(body || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

export function parseError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Network unreachable. Check connection.";
    try {
      const j = JSON.parse(e.body);
      if (typeof j.detail === "string") return j.detail;
      if (Array.isArray(j.detail)) return j.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ");
    } catch { /* plain text */ }
    return e.body || `Request failed (${e.status})`;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Network unreachable. Check connection.");
  }
  if (res.status === 401) {
    // Auth endpoints (login/signup/google) 401 = wrong credentials, NOT an
    // expired session: surface the server's message and never wipe the token
    // or bounce to /login (that loop produced the phantom "Session expired"
    // on the login form itself).
    if (path.startsWith("/api/auth/")) {
      throw new ApiError(res.status, await res.text());
    }
    setToken(null);
    if (window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<T>(path, { method: "PUT", body: form });
}
