/**
 * One problem taxonomy for the whole console (categories + workflow stages).
 * Mirrors services/engine/strata_engine/taxonomy.py; tests/engine/test_taxonomy.py checks both agree.
 * The engine computes `category` and `stage` on every incident summary; the web only renders them.
 * Icons are Tabler line-icon component names (resolved in apps/web/src/components/ui/CategoryChip.tsx).
 */

export type CategoryKey = "customer" | "supply" | "service" | "finance" | "field" | "quality" | "data" | "opportunity";
export type StageKey = "detected" | "investigating" | "plan_ready" | "awaiting_approval" | "in_progress" | "outcome_recorded" | "learned";

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  icon: string;
  /** one plain sentence: what belongs here */
  meaning: string;
  /** usual owner role and first action */
  owner: string;
  firstAction: string;
  /** route-only categories never get automatic plans beyond routing */
  routeOnly?: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "supply", label: "Supply & stock", icon: "IconTruckDelivery",
    meaning: "We could not ship what customers ordered: low warehouse stock, supplier delays, falling fill rate.",
    owner: "Operations Manager", firstAction: "Check stock cover and supplier ETA, then reallocate stock." },
  { key: "service", label: "Service & support", icon: "IconHeadset",
    meaning: "Customers wait longer for answers or raise more service complaints.",
    owner: "Support Manager", firstAction: "Add support capacity where replies are slow; call back open complaints." },
  { key: "customer", label: "Customer relationship", icon: "IconUsers",
    meaning: "An account is ordering less or drifting away without a clearer supply, finance or field cause.",
    owner: "Account Manager", firstAction: "Call the account and find out what changed." },
  { key: "finance", label: "Payment & finance", icon: "IconReceiptRupee",
    meaning: "Overdue payments are rising, usually together with falling orders.",
    owner: "Account Manager", firstAction: "Credit review call before the next dispatch." },
  { key: "field", label: "Field coverage", icon: "IconRoute",
    meaning: "Reps visit or contact accounts and doctors less than usual, for example after a rep leaves.",
    owner: "Account Manager", firstAction: "Assign interim cover and book the overdue visits." },
  { key: "quality", label: "Quality & safety", icon: "IconShieldHalf", routeOnly: true,
    meaning: "Complaints about one batch, or wording that may describe a patient reaction. Route-only: QA Head, four-eyes.",
    owner: "QA Head", firstAction: "Route to the QA Head; a second reviewer confirms. STRATA gives no clinical advice." },
  { key: "data", label: "Data quality", icon: "IconPlugConnectedX",
    meaning: "A data feed is late or duplicated, so STRATA pauses judgement instead of raising false alarms.",
    owner: "Operations Manager", firstAction: "Fix the feed; signals resume when the data is fresh." },
  { key: "opportunity", label: "Opportunity", icon: "IconTrendingUp",
    meaning: "Positive change: an account is growing in related products but does not buy a complementary line.",
    owner: "Sales Manager", firstAction: "Plan a cross-sell visit with a sample plan." },
];

export const CATEGORY: Record<CategoryKey, CategoryDef> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CategoryKey, CategoryDef>;

export interface StageDef { key: StageKey; label: string; meaning: string; next: string }

export const STAGES: StageDef[] = [
  { key: "detected", label: "Detected", meaning: "Sentinel found signals from several systems moving together.", next: "Run the investigation to find the likely cause." },
  { key: "investigating", label: "Investigating", meaning: "Agents are ranking causes and searching memory.", next: "Wait for the plan." },
  { key: "plan_ready", label: "Plan ready", meaning: "A cause is known but there is no plan waiting for approval (for example the last one was rejected).", next: "Re-run the investigation to draft a new plan." },
  { key: "awaiting_approval", label: "Awaiting approval", meaning: "A plan with owners and due times is waiting for a human decision.", next: "Approve, modify or reject it." },
  { key: "in_progress", label: "In progress", meaning: "The plan was approved; simulated tasks and drafts were created.", next: "Owners work the tasks; the outcome is checked later." },
  { key: "outcome_recorded", label: "Outcome recorded", meaning: "The result was measured (in the Lab: a scripted, illustrative result).", next: "STRATA writes the result into memory." },
  { key: "learned", label: "Learned", meaning: "The outcome is stored in Organizational Memory and will inform the next similar case.", next: "Nothing; the case is closed." },
];

export const STAGE_INDEX: Record<StageKey, number> = Object.fromEntries(STAGES.map((s, i) => [s.key, i])) as Record<StageKey, number>;
