"use client";

import { usePathname } from "next/navigation";
import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import { useApi } from "@/lib/api/client";
import type { Health, PersonaKey } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";
import { PERSONAS, usePersona } from "@/lib/persona";
import { activeItem } from "./nav";

export function SyntheticBadge() {
  return <span className="chip chip--synthetic" title="All data in this prototype is synthetic. None of it is Altygen's.">SYNTHETIC DATA — NOT ALTYGEN&apos;S</span>;
}

export function ModeChip({ health, error }: { health: Health | null; error: Error | null }) {
  if (error) return <span className="chip" title={error.message}>Engine: offline</span>;
  if (!health) return <span className="chip">Mode: …</span>;
  return (
    <>
      <span className="chip" title={`Store: ${health.store} · retrieval: ${health.retrieval}`}>Mode: {health.mode}</span>
      <span className="chip topbar__hide-md">LLM: {health.llm_provider}</span>
    </>
  );
}

export function SimClock({ simNow }: { simNow: string | null | undefined }) {
  return <span className="chip chip--mono topbar__hide-md" title="Simulated clock used by all data logic">Sim: {simNow ? fmtDate(simNow, true) : "—"}</span>;
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

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname() ?? "/app";
  const item = activeItem(pathname);
  const { data: health, error } = useApi<Health>("/health");
  const isDetail = item && pathname !== item.href;

  return (
    <header className="topbar">
      <nav className="topbar__crumb" aria-label="Breadcrumb">
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
        <span className="kbd">Ctrl K</span>
      </button>
      <SyntheticBadge />
      <ModeChip health={health} error={error} />
      <SimClock simNow={health?.sim_now} />
      <PersonaSwitcher />
    </header>
  );
}
