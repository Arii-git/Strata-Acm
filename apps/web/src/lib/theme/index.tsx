"use client";

/**
 * Theme: preference light | dark | system, stored in localStorage `strata.theme`, resolved with
 * matchMedia("(prefers-color-scheme: dark)") and applied as <html data-theme="light|dark">.
 * Dark tokens live in styles/lanes/theme-dark.css. app/layout.tsx runs THEME_SCRIPT before paint,
 * so the first frame already has the right theme (no flash).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_KEY, THEME_QUERY as QUERY } from "./script";

export { THEME_KEY };

export type ThemePref = "light" | "dark" | "system";
export interface ThemeCtx { theme: ThemePref; resolved: "light" | "dark"; setTheme: (t: ThemePref) => void }

const FALLBACK: ThemeCtx = { theme: "system", resolved: "light", setTheme: () => {} };
export const ThemeContext = createContext<ThemeCtx | null>(null);

function isPref(v: unknown): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}
function readPref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return isPref(v) ? v : "system";
  } catch {
    return "system";
  }
}
function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [sysDark, setSysDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readPref());
    setSysDark(systemDark());
    setMounted(true);
    const mq = window.matchMedia?.(QUERY);
    const onChange = () => setSysDark(mq?.matches === true);
    mq?.addEventListener?.("change", onChange);
    // another tab changed the preference
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) setThemeState(isPref(e.newValue) ? e.newValue : "system"); };
    window.addEventListener("storage", onStorage);
    return () => { mq?.removeEventListener?.("change", onChange); window.removeEventListener("storage", onStorage); };
  }, []);

  const resolved: "light" | "dark" = !mounted ? "light" : theme === "system" ? (sysDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (root.dataset.theme !== resolved) root.dataset.theme = resolved;
  }, [resolved, mounted]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    // apply now (not only in the effect below) so children re-reading tokens in their effects see the new theme
    document.documentElement.dataset.theme = t === "system" ? (systemDark() ? "dark" : "light") : t;
    try { window.localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable: still applies for this visit */ }
  }, []);

  // server and first client render report "light"; the real value arrives right after mount
  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext) ?? FALLBACK;
}
