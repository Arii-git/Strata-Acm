"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TERMS } from "@config/terms";

/** A `?` button that explains a technical term (text in config/terms.ts). Keyboard and screen-reader friendly. */
export function TermHint({ term, label }: { term: keyof typeof TERMS | string; label?: string }) {
  const t = TERMS[term];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);
  if (!t) return null;
  return (
    <span className="term-hint" ref={ref}>
      {label ? <span>{label}</span> : null}
      <button type="button" className="term-hint__btn" aria-expanded={open} aria-controls={id} aria-label={`What is ${t.term}?`} onClick={() => setOpen((o) => !o)}>?</button>
      {open ? (
        <span id={id} role="tooltip" className="term-hint__pop">
          <b>{t.term}.</b> {t.text}
        </span>
      ) : null}
    </span>
  );
}
