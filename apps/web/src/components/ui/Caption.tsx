import type { Provenance } from "@/lib/api/types";

const PROV_TITLE: Record<Provenance, string> = {
  computed: "Computed from the synthetic dataset by the engine",
  synthetic: "Synthetic input value (generated data, not real company data)",
  illustrative: "Illustrative / scripted counterfactual, not a measured result",
  assumption: "Based on a stated assumption",
};

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return <span className={`prov prov--${provenance}`} title={PROV_TITLE[provenance]} aria-label={`Provenance: ${provenance}`}>{provenance}</span>;
}

/** Caption (--fs-12 = 14px in tokens v2, --ink-3) explanation: what this is, then what it implies. */
export function Caption({ meaning, implication, children, id }: { meaning?: string; implication?: string; children?: React.ReactNode; /** lets a chart/table point aria-describedby here */ id?: string }) {
  return (
    <p className="caption" id={id}>
      {meaning}
      {meaning && implication ? " " : null}
      {implication}
      {children}
    </p>
  );
}
