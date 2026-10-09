"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronRight, IconLogout, IconMoon, IconSearch, IconSettings, IconSun } from "@tabler/icons-react";
import { useApi } from "@/lib/api/client";
import type { Health } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { usePersona } from "@/lib/persona";
import { useTheme } from "@/lib/theme";
import { useViewMode } from "@/lib/viewmode";
import { activeItem } from "./nav";

/** Engine mode + LLM provider. No longer in the top bar (it lives on Settings / Sources); kept for callers. */
export function ModeChip({ health, error }: { health: Health | null; error: Error | null }) {
  if (error) return <span className="chip" title={error.message}>Engine: offline</span>;
  if (!health) return <span className="chip">Mode: …</span>;
  return (
    <span className="chip" title={`Store: ${health.store} · retrieval: ${health.retrieval} · LLM: ${health.llm_provider}`}>Mode: {health.mode}</span>
  );
}

export function SimClock({ simNow }: { simNow: string | null | undefined }) {
  const full = simNow ? fmtDate(simNow, true) : "—";
  // compact form (no year) keeps the bar readable; the full date is in the tooltip
  const short = simNow ? full.replace(/ \d{4} /, " ") : "—";
  return <span className="chip chip--mono topbar__hide-md" title={`Simulated clock used by all data logic: ${full}`}>Sim {short}</span>;
}

/** Sun/moon button: switches between light and dark (from "system" it switches to the opposite of what is shown). */
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} data-testid="theme-toggle">
      {resolved === "dark" ? <IconSun size={18} stroke={1.5} aria-hidden="true" /> : <IconMoon size={18} stroke={1.5} aria-hidden="true" />}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Avatar initials → name, role, company, detail level, Settings, Sign out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { label: roleFallback } = usePersona();
  const { mode, setMode } = useViewMode();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = `${useId()}-user`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const name = user?.name || "Guest";
  const role = user?.role_label || roleFallback;
  // logout() clears the session and navigates to / itself
  const signOut = () => { setOpen(false); void logout(); };

  return (
    <div className="user-menu" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="user-menu__btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${name}, ${role}`}
        onClick={() => setOpen((o) => !o)}
        data-testid="user-menu"
      >
        <span className="avatar" aria-hidden="true">{user ? initials(user.name) : "?"}</span>
      </button>
      <div id={panelId} className="user-menu__panel" hidden={!open}>
        <div className="user-menu__who">
          <span className="avatar avatar--lg" aria-hidden="true">{user ? initials(user.name) : "?"}</span>
          <span className="user-menu__id">
            <b>{name}</b>
            <span>{role}</span>
            {user?.company_name ? <span className="user-menu__company">{user.company_name}</span> : null}
          </span>
        </div>
        <div className="user-menu__row">
          <span id={`${panelId}-detail`}>Detail</span>
          <div className="seg seg--sm" role="group" aria-labelledby={`${panelId}-detail`}>
            <button type="button" className={`seg__btn${mode === "simple" ? " is-on" : ""}`} aria-pressed={mode === "simple"} onClick={() => setMode("simple")} title="Collapse detail panels">Simple</button>
            <button type="button" className={`seg__btn${mode === "detailed" ? " is-on" : ""}`} aria-pressed={mode === "detailed"} onClick={() => setMode("detailed")} title="Open detail panels">Detailed</button>
          </div>
        </div>
        <div className="user-menu__links">
          <Link href="/app/settings" className="user-menu__link" onClick={() => setOpen(false)}>
            <IconSettings size={16} stroke={1.5} aria-hidden="true" /> Settings
          </Link>
          {user ? (
            <button type="button" className="user-menu__link" onClick={signOut} data-testid="sign-out">
              <IconLogout size={16} stroke={1.5} aria-hidden="true" /> Sign out
            </button>
          ) : (
            <Link href="/" className="user-menu__link" onClick={() => setOpen(false)}>Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname() ?? "/app";
  const item = activeItem(pathname);
  const { data: health } = useApi<Health>("/health");
  const isDetail = item && pathname !== item.href;
  const detail = isDetail ? decodeURIComponent(pathname.slice(item.href.length + 1)) : "";

  return (
    <header className="topbar">
      <nav className="topbar__crumb" aria-label="Breadcrumb" title={item ? [item.section, item.label, detail].filter(Boolean).join(" › ") : undefined}>
        {item?.section ? (
          <>
            <span>{item.section}</span>
            <IconChevronRight size={14} stroke={1.5} aria-hidden="true" />
          </>
        ) : null}
        <b>{item?.label ?? "STRATA"}</b>
        {isDetail ? (
          <>
            <IconChevronRight size={14} stroke={1.5} aria-hidden="true" />
            <span className="mono">{detail}</span>
          </>
        ) : null}
      </nav>
      <span className="topbar__spacer" />
      <div className="topbar__tools">
        <SimClock simNow={health?.sim_now} />
        <button type="button" className="icon-btn icon-btn--wide" onClick={onOpenPalette} aria-label="Open command palette (Ctrl+K)" title="Go to page (Ctrl+K)">
          <IconSearch size={16} stroke={1.5} aria-hidden="true" />
          <span className="kbd topbar__hide-md" aria-hidden="true">Ctrl K</span>
        </button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
