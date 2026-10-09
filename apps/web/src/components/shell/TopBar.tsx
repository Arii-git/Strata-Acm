"use client";

import { usePathname } from "next/navigation";
import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import { useApi } from "@/lib/api/client";
import type { Health, PersonaKey } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";
import { PERSONAS, usePersona } from "@/lib/persona";
import { useViewMode } from "@/lib/viewmode";
import { activeItem } from "./nav";

export function SyntheticBadge() {
  return <span className="chip chip--synthetic" title="All data in this prototype is synthetic. None of it is Altygen's.">SYNTHETIC DATA — NOT ALTYGEN&apos;S</span>;
}

export function ModeChip({ health, error }: { health: Health | null; error: Error | null }) {
  if (error) return <span className="chip" title={error.message}>Engine: offline</span>;
  if (!health) return <span className="chip">Mode: …</span>;
  return (
    <>
      <span className="chip" title={`Store: ${health.store} · retrieval: ${health.retrieval} · LLM: ${health.llm_provider}`}>Mode: {health.mode}</span>
      <span className="chip topbar__hide-lg">LLM: {health.llm_provider}</span>
    </>
  );
}

export function SimClock({ simNow }: { simNow: string | null | undefined }) {
  const full = simNow ? fmtDate(simNow, true) : "—";
  // compact form (no year) keeps the breadcrumb readable; the full date is in the tooltip
  const short = simNow ? full.replace(/ \d{4} /, " ") : "—";
  return <span className="chip chip--mono topbar__hide-md" title={`Simulated clock used by all data logic: ${full}`}>Sim {short}</span>;
}

export function PersonaSwitcher() {
  const { persona, setPersona } = usePersona();
  return (
    <label className="row" style={{ gap: "var(--sp-2)" }}>
      <span className="sr-only">Viewing as persona</span>
      <select className="persona-select" value={persona} onChange={(e) => setPersona(e.target.value as PersonaKey)}>
        {PERSONAS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ViewModeToggle() {
  const { mode, setMode } = useViewMode();
  return (
    <div className="seg" role="group" aria-label="Detail level">
      <button type="button" className={`seg__btn${mode === "simple" ? " is-on" : ""}`} aria-pressed={mode === "simple"} onClick={() => setMode("simple")} title="Hide reviewer pages and collapse detail panels">Simple</button>
      <button type="button" className={`seg__btn${mode === "detailed" ? " is-on" : ""}`} aria-pressed={mode === "detailed"} onClick={() => setMode("detailed")} title="Show every page and open detail panels">Detailed</button>
    </div>
  );
}

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname() ?? "/app";
  const item = activeItem(pathname);
  const { data: health, error } = useApi<Health>("/health");
  const isDetail = item && pathname !== item.href;

  return (
    <header className="topbar">
      <nav className="topbar__crumb" aria-label="Breadcrumb" title={item ? `${item.section} › ${item.label}${isDetail ? ` › ${decodeURIComponent(pathname.slice(item.href.length + 1))}` : ""}` : undefined}>
        <span>{item?.section ?? "Strata"}</span>
        <IconChevronRight size={14} stroke={1.5} aria-hidden="true" />
        <b>{item?.label ?? "Console"}</b>
        {isDetail ? (
          <>
            <IconChevronRight size={14} stroke={1.5} aria-hidden="true" />
            <span className="mono">{decodeURIComponent(pathname.slice(item.href.length + 1))}</span>
          </>
        ) : null}
      </nav>
      <span className="topbar__spacer" />
      <button type="button" className="btn btn--ghost btn--sm topbar__hide-md" onClick={onOpenPalette} aria-label="Open command palette (Ctrl+K)">
        <IconSearch size={14} stroke={1.5} aria-hidden="true" />
        <span className="kbd topbar__hide-lg">Ctrl K</span>
      </button>
      <ViewModeToggle />
      <SyntheticBadge />
      <ModeChip health={health} error={error} />
      <SimClock simNow={health?.sim_now} />
      <PersonaSwitcher />
    </header>
  );
}
