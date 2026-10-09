"use client";

import { useEffect, useState } from "react";
import { IconChevronRight } from "@tabler/icons-react";

/**
 * "Show details" disclosure used inside a case stage. Native <details>, so it works without JS and with the keyboard.
 * `forceOpen` opens it from outside (e.g. an evidence chip elsewhere asks to show that item).
 */
export function Disclosure({
  label, hint, children, forceOpen, testId,
}: { label: string; hint?: string; children: React.ReactNode; forceOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(!!forceOpen);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  return (
    <details className="case-more" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid={testId}>
      <summary className="case-more__summary">
        <IconChevronRight className="case-more__chev" size={16} stroke={1.75} aria-hidden="true" />
        <span className="case-more__verb">{open ? "Hide details" : "Show details"}</span>
        <span className="case-more__label">{label}</span>
        {hint ? <span className="case-more__hint">{hint}</span> : null}
      </summary>
      <div className="case-more__body">{children}</div>
    </details>
  );
}
