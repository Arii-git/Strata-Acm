"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NAV_ITEMS.filter((i) => `${i.label} ${i.section}`.toLowerCase().includes(s)) : NAV_ITEMS;
  }, [q]);

  useEffect(() => {
    if (open) { setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 0); }
  }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  const go = (href: string) => { onClose(); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && items[sel]) { e.preventDefault(); go(items[sel].href); }
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Go to page">
        <input
          ref={input}
          className="palette__input"
          placeholder="Go to page…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={items[sel] ? `pal-${items[sel].key}` : undefined}
        />
        <ul id="palette-list" className="palette__list" role="listbox">
          {items.length === 0 ? <li className="palette__item muted">No matching page</li> : null}
          {items.map((i, idx) => {
            const Icon = i.icon;
            return (
              <li
                key={i.href}
                id={`pal-${i.key}`}
                role="option"
                aria-selected={idx === sel}
                className="palette__item"
                onMouseEnter={() => setSel(idx)}
                onClick={() => go(i.href)}
              >
                <Icon size={16} stroke={1.5} aria-hidden="true" />
                {i.label}
                <small>{i.section} · g {i.key}</small>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
