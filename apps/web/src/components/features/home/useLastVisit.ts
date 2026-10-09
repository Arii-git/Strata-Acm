"use client";

import { useEffect, useState } from "react";

const KEY = "strata.home.lastVisit";
/** Deferred stamp: React dev (strict mode) unmounts and remounts at once; the remount cancels the stamp. */
let pendingStamp: number | null = null;

/**
 * The wall-clock time of the user's previous visit to Home (localStorage), read once on mount.
 * The stamp is updated when the user leaves Home (navigating away, closing or reloading the tab).
 * Returns `undefined` until read, then the ISO string or `null` (first visit: the engine defaults to 24 h).
 */
export function useLastVisit(): string | null | undefined {
  const [since, setSince] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (pendingStamp !== null) { window.clearTimeout(pendingStamp); pendingStamp = null; }
    let prev: string | null = null;
    try {
      const v = window.localStorage.getItem(KEY);
      if (v && !Number.isNaN(Date.parse(v))) prev = v;
    } catch { /* storage unavailable */ }
    setSince(prev);
    const stamp = () => {
      try { window.localStorage.setItem(KEY, new Date().toISOString()); } catch { /* storage unavailable */ }
    };
    window.addEventListener("pagehide", stamp);
    return () => {
      window.removeEventListener("pagehide", stamp);
      pendingStamp = window.setTimeout(() => { pendingStamp = null; stamp(); }, 0);
    };
  }, []);
  return since;
}
