"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { NAV, activeItem } from "./nav";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/app";
  const active = activeItem(pathname);

  return (
    <aside className="sidebar" aria-label="Primary">
      <Link href="/app" className="sidebar__brand" style={{ textDecoration: "none" }} aria-label="STRATA, Altygen Console: Briefing">
        <span className="brand-mark" aria-hidden="true" />
        <span className="sidebar__wordmark">STRATA</span>
        <span className="sidebar__sub">Altygen Console</span>
      </Link>
      <nav className="sidebar__nav">
        {NAV.map((section) => (
          <div key={section.label} role="group" aria-label={section.label}>
            <div className="nav-section" aria-hidden={collapsed ? "true" : undefined}>{section.label}</div>
            {section.items.map((item) => {
              const isActive = active?.href === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? `${item.label}  (g ${item.key})` : `g ${item.key}`}
                >
                  <Icon size={18} stroke={1.5} aria-hidden="true" />
                  <span className="nav-item__label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
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
