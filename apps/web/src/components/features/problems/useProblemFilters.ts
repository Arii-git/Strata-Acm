"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CATEGORY, type CategoryKey } from "@config/taxonomy";
import type { Severity } from "@/lib/api/types";
import type { ProblemFilterState } from "./ProblemFilters";
import { atLeast, type ProblemRow } from "./model";

const SEVS: Severity[] = ["critical", "high", "elevated", "watch", "healthy"];
export const NO_FILTERS: ProblemFilterState = { cats: [], minSev: "", owner: "" };

/**
 * One filter model for every problem list (board, list, cases, ranked list), kept in the URL:
 * ?cat=supply,service&minsev=high&owner=account_manager. `setParams` patches any other query key (view, empty…).
 */
export function useProblemFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const filters: ProblemFilterState = useMemo(() => {
    const cats = (sp.get("cat") ?? "").split(",").filter((c): c is CategoryKey => c in CATEGORY);
    const ms = sp.get("minsev") ?? "";
    return { cats, minSev: (SEVS as string[]).includes(ms) ? (ms as Severity) : "", owner: sp.get("owner") ?? "" };
  }, [sp]);

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [router, pathname, sp]);

  const setFilters = useCallback(
    (f: ProblemFilterState) => setParams({ cat: f.cats.join(",") || null, minsev: f.minSev || null, owner: f.owner || null }),
    [setParams],
  );

  const apply = useCallback(
    (rows: ProblemRow[]) => rows.filter((r) => (filters.cats.length === 0 || filters.cats.includes(r.category)) && atLeast(r.severity, filters.minSev) && (!filters.owner || r.owner_role === filters.owner)),
    [filters],
  );

  const active = filters.cats.length > 0 || !!filters.minSev || !!filters.owner;
  return { filters, setFilters, setParams, apply, active, sp };
}
