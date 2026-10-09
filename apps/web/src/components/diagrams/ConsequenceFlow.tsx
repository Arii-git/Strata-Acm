"use client";

import {
  IconCircleCheck, IconChecklist, IconDatabase, IconMailForward, IconTargetArrow, IconCalendarEvent, type Icon,
} from "@tabler/icons-react";
import { personaLabel } from "@/lib/persona";

export interface ConsequenceStep { owner_role: string; due_in_hours: number }
export interface ConsequenceDraft { channel: string; to_role: string }

function hours(h: number): string {
  return h >= 48 ? `${Math.round((h / 24) * 10) / 10} d` : `${h} h`;
}

/** Group plan steps by owner role, keeping due times in plan order: "Operations Manager: 4 h, 12 h". */
function byOwner(steps: ConsequenceStep[]): { role: string; dues: number[] }[] {
  const out: { role: string; dues: number[] }[] = [];
  for (const s of steps) {
    const g = out.find((x) => x.role === s.owner_role);
    if (g) g.dues.push(s.due_in_hours);
    else out.push({ role: s.owner_role, dues: [s.due_in_hours] });
  }
  return out;
}

/**
 * What happens after "Approve", built only from the plan: Approve → N tasks (owners, due) → M drafts
 * (simulated) → check-in → outcome recorded → memory updated. HTML ordered list so it reads as text too.
 */
export function ConsequenceFlow({
  steps, drafts, requiresRole, fourEyes,
}: { steps: ConsequenceStep[]; drafts: ConsequenceDraft[]; requiresRole: string; fourEyes: boolean }) {
  const owners = byOwner(steps);
  const lastDue = steps.reduce((m, s) => Math.max(m, s.due_in_hours), 0);
  const nodes: { key: string; icon: Icon; title: string; body: React.ReactNode }[] = [
    {
      key: "approve", icon: IconCircleCheck, title: "You approve",
      body: <>{personaLabel(requiresRole)}{fourEyes ? " approves, then a second, different reviewer confirms (four-eyes)." : " (or a manager above) approves."}</>,
    },
    {
      key: "tasks", icon: IconChecklist, title: `${steps.length} task${steps.length === 1 ? "" : "s"} created`,
      body: (
        <ul className="consequence-flow__list">
          {owners.map((o) => <li key={o.role}><b>{personaLabel(o.role)}</b>: due in {o.dues.map(hours).join(", ")}</li>)}
        </ul>
      ),
    },
    {
      key: "drafts", icon: IconMailForward, title: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} prepared`,
      body: drafts.length ? (
        <>
          <ul className="consequence-flow__list">
            {drafts.map((d, i) => <li key={i}>{d.channel === "whatsapp_draft" ? "WhatsApp" : "Email"} draft to {personaLabel(d.to_role)}</li>)}
          </ul>
          <span>Simulated: nothing is sent.</span>
        </>
      ) : <>No message drafts in this plan. Nothing is sent.</>,
    },
    {
      key: "checkin", icon: IconCalendarEvent, title: "Check-in point",
      body: <>Owners report back as tasks fall due; the last step is due in {hours(lastDue)}.</>,
    },
    {
      key: "outcome", icon: IconTargetArrow, title: "Outcome recorded",
      body: <>The result is measured against the account&apos;s own baseline (in the Lab: a scripted, illustrative result).</>,
    },
    {
      key: "memory", icon: IconDatabase, title: "Memory updated",
      body: <>The outcome is written to Organizational Memory and informs the next similar case.</>,
    },
  ];
  const summary = `If approved: ${steps.length} tasks for ${owners.map((o) => personaLabel(o.role)).join(", ")}; ${drafts.length} simulated drafts; check-in by ${hours(lastDue)}; outcome recorded; memory updated.`;
  return (
    <figure className="diagram consequence-flow" data-testid="diagram-consequence">
      <ol className="consequence-flow__steps" aria-label="What happens after approval, in order">
        {nodes.map((n, i) => {
          const Ico = n.icon;
          return (
            <li key={n.key} className="consequence-flow__node">
              <span className="consequence-flow__head">
                <span className="consequence-flow__num" aria-hidden="true">{i + 1}</span>
                <Ico size={18} stroke={1.5} aria-hidden="true" />
                <b>{n.title}</b>
              </span>
              <span className="consequence-flow__body">{n.body}</span>
            </li>
          );
        })}
      </ol>
      <figcaption className="caption">
        Consequence flow, built from this plan&apos;s steps and drafts. <span className="sr-only">{summary}</span>
      </figcaption>
    </figure>
  );
}
