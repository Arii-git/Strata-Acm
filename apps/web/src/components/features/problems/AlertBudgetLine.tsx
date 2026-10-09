"use client";

import { useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { TermHint } from "@/components/ui/TermHint";
import { fmtNum } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import type { RisksPayload } from "./model";

/** Alert Budget as one sentence: "7 shown, 5 held back for your role — see why" (opens a drawer with the reasons). */
export function AlertBudgetLine({ data, persona }: { data: RisksPayload | null; persona: string }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const held = data.held_back.length;
  const role = personaLabel(persona);
  return (
    <>
      <p className="alert-budget" data-testid="alert-budget">
        <span>
          <strong className="num">{fmtNum(data.shown)}</strong> shown, <strong className="num">{fmtNum(held)}</strong> held back for your role ({role})
        </span>
        <TermHint term="alert_budget" />
        <span aria-hidden="true">—</span>
        <button type="button" className="link-button" onClick={() => setOpen(true)} aria-haspopup="dialog">see why</button>
      </p>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Alert Budget for ${role}`}>
        <div className="stack" style={{ gap: "var(--sp-3)" }}>
          <p style={{ margin: 0 }}>
            Each role sees at most {fmtNum(data.budget)} items a day, ranked by exposure × confidence × urgency, so the list stays actionable.
            {" "}{fmtNum(data.total)} items were ranked for {role}; {fmtNum(data.shown)} are shown.
          </p>
          {held === 0 ? (
            <p className="caption" style={{ margin: 0 }}>Nothing is held back: every item for this role fits inside the budget. The board still shows all problems for every role.</p>
          ) : (
            <ul className="held-back-list">
              {data.held_back.map((h) => (
                <li key={h.ref}>
                  <Link className="mono" href={`/app/incidents/${h.ref}`}>{h.ref}</Link> {h.title}
                  <div className="caption">Why held back: {h.reason}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="caption" style={{ margin: 0 }}>Held-back items are not hidden from the board; they are only left out of this role&apos;s daily list. Switch role in the top bar to see another role&apos;s list.</p>
        </div>
      </Drawer>
    </>
  );
}
