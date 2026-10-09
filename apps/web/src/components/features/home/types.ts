import type { HeldBack, Kind, Note, PersonaKey, Provenance, Severity } from "@/lib/api/types";

/** GET /digest (engine digest.py). Every number is computed by the engine; nothing here is typed in by hand. */
export type DigestPeriod = "today" | "yesterday" | "week";

export interface DigestNumber {
  id: string;
  label: string;
  value: number;
  unit: string;
  provenance: Provenance;
  meaning: string;
  /** same metric over the same-length window just before (null when not comparable) */
  previous?: number | null;
  href?: string | null;
}
export interface DigestHighlight { text: string; href: string; evidence_ids: string[]; ref?: string | null; severity?: Severity | null }
export interface DigestMissed { id: number; text: string; at: string; sim_at?: string; href: string; type: string; label: string; incident?: string | null }
export interface DigestStage { stage: string; label: string; count: number; href: string; meaning: string; provenance?: Provenance }
export interface DigestSeries { name: string; key: string; unit: string; provenance: Provenance; meaning: string; points: [string, number][] }

export interface Digest {
  persona: PersonaKey;
  period: DigestPeriod;
  label: string;
  headline: string;
  as_of: string;
  window: { start: string; end: string };
  numbers: DigestNumber[];
  highlights: DigestHighlight[];
  missed: DigestMissed[];
  missed_total: number;
  since: string;
  pipeline: DigestStage[];
  series: DigestSeries[];
  provenance: Provenance;
}

/** GET /briefing (live engine shape). */
export interface BriefPriority {
  id: string; ref: string; title: string; kind: Kind; severity: Severity; risk_score: number;
  value_at_stake: number; n_sources: number; sources: string[]; account_id: number | string | null;
  account_name: string; status: string; owner_role: string; regulatory_sensitive: boolean;
  category: string; category_label: string; stage: string; stage_label: string;
}
export interface BriefingLive {
  persona: PersonaKey; sim_now: string; greeting: string; role_label: string;
  signals_checked: number; sources_count: number; accounts_count: number;
  need_you: number; opportunities: number; qa_routed: number;
  summary: string; priorities: BriefPriority[]; held_back: HeldBack[]; notes_for_you: Note[];
}

export function numberById(d: Digest | null | undefined, id: string): DigestNumber | undefined {
  return d?.numbers.find((n) => n.id === id);
}
