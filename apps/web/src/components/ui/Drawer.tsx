"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

/** Right-side panel, 220ms ease-out slide. Esc or backdrop click closes. Focus moves into the panel on open. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} tabIndex={-1}>
        <div className="drawer__head">
          <div className="drawer__title">{title}</div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close panel">
            <IconX size={16} stroke={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer ? <div style={{ borderTop: "1px solid var(--line)", padding: "var(--sp-3) var(--sp-4)" }}>{footer}</div> : null}
      </div>
    </>
  );
}
