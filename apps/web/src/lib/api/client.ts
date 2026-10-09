"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** All engine calls go through the Next.js rewrite /api/engine/:path* → ENGINE_URL. */
export const API_BASE = "/api/engine";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function url(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Session token written by @/lib/auth (key `strata.token`). Read here directly to avoid an import cycle. */
const TOKEN_KEY = "strata.token";
function currentToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** JSON headers plus `Authorization: Bearer <token>` when the user is signed in. Use for raw fetch/EventSource callers. */
export function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (json) h["Content-Type"] = "application/json";
  const t = currentToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path), {
      method,
      headers: authHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "Engine unreachable. Is it running on port 8000?", null);
  }
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? formatDetail((parsed as { detail: unknown }).detail)
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, detail, parsed);
  }
  return parsed as T;
}

export const apiGet = <T,>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal);
export const apiPost = <T,>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
export const apiPatch = <T,>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {});
export const apiPut = <T,>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {});
export const apiDelete = <T,>(path: string) => request<T>("DELETE", path);

/** Append query params, skipping null/undefined/"" values. qs("/risks", {persona}) → "/risks?persona=…" */
export function qs(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path;
}

export interface ApiState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/** Client-side GET. Pass null to skip. Re-fetches when `path` changes. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (path === null) { setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<T>(path, ctrl.signal)
      .then((d) => { if (mounted.current && !ctrl.signal.aborted) { setData(d); setLoading(false); } })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || !mounted.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** FastAPI returns a string for HTTPException and an array of {loc, msg} for 422 validation errors. */
function formatDetail(detail: unknown): string {
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : "";
        return field ? `${String(field)}: ${item.msg ?? "invalid"}` : (item.msg ?? "invalid");
      })
      .join("; ");
  }
  return String(detail);
}
