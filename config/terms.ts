/** Short definitions for `TermHint` (`?` popovers). Lane L6 owns the wording. Keep each under 40 words. */
export const TERMS: Record<string, { term: string; text: string }> = {
  baseline: { term: "Baseline", text: "This account's own normal level: the typical value of the same 4-week measure over the last two years." },
  robust_z: { term: "Robust z-score", text: "How unusual the last 4 weeks are compared with the account's normal spread. Beyond about 2 is unusual; beyond 3 is very unusual." },
  evidence_id: { term: "Evidence ID", text: "A label for one computed signal (for example EV-4821-order_volume_delta). Every sentence STRATA writes must cite one, or it is dropped." },
  blast_radius: { term: "Blast radius", text: "Other accounts exposed to the same cause, such as buyers of the same short product." },
  similarity: { term: "Similarity breakdown", text: "How close a past case is: 0.5 × text match + 0.3 × same cause + 0.2 × same signal pattern." },
  provenance: { term: "Provenance", text: "Where a number comes from: computed from data, synthetic, illustrative (scripted) or an assumption." },
  four_eyes: { term: "Four-eyes", text: "Two different people must approve. Used for quality and safety cases." },
  risk_score: { term: "Risk score", text: "0–100. Independent warning signals combined (noisy-OR) and scaled by how many separate systems agree. One system alone can never exceed 'elevated'." },
  exposure: { term: "₹ exposed", text: "The account's normal 12-week order value. It is what is at stake, not a forecast of what will be lost." },
  silent_period: { term: "Silent period", text: "Days a problem existed before a weekly manual review would have caught it (assumption: the review flags a >25% month-on-month drop)." },
  alert_budget: { term: "Alert Budget", text: "At most 7 items per role per day, ranked by exposure × confidence × urgency, so the list stays actionable." },
};
