"use client";

import { EmptyState, ErrorState, EventRow, Loading, type EventItem } from "@/components/ui";
import type { ApiState } from "@/lib/api/client";
import { fmtDate } from "@/lib/format";
import { useEvents, type EventsResponse } from "./useEvents";

/** Day key on the simulated clock (the `at` field keeps its +05:30 offset; no timezone shift). */
function dayOf(e: EventItem): string {
  return (e.at || e.wall_at).slice(0, 10);
}

function TimelineView({ state, incident }: { state: ApiState<EventsResponse>; incident: string }) {
  const { data, error, loading, reload } = state;
  if (loading && !data) return <Loading rows={5} label="Loading this case's events" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} title="Could not load the case timeline" />;
  const items = data?.items ?? [];
  if (!items.length) return <EmptyState title="No events yet" body={`Nothing has been recorded for ${incident} yet.`} />;

  const groups: { day: string; items: EventItem[] }[] = [];
  for (const e of items) {
    const d = dayOf(e);
    const last = groups[groups.length - 1];
    if (last && last.day === d) last.items.push(e);
    else groups.push({ day: d, items: [e] });
  }
  return (
    <div className="case-timeline__groups">
      {groups.map((g) => (
        <section key={g.day} aria-label={`Events on ${fmtDate(g.day)}`}>
          <h3 className="case-timeline__day">{fmtDate(g.day)} <span className="muted">(simulated day)</span></h3>
          <ul className="event-list">
            {g.items.map((e) => <EventRow key={e.id} event={e} showIncident={false} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FetchingTimeline({ incident }: { incident: string }) {
  const state = useEvents(incident);
  return <TimelineView state={state} incident={incident} />;
}

/**
 * This case's events from GET /events?incident=, grouped by simulated day, oldest first (causal order),
 * each rendered through EventRow. Pass `state` from useEvents() when the page already fetched them.
 */
export function CaseTimeline({ incident, state }: { incident: string; state?: ApiState<EventsResponse> }) {
  return (
    <section className="case-timeline" aria-label="Case timeline" data-testid="case-timeline">
      <h2 className="section-label">Case timeline</h2>
      <p className="caption">Every step on this case, in the order it happened. Grouped by simulated day; times are when the action was taken.</p>
      <div aria-live="polite">
        {state ? <TimelineView state={state} incident={incident} /> : <FetchingTimeline incident={incident} />}
      </div>
    </section>
  );
}
