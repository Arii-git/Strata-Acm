"use client";

import { useEffect, useState } from "react";
import { IconBrandGoogle } from "@tabler/icons-react";
import { apiGet } from "@/lib/api/client";

interface SupabaseConfig { enabled: boolean; url: string | null; key: string | null }

const NEXT_KEY = "strata.google.next";

/** Supabase Auth: send the browser to Google via Supabase; /google finishes the sign-in. Hidden when not configured. */
export function GoogleButton({ next = "/app", label = "Continue with Google" }: { next?: string; label?: string }) {
  const [cfg, setCfg] = useState<SupabaseConfig | null>(null);
  useEffect(() => {
    apiGet<SupabaseConfig>("/auth/supabase/config").then(setCfg).catch(() => setCfg(null));
  }, []);
  if (!cfg?.enabled || !cfg.url) return null;
  const go = () => {
    try { sessionStorage.setItem(NEXT_KEY, next); } catch { /* ignore */ }
    const redirect = `${window.location.origin}/google`;
    window.location.href = `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
  };
  return (
    <>
      <button type="button" className="af-alt af-google" onClick={go}>
        <IconBrandGoogle size={16} stroke={1.75} aria-hidden="true" /> {label}
      </button>
      <div className="af-or" aria-hidden="true"><span>or</span></div>
    </>
  );
}

export function takeGoogleNext(): string {
  try {
    const v = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : "/app";
  } catch {
    return "/app";
  }
}
