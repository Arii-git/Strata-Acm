import Link from "next/link";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { SeverityPill } from "@/components/ui/pills";
import { TermHint } from "@/components/ui/TermHint";
import { RiskLevelBadge } from "@/components/features/agentic";
import { caseHref } from "@/components/features/workbench/pipeline";
import { fmtINR } from "@/lib/format";
import { toRiskLevel, type LevelItem } from "./levels";
import { ageText, ownerText, reasonText, scopeText, stageText, type ProblemRow } from "./model";

/**
 * One problem on the board: category + level/severity, the title, ONE line of why, then scope, owner, age and ₹ exposed.
 * All seven fields keep their data-field marker (e2e); stage is announced to screen readers because the column shows it.
 * The title link covers the card and opens the case at the step where it currently sits.
 */
export function ProblemCard({ p, level }: { p: ProblemRow; level?: LevelItem | null }) {
  const reason = level?.reasons?.[0] || reasonText(p);
  return (
    <article className="problem-card" data-testid="problem-card" data-category={p.category} data-ref={p.ref}>
      <div className="problem-card__top">
        <span data-field="category"><CategoryChip category={p.category} size="sm" /></span>
        <span className="problem-card__badges">
          {level ? <RiskLevelBadge level={toRiskLevel(level.level)} compact /> : null}
          <span data-field="severity"><SeverityPill severity={p.severity} /></span>
        </span>
      </div>
      <h3 className="problem-card__title">
        <Link href={caseHref(p.ref, p.stage)} className="problem-card__link">{p.title}</Link>
      </h3>
      <p className="problem-card__reason" title={reason}>{reason}</p>
      <p className="problem-card__meta">
        <span className="mono">{p.ref}</span>
        <span aria-hidden="true">·</span>
        <span data-field="scope" title={scopeText(p)}>{scopeText(p)}</span>
      </p>
      <div className="problem-card__foot">
        <span className="problem-card__exposure" data-field="exposure">
          <span className="num">{fmtINR(p.value_at_stake)}</span> exposed
          <span className="problem-card__hint"><TermHint term="exposure" /></span>
        </span>
        <span className="problem-card__who">
          <span data-field="owner">{ownerText(p.owner_role)}</span>
          <span aria-hidden="true">·</span>
          <span data-field="age">{ageText(p.age_days)}</span>
        </span>
      </div>
      <span className="sr-only" data-field="stage">Stage: {stageText(p.stage)}</span>
    </article>
  );
}
