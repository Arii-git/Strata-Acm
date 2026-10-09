"use client";

import "@/styles/lanes/agentic.css";
import { IconClock } from "@tabler/icons-react";
import { useSimNow } from "./hooks";
import { simClockText, spanText } from "./time";

const PASSED: Record<string, string> = {
  auto: "passed — agent decided",
  provisional: "passed — agent took a provisional step",
  human_only: "passed — escalated to the Business Head",
};

/**
 * Time left until the decision deadline, measured on the engine's SIMULATED clock (/health sim_now), not the
 * wall clock. Pass `now` when the caller already has sim_now (avoids a fetch).
 */
export function DeadlineCountdown({ deadline, mode, now, status }: { deadline: string | null; mode?: string; now?: string | null; status?: string }) {
  const simNow = useSimNow(now ?? null);
  if (!deadline) return <span className="dl dl--none">No deadline</span>;
  const at = simClockText(deadline);
  if (!simNow) {
    return <span className="dl"><IconClock size={14} stroke={1.5} aria-hidden="true" /><time dateTime={deadline}>by {at}</time></span>;
  }
  const left = new Date(deadline).getTime() - new Date(simNow).getTime();
  const decided = status === "decided";
  let text: string;
  let tone = "dl--ok";
  if (decided) {
    text = `deadline ${at}`;
    tone = "dl--none";
  } else if (left > 0) {
    text = `in ${spanText(left)}`;
    tone = left <= 60 * 60_000 ? "dl--urgent" : left <= 4 * 60 * 60_000 ? "dl--soon" : "dl--ok";
  } else {
    text = PASSED[mode ?? ""] ?? "passed";
    tone = "dl--passed";
  }
  return (
    <span className={`dl ${tone}`} title={`Decision deadline ${at} (simulated clock)`}>
      <IconClock size={14} stroke={1.5} aria-hidden="true" />
      <time dateTime={deadline}>{text}</time>
    </span>
  );
}
