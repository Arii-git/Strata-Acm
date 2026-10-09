"use client";

import { useMemo } from "react";
import type { MemoryMatch } from "@/lib/api/types";
import { Card, DataTable, Details, EmptyState, StatusPill, type ColumnDef } from "@/components/ui";
import { SimilarityBars } from "@/components/diagrams/SimilarityBars";
import { humanize } from "@/lib/format";
import { DRAFT_AUTHOR, MEMORY_NOTE } from "./shared";

export function AuthorCell({ author }: { author: string }) {
  if (author === DRAFT_AUTHOR) return <StatusPill status="draft" tone="warn" label={DRAFT_AUTHOR} />;
  if (author === "strata-system") return <StatusPill status="system" tone="info" label="strata-system (learning loop)" />;
  return <span>{author}</span>;
}

export function MemoryTab({ matches, retrieval }: { matches: MemoryMatch[] | null; retrieval?: string }) {
  const cols = useMemo<ColumnDef<MemoryMatch>[]>(() => [
    { id: "ref", header: "Ref", accessorKey: "ref" },
    { id: "title", header: "Title", accessorKey: "title" },
    { id: "similarity", header: "Similarity", accessorKey: "similarity", meta: { numeric: true }, cell: (c) => c.row.original.similarity.toFixed(3) },
    {
      id: "breakdown", header: "Breakdown", enableSorting: false,
      meta: { help: "similarity = 0.5 x embedding + 0.3 x cause match + 0.2 x signal-pattern overlap" },
      cell: (c) => {
        const b = c.row.original.breakdown;
        return <span className="mono caption">0.5 × embedding {b.embedding.toFixed(2)} + 0.3 × cause {b.cause.toFixed(2)} + 0.2 × pattern {b.pattern.toFixed(2)}</span>;
      },
    },
    { id: "resolution", header: "Resolution", accessorKey: "resolution", cell: (c) => <span className="caption">{c.row.original.resolution}</span> },
    { id: "outcome", header: "Outcome", accessorKey: "outcome", cell: (c) => <StatusPill status={c.row.original.outcome} tone={c.row.original.outcome === "lost" ? "bad" : c.row.original.outcome === "partial" ? "warn" : "ok"} label={humanize(c.row.original.outcome)} /> },
    { id: "authored_by", header: "Authored by", accessorKey: "authored_by", cell: (c) => <AuthorCell author={c.row.original.authored_by} /> },
  ], []);

  if (!matches) return <EmptyState title="No memory retrieved yet" body="Run the investigation to retrieve similar past incidents and SOPs." />;

  return (
    <Card title="What did we do last time?" actions={<span className="chip chip--mono">retrieval: {retrieval ?? "tfidf"}</span>}>
      <SimilarityBars matches={matches} />
      <p className="caption">{MEMORY_NOTE}</p>
      <Details title={`All ${matches.length} matches as a table (resolution, outcome, author)`}>
        <DataTable
          columns={cols}
          data={matches}
          provenance="computed"
          caption="What it is: past incidents and SOPs most similar to this one, scored 0.5 x text similarity (TF-IDF) + 0.3 x same cause + 0.2 x same signal pattern. What it implies: resolutions with a retained outcome are the ones the plan borrows from; 'lost' rows show what not to repeat."
          initialSort={[{ id: "similarity", desc: true }]}
          emptyText="No similar records found."
        />
      </Details>
    </Card>
  );
}
