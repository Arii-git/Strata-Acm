"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronDown, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import { NAV_SETTINGS, NAV_TREE, activeGroupId, activeItem, type NavGroup, type NavItem } from "./nav";

const OPEN_KEY = "strata.nav.open";

function readOpen(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeOpen(ids: string[]) {
  try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}

function tip(item: NavItem): string {
  return `${item.label}: ${item.hint} (g ${item.key})`;
}

function NavLink({ item, active, tag }: { item: NavItem; active: boolean; tag?: string }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`snav-item${active ? " is-active" : ""}${tag ? " snav-item--flagship" : ""}`} aria-current={active ? "page" : undefined} title={tip(item)}>
      <Icon className="snav-item__icon" size={18} stroke={1.5} aria-hidden="true" />
      <span className="snav-item__label">{item.label}</span>
      {tag ? <span className="snav-tag" aria-label={`(${tag})`}>{tag}</span> : null}
    </Link>
  );
}

function SubLinks({ group, activeHref, onPick }: { group: NavGroup; activeHref?: string; onPick?: () => void }) {
  return (
    <>
      {group.items.map((i) => {
        const on = i.href === activeHref;
        return (
          <Link key={i.href} href={i.href} className={`snav-sub${on ? " is-active" : ""}`} aria-current={on ? "page" : undefined} title={tip(i)} onClick={onPick}>
            {i.label}
          </Link>
        );
      })}
    </>
  );
}

function Group({ group, open, collapsed, activeHref, onToggle }: { group: NavGroup; open: boolean; collapsed: boolean; activeHref?: string; onToggle: () => void }) {
  const Icon = group.icon;
  const panelId = `nav-panel-${group.id}`;
  const flyId = `${useId()}-fly`;
  const hasActive = group.items.some((i) => i.href === activeHref);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [fly, setFly] = useState<number | null>(null); // flyout top (px) when shown in rail mode

  const cancelClose = () => { if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const showFly = useCallback(() => {
    cancelClose();
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const est = 52 + group.items.length * 40;
    setFly(Math.max(8, Math.min(r.top, window.innerHeight - est - 8)));
  }, [group.items.length]);
  const hideFly = (delay = 140) => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setFly(null), delay);
  };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => { if (!collapsed) setFly(null); }, [collapsed]);

  if (collapsed) {
    return (
      <div
        ref={wrap}
        className={`snav-group snav-group--rail${hasActive ? " has-active" : ""}`}
        role="group"
        aria-label={group.label}
        data-testid={`nav-group-${group.id}`}
        onMouseEnter={showFly}
        onMouseLeave={() => hideFly()}
        onFocus={showFly}
        onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) hideFly(0); }}
        onKeyDown={(e) => { if (e.key === "Escape" && fly !== null) { e.stopPropagation(); setFly(null); btn.current?.focus(); } }}
      >
        <button
          ref={btn}
          type="button"
          className={`snav-item snav-group__btn${hasActive ? " is-active-parent" : ""}`}
          aria-expanded={fly !== null}
          aria-controls={flyId}
          title={`${group.label}: ${group.hint}`}
          onClick={() => (fly === null ? showFly() : setFly(null))}
        >
          <Icon className="snav-item__icon" size={18} stroke={1.5} aria-hidden="true" />
          <span className="snav-item__label">{group.label}</span>
        </button>
        <div id={flyId} className="snav-fly" hidden={fly === null} style={fly === null ? undefined : { top: fly }}>
          <div className="snav-fly__card">
            <div className="snav-fly__title" aria-hidden="true">{group.label}</div>
            <SubLinks group={group} activeHref={activeHref} onPick={() => setFly(null)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`snav-group${open ? " is-open" : ""}${hasActive ? " has-active" : ""}`} role="group" aria-label={group.label} data-testid={`nav-group-${group.id}`}>
      <button
        type="button"
        className={`snav-item snav-group__btn${hasActive && !open ? " is-active-parent" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        title={group.hint}
      >
        <Icon className="snav-item__icon" size={18} stroke={1.5} aria-hidden="true" />
        <span className="snav-item__label">{group.label}</span>
        <IconChevronDown className="snav-group__chev" size={16} stroke={1.5} aria-hidden="true" />
      </button>
      <div id={panelId} className="snav-group__panel">
        <div className="snav-group__clip">
          <div className="snav-group__inner">
            <SubLinks group={group} activeHref={activeHref} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/app";
  const active = activeItem(pathname);
  const activeGroup = activeGroupId(pathname);
  const { user } = useAuth();
  const company = user?.company_name?.trim() || "";
  // the group holding the current page starts open (same on server and client, so no flash)
  const [open, setOpen] = useState<string[]>(() => (activeGroup ? [activeGroup] : []));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readOpen();
    setOpen((o) => Array.from(new Set([...o, ...stored])));
    // enable the height transition only after the first paint, so restored groups do not animate in
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (activeGroup) setOpen((o) => (o.includes(activeGroup) ? o : [...o, activeGroup]));
  }, [activeGroup]);

  const toggle = (id: string) => {
    setOpen((o) => {
      const next = o.includes(id) ? o.filter((x) => x !== id) : [...o, id];
      writeOpen(next);
      return next;
    });
  };

  return (
    <aside className="sidebar snav" aria-label="Primary" data-ready={ready || undefined}>
      <Link href="/app" className="sidebar__brand snav-brand" aria-label={`STRATA${company ? `, ${company}` : ""}: Home`} title={company || "STRATA"}>
        <span className="brand-mark" aria-hidden="true" />
        <span className="snav-brand__text">
          <span className="sidebar__wordmark">STRATA</span>
          {company ? <span className="snav-brand__company">{company}</span> : null}
        </span>
      </Link>
      <nav className="snav__nav" aria-label="Pages">
        {NAV_TREE.map((e) =>
          e.kind === "link" ? (
            <NavLink key={e.item.href} item={e.item} tag={e.tag} active={active?.href === e.item.href} />
          ) : (
            <Group
              key={e.group.id}
              group={e.group}
              open={open.includes(e.group.id)}
              collapsed={collapsed}
              activeHref={active?.href}
              onToggle={() => toggle(e.group.id)}
            />
          ),
        )}
      </nav>
      <div className="sidebar__foot snav__foot">
        <NavLink item={NAV_SETTINGS} active={active?.href === NAV_SETTINGS.href} />
        <button type="button" className="snav-item snav__collapse" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed
            ? <IconLayoutSidebarLeftExpand className="snav-item__icon" size={18} stroke={1.5} aria-hidden="true" />
            : <IconLayoutSidebarLeftCollapse className="snav-item__icon" size={18} stroke={1.5} aria-hidden="true" />}
          <span className="snav-item__label" aria-hidden="true">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
