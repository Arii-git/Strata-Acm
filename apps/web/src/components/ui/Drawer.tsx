"use client";

import { useEffect, useId, useRef } from "react";
import { IconX } from "@tabler/icons-react";

const FOCUSABLE = [
  "a[href]", "area[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])", "select:not([disabled])",
  "textarea:not([disabled])", "iframe", "summary", "[contenteditable=true]", "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("hidden") && el.getClientRects().length > 0);
}

/**
 * Right-side modal panel (role="dialog", aria-modal). 220ms ease-out slide (none with reduced motion).
 * Focus moves into the panel on open, Tab/Shift+Tab stay inside it, Esc or backdrop click closes,
 * and focus returns to the element that opened it.
 */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `${useId()}-drawer-title`;
  // keep the latest onClose without re-running the open/close effect (callers often pass inline functions)
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = focusables(panel.current);
      if (items.length === 0) { e.preventDefault(); panel.current.focus(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.current.contains(active);
      if (e.shiftKey && (active === firstEl || active === panel.current || !inside)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (active === lastEl || !inside)) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer__head">
          <h2 className="drawer__title" id={titleId}>{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm drawer__close" onClick={onClose} aria-label="Close panel">
            <IconX size={16} stroke={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer ? <div className="drawer__foot">{footer}</div> : null}
      </div>
    </>
  );
}
