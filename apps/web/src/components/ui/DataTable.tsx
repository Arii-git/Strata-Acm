"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { IconArrowDown, IconArrowUp, IconArrowsSort } from "@tabler/icons-react";
import type { Provenance } from "@/lib/api/types";
import { ProvenanceBadge } from "./Caption";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** render cells in IBM Plex Mono (IDs, refs, timestamps). Columns with id "id"/"ref" are mono automatically. */
    mono?: boolean;
    /** right-align (numbers) */
    numeric?: boolean;
    /** header tooltip: column definition */
    help?: string;
  }
}

export interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack column value types are heterogeneous
  columns: ColumnDef<T, any>[];
  data: T[];
  /** REQUIRED: one provenance badge per table */
  provenance: Provenance;
  /** REQUIRED: what the table shows and what it implies */
  caption: string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  /** initial sort, e.g. [{ id: "risk_score", desc: true }] */
  initialSort?: SortingState;
  maxHeight?: number;
}

const MONO_IDS = new Set(["id", "ref", "incident_ref", "plan_id", "incident_id", "account_id", "run_id"]);

export function DataTable<T>({ columns, data, provenance, caption, onRowClick, emptyText = "No rows.", initialSort = [], maxHeight }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="dt">
      <div className="dt__scroll" style={maxHeight ? { maxHeight } : undefined}>
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  const label = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                  return (
                    <th
                      key={h.id}
                      className={meta?.numeric ? "is-num" : undefined}
                      title={meta?.help}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {canSort ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()}>
                          {label}
                          {sorted === "asc" ? <IconArrowUp size={12} aria-hidden="true" /> : sorted === "desc" ? <IconArrowDown size={12} aria-hidden="true" /> : <IconArrowsSort size={12} aria-hidden="true" style={{ opacity: 0.4 }} />}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="muted" style={{ textAlign: "center" }}>{emptyText}</td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={onRowClick ? "is-clickable" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row.original); } } : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    const mono = meta?.mono ?? MONO_IDS.has(cell.column.id);
                    const cls = [mono ? "is-mono" : "", meta?.numeric ? "is-num" : ""].filter(Boolean).join(" ");
                    return (
                      <td key={cell.id} className={cls || undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="dt__foot">
        <ProvenanceBadge provenance={provenance} />
        <p className="caption">{caption}</p>
      </div>
    </div>
  );
}
