"use client";

import Link from "next/link";
import { EXPLAIN } from "@config/explain";
import { Drawer } from "./Drawer";

/** "Explain this page" (A24): what the page is, how to read it, what to do next. Text lives in config/explain.ts. */
export function ExplainDrawer({ pageKey, open, onClose }: { pageKey: string; open: boolean; onClose: () => void }) {
  const e = EXPLAIN[pageKey];
  return (
    <Drawer open={open} onClose={onClose} title={e ? `About: ${e.title}` : "About this page"}>
      {e ? (
        <div className="stack" data-testid="explain-drawer">
          <section>
            <h3 className="section-label">What this page is</h3>
            <p>{e.what}</p>
          </section>
          <section>
            <h3 className="section-label">How to read it</h3>
            <ul className="plain-list">{e.read.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>
          <section>
            <h3 className="section-label">What to do next</h3>
            <p>{e.next}</p>
          </section>
          <p className="caption">Every number on this page has a small provenance badge: computed (from data), synthetic, illustrative (scripted) or assumption. <Link href="/app/help">Open the glossary</Link>.</p>
        </div>
      ) : (
        <p>No explanation written for this page yet.</p>
      )}
    </Drawer>
  );
}
