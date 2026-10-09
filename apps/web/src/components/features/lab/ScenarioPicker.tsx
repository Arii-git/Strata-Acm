"use client";

import { useMemo, useState } from "react";
import { IconLayoutGrid, IconSearch, IconX } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui";
import { CATEGORY_ICON, INDUSTRY_ICON, LEVEL_LABEL, LEVEL_TONE } from "./meta";
import type { CatalogScenario, SimCatalog } from "./types";

export function ScenarioPicker({ catalog, industry, onIndustry, onPick }: {
  catalog: SimCatalog;
  industry: string;
  onIndustry: (key: string) => void;
  onPick: (s: CatalogScenario) => void;
}) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const inIndustry = useMemo(
    () => catalog.scenarios.filter((s) => industry === "all" || s.industry === industry),
    [catalog.scenarios, industry],
  );
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => inIndustry.filter((s) => (category === "all" || s.category === category)
      && (!q || `${s.title} ${s.one_liner} ${s.trigger}`.toLowerCase().includes(q))),
    [inIndustry, category, q],
  );
  const groups = useMemo(
    () => catalog.categories
      .map((c) => ({ ...c, items: shown.filter((s) => s.category === c.key) }))
      .filter((g) => g.items.length > 0),
    [catalog.categories, shown],
  );
  const countIn = (cat: string) => inIndustry.filter((s) => s.category === cat).length;
  const indLabel = (k: string) => catalog.industries.find((i) => i.key === k)?.label ?? k;
  const blurb = industry === "all" ? "Every scenario across all six business types." : catalog.industries.find((i) => i.key === industry)?.blurb;
  const animKey = `${industry}|${category}|${q}`;

  return (
    <div className="lab-pick">
      <div className="lab-pick__industries" role="group" aria-label="Type of company">
        <button type="button" className="lab-chip" aria-pressed={industry === "all"} onClick={() => onIndustry("all")}>
          <IconLayoutGrid size={18} stroke={1.5} aria-hidden="true" />
          <span>All</span>
          <span className="lab-chip__count">{catalog.scenarios.length}</span>
        </button>
        {catalog.industries.map((ind) => {
          const Icon = INDUSTRY_ICON[ind.key] ?? IconLayoutGrid;
          return (
            <button key={ind.key} type="button" className="lab-chip" aria-pressed={industry === ind.key} onClick={() => onIndustry(ind.key)}>
              <Icon size={18} stroke={1.5} aria-hidden="true" />
              <span>{ind.label}</span>
              <span className="lab-chip__count">{ind.count}</span>
            </button>
          );
        })}
      </div>
      {blurb ? <p className="caption lab-pick__blurb">{blurb}</p> : null}

      <div className="lab-pick__filters">
        <label className="lab-search">
          <IconSearch size={16} stroke={1.5} aria-hidden="true" />
          <span className="sr-only">Search scenarios</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: flood, strike, recall…" />
          {query ? (
            <button type="button" className="lab-search__clear" onClick={() => setQuery("")} aria-label="Clear search">
              <IconX size={14} stroke={1.5} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="lab-pick__cats" role="group" aria-label="Kind of issue">
          <button type="button" className="lab-tag" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All issue types</button>
          {catalog.categories.map((c) => {
            const n = countIn(c.key);
            const Icon = CATEGORY_ICON[c.key];
            return (
              <button key={c.key} type="button" className="lab-tag" aria-pressed={category === c.key} disabled={n === 0}
                onClick={() => setCategory(category === c.key ? "all" : c.key)}>
                {Icon ? <Icon size={14} stroke={1.5} aria-hidden="true" /> : null}
                {c.label}
                <span className="lab-tag__n">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{shown.length} scenario{shown.length === 1 ? "" : "s"} shown</p>

      {groups.length === 0 ? (
        <EmptyState title="No scenario matches" next="Clear the search or pick another issue type." />
      ) : (
        <div className="lab-pick__groups" key={animKey}>
          {groups.map((g, gi) => {
            const Icon = CATEGORY_ICON[g.key];
            return (
              <section key={g.key} className="lab-group" aria-labelledby={`lab-g-${g.key}`}>
                <h3 className="lab-group__title" id={`lab-g-${g.key}`}>
                  {Icon ? <Icon size={16} stroke={1.5} aria-hidden="true" /> : null}{g.label}
                  <span className="muted">· {g.items.length}</span>
                </h3>
                <ul className="lab-cards">
                  {g.items.map((s, i) => {
                    const CatIcon = CATEGORY_ICON[s.category];
                    return (
                      <li key={s.id} className="lab-card-wrap" style={{ "--i": gi * 2 + i } as React.CSSProperties}>
                        <button type="button" className="lab-card" onClick={() => onPick(s)} data-testid={`sim-card-${s.id}`}>
                          <span className="lab-card__top">
                            <span className="lab-card__icon" aria-hidden="true">{CatIcon ? <CatIcon size={18} stroke={1.5} /> : null}</span>
                            {industry === "all" ? <span className="lab-card__ind">{indLabel(s.industry)}</span> : null}
                          </span>
                          <span className="lab-card__title">{s.title}</span>
                          <span className="lab-card__line">{s.one_liner}</span>
                          <span className="lab-card__meta">
                            <span>{s.horizon_weeks} weeks</span>
                            <span className={`lab-lvl lab-lvl--${LEVEL_TONE[s.start_level]}`}>
                              Starts L{s.start_level} {LEVEL_LABEL[s.start_level]}
                            </span>
                            {s.peak_level > s.start_level ? <span className="muted">peaks L{s.peak_level}</span> : null}
                            {s.regulatory ? <span className="lab-card__qa">QA route-only</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
