"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { NAV_ITEMS } from "./nav";
import { GuidedBar, GuidedProvider, useGuided } from "@/components/features/guided";

const COLLAPSE_KEY = "strata.sidebar.collapsed";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <GuidedProvider>
      <ShellFrame>{children}</ShellFrame>
    </GuidedProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const guided = useGuided();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const gPending = useRef<number | null>(null);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* storage unavailable */ }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try { window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ }
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || palette) return;
      if (gPending.current !== null) {
        window.clearTimeout(gPending.current);
        gPending.current = null;
        const item = NAV_ITEMS.find((i) => i.key === e.key.toLowerCase());
        if (item) { e.preventDefault(); router.push(item.href); }
        return;
      }
      if (e.key === "g") {
        gPending.current = window.setTimeout(() => { gPending.current = null; }, 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, palette]);

  return (
    <div className={`shell${collapsed ? " is-collapsed" : ""}${guided.active ? " has-guided" : ""}`}>

      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="shell__main">
        <TopBar onOpenPalette={() => setPalette(true)} />
        <main id="main" className="shell__content" tabIndex={-1}>
          <div className="shell__inner">{children}</div>
        </main>
      </div>
      <GuidedBar />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
