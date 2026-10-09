"use client";

import { useId, useRef, useState } from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

/** WAI-ARIA tabs (automatic activation): Left/Right wrap, Home/End jump, Tab moves into the panel; one tab stop. Controlled via `value`/`onChange`, or uncontrolled. */
export function Tabs({ tabs, value, onChange, defaultValue, label }: { tabs: TabItem[]; value?: string; onChange?: (id: string) => void; defaultValue?: string; /** accessible name for the tab list */ label?: string }) {
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id);
  const wanted = value ?? inner;
  // keep exactly one tab stop even if `value` names a tab that is not in the list
  const active = tabs.some((t) => t.id === wanted) ? wanted : tabs[0]?.id;
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      select(tabs[next].id);
      refs.current[next]?.focus();
    }
  };

  return (
    <div className="tabs">
      <div role="tablist" aria-orientation="horizontal" aria-label={label} className="tabs__list">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            id={`${uid}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${uid}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className="tabs__tab"
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${uid}-panel-${t.id}`} aria-labelledby={`${uid}-tab-${t.id}`} hidden={active !== t.id} tabIndex={0}>
          {active === t.id ? t.content : null}
        </div>
      ))}
    </div>
  );
}
