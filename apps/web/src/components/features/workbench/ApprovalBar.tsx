"use client";

import { useEffect, useState } from "react";
import type { Decision, DecisionResponse } from "@/lib/api/types";
import { apiPost } from "@/lib/api/client";
import { usePersona, personaLabel } from "@/lib/persona";
import { Button } from "@/components/ui";
import { inputStyle, labelStyle, type WbPlan } from "./shared";
import type { DecisionOutcome } from "./DecisionResult";

export function ApprovalBar({ plan, onDecided }: { plan: WbPlan; onDecided: (outcome: DecisionOutcome) => void }) {
  const { persona, label } = usePersona();
  const [name, setName] = useState(label);
  const [mode, setMode] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setName(label); }, [label]);

  const send = async (decision: Decision) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiPost<DecisionResponse>(`/plans/${encodeURIComponent(plan.id)}/decision`, {
        decision, reason: decision === "approved" ? (reason.trim() || undefined) : reason.trim(), persona, decided_by: name.trim() || label,
      });
      setMsg({ ok: true, text: r.message });
      setMode(null);
      setReason("");
      onDecided({ decision, planId: plan.id, response: r });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const needsReason = mode === "modified" || mode === "rejected";

  return (
    <div
      role="region"
      aria-label="Plan decision"
      data-testid="approval-bar"
      className="approval-bar"
    >
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-3)", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 2, minWidth: 200 }}>
          <strong>Plan {plan.id} awaiting decision</strong>
          <span className="caption">Needs {personaLabel(plan.requires_role)}{plan.four_eyes ? " and a second, different approver" : ""}. You act as {label}.</span>
        </div>
        <label style={{ ...labelStyle, width: 180 }}>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </label>
        <div className="row" style={{ marginLeft: "auto" }}>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => send("approved")}>Approve</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setMode(mode === "modified" ? null : "modified")} aria-pressed={mode === "modified"}>Modify</Button>
          <Button variant="danger" disabled={busy} onClick={() => setMode(mode === "rejected" ? null : "rejected")} aria-pressed={mode === "rejected"}>Reject</Button>
        </div>
      </div>
      {needsReason ? (
        <div className="row" style={{ marginTop: "var(--sp-2)", alignItems: "flex-end", gap: "var(--sp-2)" }}>
          <label style={{ ...labelStyle, flex: 1 }}>
            Reason ({mode === "modified" ? "what should change" : "why reject"}; required)
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
          </label>
          <Button variant={mode === "rejected" ? "danger" : "primary"} disabled={busy || !reason.trim() || !name.trim()} onClick={() => send(mode!)}>
            {mode === "rejected" ? "Submit rejection" : "Submit modification"}
          </Button>
        </div>
      ) : null}
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className="caption" style={{ margin: "var(--sp-2) 0 0", color: msg.ok ? "var(--green-700)" : "var(--crimson-700)" }}>{msg.text}</p>
      ) : null}
    </div>
  );
}
