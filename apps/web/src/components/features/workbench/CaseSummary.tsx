"use client";

import Link from "next/link";
import { IconClock, IconInfoCircle } from "@tabler/icons-react";
import { CategoryChip, SeverityPill, TermHint } from "@/components/ui";
import { DeadlineCountdown, RiskLevelBadge } from "@/components/features/agentic";
import { agentStatusLine, toRiskLevel, type LevelItem } from "@/components/features/problems/levels";
import { scopeText } from "@/components/features/problems/model";
import { fmtINR } from "@/lib/format";
import { personaLabel } from "@/lib/persona";
import { workflowLabel } from "./pipeline";
import type { WbIncident } from "./shared";

/**
 * The compact strip that stays on screen through every stage: what the case is, whose it is, how big, where it stands.
 * Risk level + decision deadline appear only when GET /agentic/levels knows this case.
 */
export function CaseSummary({ inc, level, onExplain }: { inc: WbIncident; level: LevelItem | null; onExplain: () => void }) {
  const account = inc.account_id != null && inc.scope === "account"
    ? <Link href={`/app/accounts/${inc.account_id}`} className="case-summary__link">{inc.account_name || `Account ${inc.account_id}`}</Link>
    : <span>{scopeText({ scope: inc.scope, scope_key: inc.scope_key, account_name: inc.account_name, region: inc.region })}</span>;
  return (
    <div className="case-summary" data-testid="case-meta">
      <div className="case-summary__top">
        <h1 className="case-summary__title">
          <span className="mono case-summary__ref">{inc.ref}</span>
          <span className="case-summary__name">{inc.title}</span>
        </h1>
        <div className="case-summary__tools">
          <CategoryChip category={inc.category} size="sm" />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onExplain} data-testid="explain-button">
            <IconInfoCircle size={16} stroke={1.5} aria-hidden="true" /> Explain
          </button>
        </div>
      </div>
      <dl className="case-summary__facts">
        <div><dt>{inc.scope === "account" ? "Account" : "Scope"}</dt><dd>{account}</dd></div>
        <div><dt>Severity</dt><dd><SeverityPill severity={inc.severity} /></dd></div>
        {level ? <div data-testid="case-level"><dt>Level</dt><dd><RiskLevelBadge level={toRiskLevel(level.level)} compact /></dd></div> : null}
        <div><dt>Exposure <TermHint term="exposure" /></dt><dd className="num">{fmtINR(inc.value_at_stake)}</dd></div>
        <div><dt>Owner</dt><dd>{personaLabel(inc.owner_role)}</dd></div>
        <div><dt>Status</dt><dd>{workflowLabel(inc.stage)}</dd></div>
        {level?.decision_deadline ? (
          <div data-testid="case-deadline"><dt>Decide by</dt><dd><DeadlineCountdown deadline={level.decision_deadline} mode={level.mode} /></dd></div>
        ) : null}
      </dl>
      {level ? (
        <p className="case-agent-line" data-testid="agent-status">
          <IconClock size={16} stroke={1.75} aria-hidden="true" />
          <span>{agentStatusLine(level)}</span>
        </p>
      ) : null}
    </div>
  );
}
