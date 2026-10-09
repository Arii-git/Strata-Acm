"use client";

import { EmptyState, ErrorState, EventRow, Loading } from "@/components/ui";
import { useEvents } from "./useEvents";

/**
 * Reusable event feed over GET /events (newest first by default). Renders only through EventRow, so every
 * event shown anywhere has a defined type, icon, verb phrase and link.
 */
export function EventFeed({
  limit = 20, incident, order = "newest", title = "Recent activity", emptyText = "No activity recorded yet.",
}: { limit?: number; incident?: string; order?: "newest" | "causal"; title?: string | null; emptyText?: string }) {
  const { data, error, loading, reload } = useEvents(incident, limit);
  const items = data?.items ?? [];
  const shown = order === "newest" ? [...items].reverse() : items;
  return (
    <section className="event-feed" aria-label={title ?? "Activity"} data-testid="event-feed">
      {title ? <h2 className="section-label">{title}</h2> : null}
      <div aria-live="polite">
        {loading && !data ? <Loading rows={4} label="Loading activity" /> : error && !data ? (
          <ErrorState error={error} onRetry={reload} title="Could not load activity" />
        ) : !shown.length ? (
          <EmptyState title={emptyText} />
        ) : (
          <ul className="event-list">
            {shown.map((e) => <EventRow key={e.id} event={e} showIncident={!incident} />)}
          </ul>
        )}
      </div>
    </section>
  );
}
