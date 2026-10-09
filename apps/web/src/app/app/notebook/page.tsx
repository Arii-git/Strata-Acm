"use client";

import { useState } from "react";
import { PageHeader, Card, EmptyState, ErrorState, Loading, Button } from "@/components/ui";
import { useApi, apiPost, ApiError } from "@/lib/api/client";
import { fmtDate } from "@/lib/format";

interface Entry { id?: string; author: string; tried: string; happened: string; changed?: string | null; evidence?: string | null; created_at?: string }
interface NotebookResp { items: Entry[]; rule?: string }

const RULE = "Authored by humans only. Strata never writes entries here.";

const fieldStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", background: "var(--surface)",
  padding: "var(--sp-2) var(--sp-3)", fontSize: "var(--fs-14)",
};

/** FastAPI 422 → readable lines; plain `detail` strings pass through. */
function validationMessages(e: unknown): string[] {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "detail" in e.body) {
    const d = (e.body as { detail: unknown }).detail;
    if (Array.isArray(d)) {
      return d.map((x: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(x.loc) ? String(x.loc[x.loc.length - 1]) : "body";
        return `${field}: ${x.msg ?? "invalid"}`;
      });
    }
    return [String(d)];
  }
  return [e instanceof Error ? e.message : String(e)];
}

const EMPTY = { author: "", tried: "", happened: "", changed: "", evidence: "" };

function Field({ id, label, value, onChange, multiline, required, hint }: {
  id: keyof typeof EMPTY; label: string; value: string; onChange: (v: string) => void; multiline?: boolean; required?: boolean; hint?: string;
}) {
  return (
    <label className="stack" style={{ gap: "var(--sp-1)" }} htmlFor={`nb-${id}`}>
      <span style={{ fontSize: "var(--fs-13)", fontWeight: 500 }}>{label}{required ? " (required)" : ""}</span>
      {multiline
        ? <textarea id={`nb-${id}`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle} />
        : <input id={`nb-${id}`} value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle} />}
      {hint ? <span className="caption">{hint}</span> : null}
    </label>
  );
}

export default function NotebookPage() {
  const { data, error, loading, reload } = useApi<NotebookResp>("/notebook");
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErrors([]);
    const body: Record<string, string> = { author: form.author, tried: form.tried, happened: form.happened };
    if (form.changed.trim()) body.changed = form.changed;
    if (form.evidence.trim()) body.evidence = form.evidence;
    try { await apiPost("/notebook", body); setForm(EMPTY); reload(); }
    catch (err) { setErrors(validationMessages(err)); }
    finally { setSaving(false); }
  };

  const items = data?.items ?? [];

  return (
    <div className="stack">
      <PageHeader question="What did we try, what failed, what did we change?" title="Engineering Notebook" />
      <div role="note" style={{ border: "1px solid var(--line-strong)", borderLeft: "4px solid var(--indigo-800)", background: "var(--surface)", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-4)", fontWeight: 600, fontSize: "var(--fs-14)" }}>
        {data?.rule ?? RULE}
      </div>
      <div className="grid grid--2" style={{ alignItems: "start" }}>
        <Card title="Entries">
          {loading && !data ? <Loading rows={4} label="Loading notebook" />
            : error ? <ErrorState error={error} onRetry={reload} />
            : items.length === 0 ? (
              <EmptyState title="No entries yet" body="What did we try? What happened? What did we change because of it?" />
            ) : (
              <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {items.map((n, i) => (
                  <li key={n.id ?? i} style={{ borderBottom: "1px solid var(--line)", paddingBottom: "var(--sp-3)" }}>
                    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--fs-13)" }}>{n.author}</span>
                      <span className="muted" style={{ fontSize: "var(--fs-12)" }}>{n.created_at ? fmtDate(n.created_at, true) : ""}</span>
                    </div>
                    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "var(--sp-1) var(--sp-3)", fontSize: "var(--fs-13)", margin: "var(--sp-2) 0 0" }}>
                      <dt className="muted">Tried</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.tried}</dd>
                      <dt className="muted">Happened</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.happened}</dd>
                      {n.changed ? <><dt className="muted">Changed</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.changed}</dd></> : null}
                      {n.evidence ? <><dt className="muted">Evidence</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>
                        {/^https?:\/\//.test(n.evidence) ? <a href={n.evidence} target="_blank" rel="noreferrer noopener">{n.evidence}</a> : <span className="mono">{n.evidence}</span>}
                      </dd></> : null}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
        </Card>
        <Card title="Add an entry">
          <form onSubmit={submit} className="stack" noValidate>
            <Field id="author" label="Your name" value={form.author} onChange={set("author")} required />
            <Field id="tried" label="What did we try?" value={form.tried} onChange={set("tried")} multiline required />
            <Field id="happened" label="What happened?" value={form.happened} onChange={set("happened")} multiline required />
            <Field id="changed" label="What did we change because of it?" value={form.changed} onChange={set("changed")} multiline />
            <Field id="evidence" label="Evidence link" value={form.evidence} onChange={set("evidence")} hint="A commit, screenshot, eval run or audit row." />
            {errors.length ? (
              <div role="alert" style={{ color: "var(--crimson-700)", fontSize: "var(--fs-13)" }}>
                <div style={{ fontWeight: 600 }}>The engine rejected this entry:</div>
                <ul style={{ margin: "var(--sp-1) 0 0", paddingLeft: "var(--sp-5)" }}>{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            ) : null}
            <div className="row"><Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Add entry"}</Button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
