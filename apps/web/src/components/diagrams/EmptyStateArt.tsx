/**
 * Simple line-art illustrations for empty states, one per problem category plus a few page kinds.
 * Original SVG, colour tokens only, decorative strokes; the text next to it carries the meaning.
 */
import type { ReactNode } from "react";

export type EmptyArtKey =
  | "supply" | "service" | "customer" | "finance" | "field" | "quality" | "data" | "opportunity"
  | "tasks" | "outcome" | "memory" | "audit" | "notebook";

const S = { fill: "none", stroke: "var(--ink-3)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const A = { ...S, stroke: "var(--indigo-600)" } as const;

const ART: Record<EmptyArtKey, { alt: string; body: ReactNode }> = {
  supply: {
    alt: "A delivery truck next to stacked boxes",
    body: (<>
      <rect x="14" y="34" width="44" height="26" rx="3" {...S} /><path d="M58 42h14l8 10v8H58z" {...S} />
      <circle cx="28" cy="62" r="5" {...S} /><circle cx="70" cy="62" r="5" {...S} />
      <rect x="88" y="40" width="18" height="16" {...A} /><rect x="94" y="24" width="18" height="16" {...A} /><path d="M6 68h112" {...S} />
    </>),
  },
  service: {
    alt: "A headset and a speech bubble",
    body: (<>
      <path d="M22 50v-8a20 20 0 0 1 40 0v8" {...S} /><rect x="16" y="48" width="10" height="16" rx="3" {...S} /><rect x="58" y="48" width="10" height="16" rx="3" {...S} />
      <path d="M64 64c0 6-8 8-16 8" {...S} />
      <path d="M78 18h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H92l-8 8v-8h-6a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z" {...A} />
    </>),
  },
  customer: {
    alt: "Two people side by side",
    body: (<>
      <circle cx="44" cy="30" r="10" {...S} /><path d="M26 68c0-12 8-20 18-20s18 8 18 20" {...S} />
      <circle cx="80" cy="34" r="8" {...A} /><path d="M66 68c0-10 6-16 14-16s14 6 14 16" {...A} />
    </>),
  },
  finance: {
    alt: "A receipt with a due-date marker",
    body: (<>
      <path d="M36 12h44v60l-7-5-7 5-7-5-7 5-7-5-9 5z" {...S} /><path d="M46 28h24M46 38h24M46 48h14" {...S} />
      <circle cx="94" cy="54" r="12" {...A} /><path d="M94 47v7l5 3" {...A} />
    </>),
  },
  field: {
    alt: "A route between two map pins",
    body: (<>
      <path d="M26 58c18 0 14-30 34-30s18 26 40 22" {...S} strokeDasharray="4 5" />
      <path d="M26 58c-6-8-10-12-10-17a10 10 0 0 1 20 0c0 5-4 9-10 17z" {...A} /><circle cx="26" cy="41" r="3" {...A} />
      <path d="M100 50c-6-8-10-12-10-17a10 10 0 0 1 20 0c0 5-4 9-10 17z" {...S} /><circle cx="100" cy="33" r="3" {...S} />
    </>),
  },
  quality: {
    alt: "A shield with a check mark",
    body: (<>
      <path d="M60 10l26 10v18c0 16-11 28-26 34-15-6-26-18-26-34V20z" {...S} /><path d="M49 40l8 8 15-16" {...A} />
    </>),
  },
  data: {
    alt: "Data feeds flowing into a plug",
    body: (<>
      <path d="M10 26h40M10 40h40M10 54h40" {...S} /><rect x="54" y="22" width="24" height="36" rx="4" {...A} />
      <path d="M78 32h12M78 48h12" {...A} /><path d="M90 40h20" {...S} />
    </>),
  },
  opportunity: {
    alt: "A line rising across a chart",
    body: (<>
      <path d="M16 66V14M16 66h92" {...S} /><path d="M24 58l20-14 16 8 22-22 18-8" {...A} /><path d="M92 22h8v8" {...A} />
    </>),
  },
  tasks: {
    alt: "A checklist with one item ticked",
    body: (<>
      <rect x="30" y="10" width="60" height="62" rx="4" {...S} /><path d="M40 26l4 4 8-8" {...A} />
      <path d="M58 27h22M58 43h22M58 59h22" {...S} /><rect x="40" y="38" width="10" height="10" rx="2" {...S} /><rect x="40" y="54" width="10" height="10" rx="2" {...S} />
    </>),
  },
  outcome: {
    alt: "Before and after bars",
    body: (<>
      <path d="M16 68h88" {...S} /><rect x="30" y="30" width="20" height="38" {...S} /><rect x="66" y="16" width="20" height="52" {...A} />
      <path d="M50 24l14-8" {...A} />
    </>),
  },
  memory: {
    alt: "Stacked cards with a search lens",
    body: (<>
      <rect x="20" y="22" width="52" height="40" rx="4" {...S} /><path d="M26 16h52v40" {...S} />
      <circle cx="88" cy="50" r="12" {...A} /><path d="M97 59l10 10" {...A} />
    </>),
  },
  audit: {
    alt: "Linked chain of records",
    body: (<>
      <rect x="10" y="30" width="28" height="20" rx="4" {...S} /><rect x="46" y="30" width="28" height="20" rx="4" {...A} /><rect x="82" y="30" width="28" height="20" rx="4" {...S} />
      <path d="M38 40h8M74 40h8" {...A} />
    </>),
  },
  notebook: {
    alt: "An open notebook with a pen",
    body: (<>
      <path d="M60 18c-10-6-26-6-40-2v50c14-4 30-4 40 2 10-6 26-6 40-2V16c-14-4-30-4-40 2z" {...S} /><path d="M60 18v50" {...S} />
      <path d="M74 52l26-26 6 6-26 26h-6z" {...A} />
    </>),
  },
};

export function EmptyStateArt({ category, size = 120 }: { category: EmptyArtKey | string; size?: number }) {
  const key = (category in ART ? category : "customer") as EmptyArtKey;
  const a = ART[key];
  return (
    <svg className="empty-art" data-testid={`diagram-empty-${key}`} viewBox="0 0 120 80" width={size} height={(size * 2) / 3} role="img" aria-label={a.alt}>
      <title>{a.alt}</title>
      {a.body}
    </svg>
  );
}

/** Empty state with art: says what will appear here and why it is empty now. */
export function ArtEmptyState({ art, title, body, action }: { art: EmptyArtKey | string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="state art-empty" role="status">
      <EmptyStateArt category={art} />
      <div className="state__title">{title}</div>
      {body ? <p className="caption">{body}</p> : null}
      {action}
    </div>
  );
}
