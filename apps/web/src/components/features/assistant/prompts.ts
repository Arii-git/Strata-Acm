/** Suggested prompts for the current page. Every prompt is one the keyless router can answer too. */
export function suggestedPrompts(pathname: string | null): string[] {
  const p = pathname ?? "/app";
  const caseRef = p.match(/INC-\d{4}-\d{3,5}/i)?.[0]?.toUpperCase();
  if (caseRef) {
    return [`Explain ${caseRef}`, "What evidence supports this case?", "Have we seen this case before?", "Who should act on this case?"];
  }
  const acc = p.match(/\/accounts\/(\d+)/)?.[1];
  if (acc) {
    return [`Summarise account ${acc}`, `What should we do next for account ${acc}?`, "What needs me today?"];
  }
  if (p.startsWith("/app/lab")) return ["Which simulations can I run?", "What needs me today?", "How is the business doing?"];
  if (p.startsWith("/app/memory")) return ["Search memory for supplier delay", "Search memory for complaints after a tool migration", "What needs me today?"];
  if (p.startsWith("/app/health")) return ["How is the business doing?", "Where is money most exposed?", "What changed this week?"];
  if (p.startsWith("/app/approvals") || p.startsWith("/app/agents")) {
    return ["Which decisions are waiting?", "What needs me today?", "How is the business doing?"];
  }
  if (p.startsWith("/app/accounts")) return ["Tell me about account 4821", "What needs me today?", "Where is money most exposed?"];
  if (p.startsWith("/app/opportunities")) return ["Which opportunities are open?", "What needs me today?", "How is the business doing?"];
  if (p.startsWith("/app/incidents") || p.startsWith("/app/cases") || p.startsWith("/app/problems") || p.startsWith("/app/risks")) {
    return ["Which cases need me first?", "Where is money most exposed?", "What changed this week?", "Which decisions are waiting?"];
  }
  return ["What needs me today?", "Summarise the top problem", "How is the business doing?", "What changed this week?"];
}
