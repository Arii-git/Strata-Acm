# DEFEND IT — one paragraph per built feature (read before pitching; cut anything you cannot explain)

**Synthetic data estate.** `data/generator.py` builds 240 fictional B2B accounts over 104 weeks: orders, tickets, complaints, CRM touches, warehouse stock and receivables. It plants scenarios S01 and S04–S12 from `contracts/scenarios.yaml` and writes ground truth to `eval_labels.json`, which the engine never reads. Limits: weekly order grain; S02/S03 not planted; the hero's complaint and touchpoint totals are designed relative to that account's own baseline.

**Signals (Sentinel core).** For each account, the last 4 weeks are compared with the account's own rolling 4-week history: robust z = (x − median) / (1.4826·MAD), with a MAD floor. Orders are divided by a prior-year week-of-year index, and a common-mode move is subtracted when more than 60% of accounts move the same way. That is how the festival dip (S11) stays silent. A signal is adverse at |z| ≥ 2 in its adverse direction.

**Risk score and severity.** Noisy-OR: each adverse signal is a witness p = weight × min(1, |z|/4), and risk = 1 − Π(1 − p). This is multiplied by source diversity (0.55 / 0.80 / 1.0), and anything with fewer than 3 source systems is capped at elevated. An incident needs a score of at least 50. It is explainable: every number traces to a signal row.

**Revenue exposure (A1).** The account's baseline 12-week order value (median 4-week value × 3). It is exposure, not a forecast of loss.

**Silent period (A2).** Days from the CUSUM-estimated onset until an assumed weekly manual review would flag it (the review flags a drop of more than 25% month on month). It is labelled `assumption`.

**Blast radius (A3).** Other buyers of the short SKU whose fill rate on that SKU fell below 0.92. For the hero there are 6, matching the planted design.

**Alert budget (A4).** At most 7 items per persona, ranked by exposure × confidence × urgency. The rest are listed as held back, with the reason.

**QA routing (A7).** Quality complaints on one batch from at least 2 accounts within 21 days, or adverse-event wording, always create an incident for the QA Head with four-eyes. Strata only routes these: it gives no clinical advice and drafts nothing patient-facing. Only `qa_head` can approve, and two different names are required.

**Investigator.** Fixed cause rules from the catalog. Keyless confidence = 0.6 × weighted share of conditions met + 0.4 × share of evidence weight explained (tuned on seed A only; see OPEN_QUESTIONS Q5).

**Memory.** TF-IDF over the 24 incident and 10 SOP DRAFT items. Similarity = 0.5 × cosine + 0.3 × cause match + 0.2 × signal-pattern Jaccard, and the breakdown is shown.

**Evidence-or-Silence (A14).** Every narrative sentence must cite an evidence ID that exists for the incident, and every number in it must appear in the evidence payload, the memory refs or the rule text. Otherwise the sentence is dropped and logged. The output is a template (keyless), so no LLM writes numbers.

**Orchestrator, approval, tasks, drafts (A16).** The plan is the SOP steps plus the steps of the best same-cause memory record. Approve, Modify or Reject (reasons required for the last two; rejections are stored as negative memory). Approval creates simulated tasks and WhatsApp/email drafts, and nothing is ever sent.

**Audit.** Every detection, agent step, decision, task, note and routine run is chained with sha256(prev_hash ‖ canonical row). `/audit/verify` recomputes the chain and finds tampering (this is tested).

**Time-to-Action.** Wall-clock seconds from the detection audit row to the approval audit row. It is real human reaction time in the prototype. The 15-minute manual figure is illustrative.

**Lab (A12-lite) and outcomes.** Inject applies the S01 pattern to a healthy stockist's rows (it acts as a data source), and the engine must detect it from those rows. Advance 14 days applies a scripted counterfactual (the planted effect reduced by 75%), labelled `illustrative`, and writes an outcome memory item authored by `strata-system`.

**Accounts and next-best-actions (A21).** Deterministic rules ER01–ER07 from `engagement_rules.yaml`, filled only from computed fields and citing evidence. At most 3 are shown.

**Standing routines (A22).** RT01–RT04 are approved once by a human. They run only when the Lab advances time or on `npm run routines:tick`. They create internal digests, tasks, drafts and nudges, all simulated and audited.

**Notes (A10).** Role-addressed notes with `@role` mentions. Notes appear in the mentioned persona's Briefing and are audited.

**Evaluation (A17).** Seed A (tuning) and seed B (hold-out, never tuned): precision, recall and root-cause accuracy per scenario, with misses shown. Seed B is the same generator with a different random draw, so it is not independent validation.
