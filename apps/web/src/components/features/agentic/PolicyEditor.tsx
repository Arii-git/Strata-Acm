"use client";

import "@/styles/lanes/agentic.css";
import { useEffect, useState } from "react";
import { Button, ErrorState, announce } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import { apiPut, qs } from "@/lib/api/client";
import { usePersona } from "@/lib/persona";
import { useAgenticPolicy } from "./hooks";
import { RiskLevelBadge } from "./RiskLevelBadge";
import { LEVELS, LEVEL_LABEL, type AgenticPolicy, type RiskLevel } from "./types";

type Draft = Omit<AgenticPolicy, "updated_by" | "updated_at">;

function modeOf(lv: number, p: Draft): string {
  if (lv <= p.auto_decide_max_level) return "Agent decides at the deadline";
  if (lv <= p.provisional_max_level) return "Agent takes a step you can undo";
  return "Humans only; escalates";
}

const THRESHOLDS: { key: keyof Draft; label: string; hint: string; min: number }[] = [
  { key: "human_threshold", label: "Ask a human from level", hint: "A person is alerted as soon as a case reaches this level.", min: 1 },
  { key: "auto_decide_max_level", label: "Agent may decide up to level", hint: "Below or at this level the agent decides when the deadline passes.", min: 0 },
  { key: "provisional_max_level", label: "Provisional steps up to level", hint: "Up to here the agent prepares internal tasks you can undo. Above: humans only.", min: 0 },
  { key: "email_min_level", label: "Email from level", hint: "Alerts at or above this level are also emailed.", min: 1 },
  { key: "default_level", label: "Default level when unsure", hint: "Used when a case lacks the data to classify.", min: 1 },
];

/** Business-head editor for /agentic/policy (deadlines per level, thresholds). Read-only for every other role. */
export function PolicyEditor() {
  const { persona } = usePersona();
  const canEdit = persona === "business_head";
  const { data, error, loading, reload } = useAgenticPolicy();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      const { updated_by: _b, updated_at: _a, ...rest } = data;
      setDraft({ ...rest, deadlines_hours: { ...rest.deadlines_hours } });
    }
  }, [data]);

  if (loading && !data) return <StrataLoader size="sm" label="Loading the policy" />;
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load the decision policy" />;
  if (!draft || !data) return null;

  const setNum = (k: keyof Draft, v: number) => setDraft({ ...draft, [k]: v });
  const setHours = (lv: RiskLevel, v: number) => setDraft({ ...draft, deadlines_hours: { ...draft.deadlines_hours, [String(lv)]: v } });
  const invalid = draft.auto_decide_max_level > draft.provisional_max_level
    || LEVELS.some((lv) => !(Number(draft.deadlines_hours[String(lv)]) >= 0.25));

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiPut<AgenticPolicy>(qs("/agentic/policy", { persona }), draft);
      setMsg({ ok: true, text: "Saved. New deadlines apply to every open case now." });
      announce("Decision policy saved.");
      reload();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Could not save.";
      setMsg({ ok: false, text });
      announce(`Could not save the policy: ${text}`, "assertive");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="policy" data-testid="policy-editor">
      <p className="caption">
        {canEdit
          ? "You set how long people have to decide at each level, and how much the agent may do when time runs out."
          : "Set by the Business Head. Shown here so everyone knows when the agent steps in."}
        {data.updated_by ? ` Last changed by ${data.updated_by}.` : " Using the default policy."}
      </p>
      <table className="policy__table">
        <caption className="sr-only">Decision deadline and agent behaviour per risk level</caption>
        <thead><tr><th scope="col">Level</th><th scope="col">Time to decide</th><th scope="col">If nobody decides</th></tr></thead>
        <tbody>
          {LEVELS.map((lv) => (
            <tr key={lv}>
              <th scope="row"><RiskLevelBadge level={lv} /></th>
              <td>
                {canEdit ? (
                  <label className="policy__hours">
                    <span className="sr-only">Hours to decide at level {lv} ({LEVEL_LABEL[lv]})</span>
                    <input type="number" min={0.25} max={720} step={0.25} inputMode="decimal"
                      value={draft.deadlines_hours[String(lv)] ?? ""}
                      onChange={(e) => setHours(lv, Number(e.target.value))} />
                    <span aria-hidden="true">h</span>
                  </label>
                ) : <span className="mono">{draft.deadlines_hours[String(lv)]} h</span>}
              </td>
              <td className="policy__mode">{modeOf(lv, draft)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">Hours run on the simulated clock from when the case was detected. Regulatory cases are always humans-only with four-eyes.</p>
      <dl className="policy__thresholds">
        {THRESHOLDS.map((t) => (
          <div key={t.key}>
            <dt><label htmlFor={`pol-${t.key}`}>{t.label}</label></dt>
            <dd>
              {canEdit ? (
                <select id={`pol-${t.key}`} value={Number(draft[t.key])} onChange={(e) => setNum(t.key, Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5].filter((n) => n >= t.min).map((n) => (
                    <option key={n} value={n}>{n === 0 ? "None" : `L${n} · ${LEVEL_LABEL[n as RiskLevel]}`}</option>
                  ))}
                </select>
              ) : <span id={`pol-${t.key}`}>{Number(draft[t.key]) === 0 ? "None" : `L${draft[t.key]}`}</span>}
              <span className="caption">{t.hint}</span>
            </dd>
          </div>
        ))}
      </dl>
      {canEdit ? (
        <div className="row policy__save">
          <Button variant="primary" size="sm" onClick={save} disabled={saving || invalid} aria-describedby={invalid ? "pol-invalid" : undefined}>
            {saving ? "Saving…" : "Save policy"}
          </Button>
          {invalid ? <span id="pol-invalid" className="caption">Check the values: every deadline needs at least 0.25 h, and the agent&apos;s decide limit cannot exceed the provisional limit.</span> : null}
          {msg ? <span role="status" className={msg.ok ? "policy__ok" : "policy__err"}>{msg.text}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
