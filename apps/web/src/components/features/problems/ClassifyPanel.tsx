import { CATEGORIES, STAGES } from "@config/taxonomy";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { Details } from "@/components/ui/PageTemplate";

/** "How we classify": every category's meaning, usual owner and first action, straight from config/taxonomy.ts. */
export function ClassifyPanel({ defaultOpen }: { defaultOpen?: boolean }) {
  return (
    <Details title="How we classify problems" defaultOpen={defaultOpen} testId="classify-panel">
      <p className="caption" style={{ margin: 0 }}>
        The engine puts every problem in exactly one category and one workflow stage. Quality &amp; safety is route-only: STRATA routes it to the QA Head and gives no clinical advice.
      </p>
      <ul className="classify-list">
        {CATEGORIES.map((c) => (
          <li key={c.key} className="classify-list__item">
            <CategoryChip category={c.key} />
            <p className="classify-list__meaning">{c.meaning}</p>
            <dl className="classify-list__meta">
              <div><dt>Usual owner</dt><dd>{c.owner}</dd></div>
              <div><dt>First action</dt><dd>{c.firstAction}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <h3 className="section-label">Workflow stages (board columns)</h3>
      <ol className="classify-stages">
        {STAGES.map((s) => (
          <li key={s.key}><strong>{s.label}.</strong> {s.meaning} <span className="caption">Next: {s.next}</span></li>
        ))}
      </ol>
    </Details>
  );
}
