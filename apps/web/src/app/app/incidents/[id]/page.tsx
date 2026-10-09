"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useApi } from "@/lib/api/client";
import { Button, ErrorState, ExplainDrawer, Loading, PageTemplate } from "@/components/ui";
import type { WbIncident } from "@/components/features/workbench/shared";
import { prefersReducedMotion } from "@/components/features/workbench/shared";
import type { DecisionOutcome } from "@/components/features/workbench/DecisionResult";
import { CasePipeline, pipeLabel } from "@/components/features/workbench/CasePipeline";
import { CaseSummary } from "@/components/features/workbench/CaseSummary";
import { StageView } from "@/components/features/workbench/CaseStages";
import { NotesPanel } from "@/components/features/workbench/PlanTab";
import { Disclosure } from "@/components/features/workbench/Disclosure";
import { PIPE, PIPE_INDEX, parseStage, pipeFromWorkflow, type PipeKey } from "@/components/features/workbench/pipeline";
import { useAgenticLevels } from "@/components/features/problems/levels";
import { CaseTimeline } from "@/components/features/events/CaseTimeline";
import { useEvents } from "@/components/features/events/useEvents";

/**
 * The case file as ONE pipeline: Detected → Investigate → Recall → Plan → Approve → Act → Learn.
 * The URL carries the step (?stage=), so back/forward and reload land on the same step. Old ?tab= links still resolve.
 * /app/cases/{id} redirects here.
 */
export default function CaseFilePage() {
  return (
    <Suspense fallback={<Loading rows={10} label="Loading the case" />}>
      <CaseFile />
    </Suspense>
  );
}

type Dir = "enter" | "fwd" | "back";

function CaseFile() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params.id ?? ""));
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { data, error, loading, reload } = useApi<WbIncident>(id ? `/incidents/${encodeURIComponent(id)}` : null);
  const events = useEvents(id || null);
  const reloadEvents = events.reload;
  const levels = useAgenticLevels();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionOutcome | null>(null);
  const [explain, setExplain] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const userMoved = useRef(false);

  const inc = data;
  const qStage = sp.get("stage");
  const qTab = sp.get("tab");
  const stage: PipeKey | null = inc
    ? parseStage(qStage, qTab, { planAwaiting: inc.plan?.status === "awaiting_approval", acted: inc.tasks.length > 0 }) ?? pipeFromWorkflow(inc.stage)
    : null;

  // Keep ?stage= in the URL (and retire legacy ?tab=) so a reload never jumps when the case moves on.
  useEffect(() => {
    if (!stage || (qStage === stage && !qTab)) return;
    const next = new URLSearchParams(sp.toString());
    next.delete("tab");
    next.set("stage", stage);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [stage, qStage, qTab, sp, pathname, router]);

  // Direction of the slide: forward when moving right along the pipeline, back when moving left.
  const [anim, setAnim] = useState<{ key: PipeKey | null; dir: Dir }>({ key: null, dir: "enter" });
  if (stage && anim.key !== stage) {
    setAnim({ key: stage, dir: anim.key == null ? "enter" : PIPE_INDEX[stage] >= PIPE_INDEX[anim.key] ? "fwd" : "back" });
  }

  const go = useCallback((k: PipeKey) => {
    const next = new URLSearchParams(window.location.search);
    next.delete("tab");
    if (next.get("stage") === k) return;
    next.set("stage", k);
    userMoved.current = true;
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [router, pathname]);

  // After a user-initiated move: bring the stage top into view under the sticky header and move focus to its heading.
  useEffect(() => {
    if (!stage || !userMoved.current) return;
    userMoved.current = false;
    const body = bodyRef.current;
    if (body) {
      const headBottom = headRef.current ? headRef.current.getBoundingClientRect().bottom : 0;
      const top = body.getBoundingClientRect().top;
      if (top < headBottom || top > window.innerHeight * 0.6) {
        window.scrollTo({ top: Math.max(0, window.scrollY + top - headBottom - 8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    }
    document.getElementById("case-stage-heading")?.focus({ preventScroll: true });
  }, [stage]);

  const reloadAll = useCallback(() => { reload(); reloadEvents(); }, [reload, reloadEvents]);
  const onChip = useCallback((evId: string) => { setHighlight(evId); go("detected"); }, [go]);
  const onDecided = useCallback((o: DecisionOutcome) => { setDecision(o); reloadAll(); }, [reloadAll]);

  const header = { explainKey: "case", title: "Case", question: "What happened, why, and what should we do?" };
  if (loading && !data) return <PageTemplate {...header}><Loading rows={10} label="Loading the case" /></PageTemplate>;
  if (error && !data) return <PageTemplate {...header}><ErrorState error={error} onRetry={reload} title="Could not load this case" /></PageTemplate>;
  if (!inc || !stage) return null;

  const idx = PIPE_INDEX[stage];
  const prev = idx > 0 ? PIPE[idx - 1] : null;
  const next = idx < PIPE.length - 1 ? PIPE[idx + 1] : null;
  const level = levels?.get(inc.ref) ?? null;

  return (
    <div className="page-template case-page" data-testid="page-template">
      <nav className="case-crumb" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/app/problems">Problems</Link></li>
          <li><Link href={`${pathname}?stage=${pipeFromWorkflow(inc.stage)}`} title={inc.title}>{inc.title}</Link></li>
          <li aria-current="page">{pipeLabel(stage)}</li>
        </ol>
      </nav>

      <div className="case-head" ref={headRef}>
        <CaseSummary inc={inc} level={level} onExplain={() => setExplain(true)} />
        <CasePipeline stage={inc.stage} viewing={stage} onSelect={go} />
      </div>

      <div className="case-body" ref={bodyRef}>
        <div className="case-body__main">
          <section
            key={stage}
            className={`case-stage-view case-stage-view--${anim.dir}`}
            aria-labelledby="case-stage-heading"
            data-stage={stage}
          >
            <StageView
              stage={stage} inc={inc} onChanged={reloadAll} onChip={onChip} highlight={stage === "detected" ? highlight : null}
              decision={decision} onDecided={onDecided} go={go} level={level}
            />
          </section>

          <nav className="case-stepnav" aria-label="Move through the pipeline" data-testid="stage-next">
            {prev ? (
              <Button variant="ghost" onClick={() => go(prev.key)}>
                <IconArrowLeft size={16} stroke={1.75} aria-hidden="true" /> Back: {prev.label}
              </Button>
            ) : <span />}
            {next ? (
              <Button variant="secondary" onClick={() => go(next.key)}>
                Next: {next.label} <IconArrowRight size={16} stroke={1.75} aria-hidden="true" />
              </Button>
            ) : <Link href="/app/problems" className="btn btn--secondary">Back to Problems</Link>}
          </nav>
        </div>

        <aside className="case-body__rail" aria-label="Case history">
          <CaseTimeline incident={inc.ref} state={events} />
          <Disclosure label="Notes" hint={`${(inc.notes ?? []).length}`}>
            <NotesPanel incident={inc} onChanged={reloadAll} />
          </Disclosure>
        </aside>
      </div>

      <ExplainDrawer pageKey="case" open={explain} onClose={() => setExplain(false)} />
    </div>
  );
}
