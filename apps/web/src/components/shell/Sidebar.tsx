"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevronDown, IconChevronRight, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useViewMode } from "@/lib/viewmode";
import { activeItem, navForMode, type NavItem } from "./nav";

const REVIEWERS_KEY = "strata.nav.reviewers.open";

function NavLink({ item, isActive, collapsed }: { item: NavItem; isActive: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`nav-item nav-item--hinted${isActive ? " is-active" : ""}`}
      aria-current={isActive ? "page" : undefined}
      title={`${item.label}: ${item.hint} (g ${item.key})`}
    >
      <Icon size={18} stroke={1.5} aria-hidden="true" />
      <span className="nav-item__text">
        <span className="nav-item__label">{item.label}</span>
        {collapsed ? null : <span className="nav-item__hint">{item.hint}</span>}
      </span>
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/app";
  const active = activeItem(pathname);
  const { mode } = useViewMode();
  const sections = navForMode(mode);
  const [reviewersOpen, setReviewersOpen] = useState(false);

  useEffect(() => {
    try { setReviewersOpen(window.localStorage.getItem(REVIEWERS_KEY) === "1"); } catch { /* storage unavailable */ }
  }, []);

  const toggleReviewers = () => {
    setReviewersOpen((o) => {
      try { window.localStorage.setItem(REVIEWERS_KEY, o ? "0" : "1"); } catch { /* storage unavailable */ }
      return !o;
    });
  };

  return (
    <aside className="sidebar" aria-label="Primary">
      <Link href="/app" className="sidebar__brand" style={{ textDecoration: "none" }} aria-label="STRATA, Altygen Console: Home">
        <span className="brand-mark" aria-hidden="true" />
        <span className="sidebar__wordmark">STRATA</span>
        <span className="sidebar__sub">Altygen Console</span>
      </Link>
      <nav className="sidebar__nav" aria-label="Pages">
        {sections.map((section) => {
          const containsActive = section.items.some((i) => i.href === active?.href);
          const open = !section.collapsible || reviewersOpen || containsActive;
          const listId = `nav-group-${section.id}`;
          return (
            <div key={section.id} role="group" aria-label={section.label} data-testid={`nav-group-${section.id}`}>
              {section.collapsible ? (
                <button
                  type="button"
                  className="nav-section nav-section--toggle"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={toggleReviewers}
                  title={collapsed ? `${section.label} (${open ? "hide" : "show"})` : undefined}
                >
                  {open ? <IconChevronDown size={14} stroke={1.5} aria-hidden="true" /> : <IconChevronRight size={14} stroke={1.5} aria-hidden="true" />}
                  <span className="nav-section__label">{section.label}</span>
                </button>
              ) : (
                <div className="nav-section" aria-hidden={collapsed ? "true" : undefined}>{section.label}</div>
              )}
              <div id={listId} hidden={!open}>
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} isActive={active?.href === item.href} collapsed={collapsed} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="sidebar__foot">
        <button type="button" className="sidebar__toggle" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <IconLayoutSidebarLeftExpand size={18} stroke={1.5} aria-hidden="true" /> : <IconLayoutSidebarLeftCollapse size={18} stroke={1.5} aria-hidden="true" />}
          <span className="sidebar__toggle-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
