"use client";

/**
 * Session state for the whole app. The root layout mounts <AuthProvider> once.
 * Token lives in localStorage `strata.token`; @/lib/api/client attaches it as `Authorization: Bearer <token>`.
 * Engine contract: docs/NIGHT_BUILD.md → "auth.py / mailer.py".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PersonaKey } from "@/lib/api/types";
import { ApiError, apiGet, apiPost } from "@/lib/api/client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: PersonaKey;
  role_label: string;
  company_id: string;
  company_name: string;
  company_industry?: string;
  /** only present for business_head */
  company_code?: string | null;
  verified: boolean;
  prefs: { theme?: "light" | "dark" | "system"; email_alerts?: boolean };
}

export interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  setSession: (token: string, user: AuthUser) => void;
}

/** Shape of every endpoint that signs a user in (login, verify, otp/verify). */
export interface SessionResponse { token: string; user: AuthUser }

const TOKEN_KEY = "strata.token";

/** True between logout() and the reload to "/". The /app gate checks it so it does not add ?next=. */
let signingOut = false;
export function isSigningOut(): boolean { return signingOut; }

const noop = async () => { throw new Error("AuthProvider missing"); };
const FALLBACK: AuthCtx = { user: null, token: null, loading: false, login: noop, logout: () => {}, refresh: async () => {}, setSession: () => {} };
export const AuthContext = createContext<AuthCtx | null>(null);

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable: session lasts for this tab only */ }
}

/** `/auth/me` returns `{user}`; tolerate a bare user too. */
function unwrapUser(r: unknown): AuthUser | null {
  if (!r || typeof r !== "object") return null;
  if ("user" in r) return ((r as { user: AuthUser | null }).user) ?? null;
  if ("email" in r) return r as AuthUser;
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current += 1;
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  /** Re-read the signed-in user. 401/403 → the token is dead, sign out locally. Network errors keep the token. */
  const load = useCallback(async (t: string | null) => {
    const gen = ++generation.current;
    if (!t) { setToken(null); setUser(null); setLoading(false); return; }
    setToken(t);
    try {
      const me = unwrapUser(await apiGet<unknown>("/auth/me"));
      if (gen !== generation.current) return;
      if (me) setUser(me);
      else clear();
    } catch (e) {
      if (gen !== generation.current) return;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clear();
      else setUser(null);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [clear]);

  useEffect(() => { void load(getToken()); }, [load]);

  // Keep tabs in sync: signing in or out in one tab updates the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === TOKEN_KEY) void load(e.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [load]);

  const setSession = useCallback((t: string, u: AuthUser) => {
    generation.current += 1;
    writeToken(t);
    setToken(t);
    setUser(u);
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiPost<SessionResponse>("/auth/login", { email: email.trim().toLowerCase(), password });
    setSession(r.token, r.user);
    return r.user;
  }, [setSession]);

  const logout = useCallback(() => {
    if (signingOut) return;
    signingOut = true;
    // Tell the engine first (token still attached), but never wait more than 1.5 s on it.
    const server = getToken()
      ? Promise.race([apiPost("/auth/logout").catch(() => { /* already invalid or engine offline */ }), new Promise((r) => window.setTimeout(r, 1500))])
      : Promise.resolve();
    void server.then(() => {
      clear();
      // Full reload: no cached data from the previous role survives a role switch.
      window.location.replace("/");
    });
  }, [clear]);

  const refresh = useCallback(async () => { await load(getToken()); }, [load]);

  const value = useMemo<AuthCtx>(
    () => ({ user, token, loading, login, logout, refresh, setSession }),
    [user, token, loading, login, logout, refresh, setSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Never throws: outside a provider it returns a signed-out context. */
export function useAuth(): AuthCtx {
  return useContext(AuthContext) ?? FALLBACK;
}
