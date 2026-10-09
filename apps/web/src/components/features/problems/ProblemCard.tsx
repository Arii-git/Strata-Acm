import Link from "next/link";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityPill } from "@/components/ui/pills";
import { TermHint } from "@/components/ui/TermHint";
import { fmtINR } from "@/lib/format";
import { ageText, ownerText, scopeText, stageText, type ProblemRow } from "./model";

/**
 * One problem on the board. Shows exactly seven fields (category, severity, stage, scope, owner, age, ₹ exposed),
 * each marked with data-field for the e2e check. The title link covers the card (stretched link); the `?` stays clickable.
 */
export function ProblemCard({ p }: { p: ProblemRow }) {
  return (
    <article className="problem-card" data-testid="problem-card" data-category={p.category} data-ref={p.ref}>
      <div className="problem-card__top">
        <span data-field="category"><CategoryChip category={p.category} size="sm" /></span>
        <span data-field="severity"><SeverityPill severity={p.severity} /></span>
      </div>
      <h3 className="problem-card__title">
        <Link href={`/app/incidents/${p.ref}`} className="problem-card__link">
          <span className="mono problem-card__ref">{p.ref}</span> {p.title}
        </Link>
      </h3>
      <dl className="problem-card__fields">
        <div><dt>Stage</dt><dd data-field="stage">{stageText(p.stage)}</dd></div>
        <div><dt>{p.scope === "account" ? "Account" : "Scope"}</dt><dd data-field="scope" title={scopeText(p)}>{scopeText(p)}</dd></div>
        <div><dt>Owner</dt><dd data-field="owner">{ownerText(p.owner_role)}</dd></div>
        <div><dt>Open for</dt><dd data-field="age">{ageText(p.age_days)}</dd></div>
      </dl>
      <div className="problem-card__exposure" data-field="exposure">
        <span className="num">{fmtINR(p.value_at_stake)}</span> exposed
        <span className="problem-card__hint"><TermHint term="exposure" /></span>
      </div>
    </article>
  );
}
