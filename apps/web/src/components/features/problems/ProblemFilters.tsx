"use client";

import { CATEGORIES, type CategoryKey } from "@config/taxonomy";
import { CategoryIcon } from "@/components/ui/CategoryChip";
import type { Severity } from "@/lib/api/types";
import { fmtNum } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { SEVERITY_ORDER, type ProblemRow } from "./model";

export interface ProblemFilterState { cats: CategoryKey[]; minSev: Severity | ""; owner: string }

const MIN_SEV_LABEL: Record<Severity, string> = {
  critical: "Critical only", high: "High or above", elevated: "Elevated or above", watch: "Watch or above", healthy: "Any",
};

/**
 * The same filter bar on every problem list: category chips (only categories present, icon + label + count),
 * minimum severity, owner role, and "Showing n of m · Clear" when anything is filtered.
 */
export function ProblemFilters({
  rows, value, onChange, shown,
}: { rows: ProblemRow[]; value: ProblemFilterState; onChange: (v: ProblemFilterState) => void; shown?: number }) {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
  const owners = [...new Set(rows.map((r) => r.owner_role))].sort((a, b) => personaLabel(a).localeCompare(personaLabel(b)));
  const toggle = (k: CategoryKey) =>
    onChange({ ...value, cats: value.cats.includes(k) ? value.cats.filter((c) => c !== k) : [...value.cats, k] });
  const active = value.cats.length > 0 || !!value.minSev || !!value.owner;
  const cats = CATEGORIES.filter((c) => (counts.get(c.key) ?? 0) > 0 || value.cats.includes(c.key));

  return (
    <div className="problem-filters" data-testid="problem-filters">
      <div className="problem-filters__cats" role="group" aria-label="Filter by category (select any number)">
        <button type="button" className="filter-chip" aria-pressed={value.cats.length === 0} onClick={() => onChange({ ...value, cats: [] })}>
          All <span className="filter-chip__count num">{rows.length}</span>
        </button>
        {cats.map((c) => {
          const n = counts.get(c.key) ?? 0;
          return (
            <button
              key={c.key}
              type="button"
              className="filter-chip"
              aria-pressed={value.cats.includes(c.key)}
              data-testid={`filter-cat-${c.key}`}
              title={c.meaning}
              onClick={() => toggle(c.key)}
            >
              <CategoryIcon category={c.key} size={16} />
              {c.label}
              <span className="filter-chip__count num" aria-label={`${n} problems`}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="problem-filters__selects">
        <label className="problem-filters__field">
          Severity
          <select className="select" value={value.minSev} onChange={(e) => onChange({ ...value, minSev: e.target.value as Severity | "" })} data-testid="filter-severity">
            <option value="">Any</option>
            {SEVERITY_ORDER.filter((s) => s !== "healthy").map((s) => <option key={s} value={s}>{MIN_SEV_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="problem-filters__field">
          Owner
          <select className="select" value={value.owner} onChange={(e) => onChange({ ...value, owner: e.target.value })} data-testid="filter-owner">
            <option value="">Any role</option>
            {owners.map((o) => <option key={o} value={o}>{personaLabel(o)}</option>)}
          </select>
        </label>
        {active ? (
          <span className="problem-filters__status">
            {shown != null ? <span>Showing {fmtNum(shown)} of {fmtNum(rows.length)}</span> : null}
            <button type="button" className="link-button" onClick={() => onChange({ cats: [], minSev: "", owner: "" })}>Clear filters</button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
