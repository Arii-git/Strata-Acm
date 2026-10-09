"use client";

import { useEffect, useState } from "react";
import { ErrorState, Metric, MetricGroup, PageTemplate, Tabs } from "@/components/ui";
import { StrataLoader } from "@/components/ui/Loader";
import { useApi } from "@/lib/api/client";
import { fmtNum } from "@/lib/format";
import { CompareView } from "@/components/features/lab/CompareView";
import { LiveLoop } from "@/components/features/lab/LiveLoop";
import { ScenarioPicker } from "@/components/features/lab/ScenarioPicker";
import { SimPlayer } from "@/components/features/lab/SimPlayer";
import type { SimCatalog } from "@/components/features/lab/types";

type View = { kind: "pick" } | { kind: "play"; id: string } | { kind: "compare"; category: string };

/** Deep links: /app/lab?scenario=<id> opens a scenario, /app/lab?compare=<category> opens the comparison. */
function readView(): View {
  if (typeof window === "undefined") return { kind: "pick" };
  const q = new URLSearchParams(window.location.search);
  const id = q.get("scenario");
  const cat = q.get("compare");
  return id ? { kind: "play", id } : cat ? { kind: "compare", category: cat } : { kind: "pick" };
}

function writeView(v: View) {
  const q = v.kind === "play" ? `?scenario=${encodeURIComponent(v.id)}` : v.kind === "compare" ? `?compare=${encodeURIComponent(v.category)}` : "";
  window.history.replaceState(null, "", `/app/lab${q}`);
}

export default function LabPage() {
  const catalog = useApi<SimCatalog>("/sim/catalog");
  const [view, setView] = useState<View>({ kind: "pick" });
  const [industry, setIndustry] = useState("all");
  const [tab, setTab] = useState("library");

  useEffect(() => { setView(readView()); }, []);
  const go = (v: View) => { setView(v); setTab("library"); writeView(v); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const c = catalog.data;
  const library = catalog.error ? <ErrorState error={catalog.error} onRetry={catalog.reload} />
    : !c ? <div className="lab-loading"><StrataLoader size="lg" label="Loading the scenario library" /></div>
    : view.kind === "play" ? <SimPlayer key={view.id} scenarioId={view.id} onExit={() => go({ kind: "pick" })} onCompare={(category) => go({ kind: "compare", category })} />
    : view.kind === "compare" ? <CompareView category={view.category} onBack={() => go({ kind: "pick" })} onOpen={(id) => go({ kind: "play", id })} />
    : <ScenarioPicker catalog={c} industry={industry} onIndustry={setIndustry} onPick={(s) => go({ kind: "play", id: s.id })} />;

  return (
    <PageTemplate
      explainKey="lab"
      title="Simulation Lab"
      question="What happens to a business when something goes wrong, with and without STRATA?"
      glance={view.kind === "pick" && c ? (
        <MetricGroup title="Scenario library">
          <Metric label="Scenarios" value={fmtNum(c.scenarios.length)} unit="ready to run"
            meaning="Business problems you can play out week by week, from floods to price wars."
            implication="Pick one below and watch it unfold." provenance="illustrative" />
          <Metric label="Business types" value={fmtNum(c.industries.length)} unit="industries"
            meaning="Pharma, FMCG, manufacturing, e-commerce, logistics and food each get their own versions."
            implication="Filter by the type of company you care about." provenance="illustrative" />
          <Metric label="Kinds of issue" value={fmtNum(c.categories.length)} unit="issue types"
            meaning="Disasters, late shipments, damage in transit, supplier failure, recalls, strikes and more."
            implication="Open any issue type to compare it across industries." provenance="illustrative" />
        </MetricGroup>
      ) : undefined}
    >
      <Tabs label="Lab mode" value={tab} onChange={setTab} tabs={[
        { id: "library", label: "Scenario library", content: library },
        { id: "live", label: "Live loop on today's data", content: <LiveLoop /> },
      ]} />
    </PageTemplate>
  );
}
