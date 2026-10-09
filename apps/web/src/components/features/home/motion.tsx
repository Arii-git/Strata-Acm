"use client";

import { useEffect, useRef, useState } from "react";

/** true when the user asked the OS for reduced motion (re-evaluated if they change it). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * A section that fades and rises in once, the first time it scrolls into view.
 * Without IntersectionObserver (or with reduced motion) it is simply visible.
 */
export function Reveal({ id, className = "", children, labelledBy }: { id?: string; className?: string; children: React.ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setShown(true);
        io.disconnect();
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    io.observe(el);
    // never leave content hidden (e.g. full-page screenshots that do not scroll)
    const t = window.setTimeout(() => setShown(true), 2500);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, []);
  return (
    <section ref={ref} id={id} aria-labelledby={labelledBy} className={`home-reveal${shown ? " is-in" : ""} ${className}`.trim()}>
      {children}
    </section>
  );
}

const TYPED_KEY = "strata.home.typed";

/**
 * Reveals `text` word by word, once per browser session. Screen readers get the full text at once;
 * with reduced motion the text appears immediately.
 */
export function TypedText({ text, className }: { text: string; className?: string }) {
  const reduced = useReducedMotion();
  const words = text.split(/(\s+)/);
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let seen = false;
    try { seen = window.sessionStorage.getItem(TYPED_KEY) === text; } catch { /* storage unavailable */ }
    const instant = seen || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (instant) { setN(words.length); return; }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 2; // a word and the whitespace after it
      setN(Math.min(i, words.length));
      if (i >= words.length) {
        window.clearInterval(id);
        try { window.sessionStorage.setItem(TYPED_KEY, text); } catch { /* storage unavailable */ }
      }
    }, 45);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const shownCount = reduced ? words.length : n ?? 0;
  const done = shownCount >= words.length;
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={`home-typed${done ? " is-done" : ""}`}>
        {words.slice(0, shownCount).join("")}
        {!done ? <span className="home-typed__caret" /> : null}
      </span>
    </p>
  );
}

/** Track which section id is on screen (for the side table of contents). */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join("|");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const vis = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) vis.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      const best = ids.find((id) => (vis.get(id) ?? 0) > 0);
      if (best) setActive(best);
    }, { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.01, 0.25] });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}
