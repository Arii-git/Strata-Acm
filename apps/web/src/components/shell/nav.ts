import {
  IconArrowsExchange, IconBooks, IconBuildingStore, IconChartBar, IconChecklist, IconClockHour4, IconFlask, IconHeartbeat,
  IconHelp, IconHome, IconLayoutKanban, IconList, IconListSearch, IconNews, IconNotebook, IconPlugConnected, IconShieldCheck,
  IconSitemap, IconTargetArrow, IconTrendingUp, type Icon,
} from "@tabler/icons-react";

export interface NavItem {
  label: string;
  href: string;
  /** second key of the `g <key>` shortcut */
  key: string;
  icon: Icon;
  /** one plain line: what you find there (tooltip + shown under the label when the sidebar is expanded) */
  hint: string;
}
export interface NavSection { id: string; label: string; items: NavItem[] }

/**
 * Sidebar IA in plain words (review 1, lane A). Groups follow the loop: Start → Watch → Problems → Investigate →
 * Remember → Act → Review → Lab → Help. In Simple mode the Sidebar folds Review + Lab into "For reviewers".
 */
export const NAV: NavSection[] = [
  { id: "start", label: "Start", items: [
    { label: "Home", href: "/app", key: "g", icon: IconHome, hint: "Choose where to start" },
    { label: "Today's briefing", href: "/app/briefing", key: "b", icon: IconNews, hint: "What STRATA found since the last scan" },
    { label: "How STRATA works", href: "/app/how-it-works", key: "y", icon: IconSitemap, hint: "The loop and the safeguards" },
  ] },
  { id: "watch", label: "Watch", items: [
    { label: "Business health", href: "/app/health", key: "h", icon: IconHeartbeat, hint: "Overall health and what drags it" },
    { label: "Sources & signals", href: "/app/sources", key: "s", icon: IconPlugConnected, hint: "Is the data fresh enough to trust" },
  ] },
  { id: "problems", label: "Problems", items: [
    { label: "Problems board", href: "/app/problems", key: "r", icon: IconLayoutKanban, hint: "Every problem by workflow stage" },
    { label: "Problem list", href: "/app/risks", key: "v", icon: IconList, hint: "The same problems as a table" },
    { label: "Opportunities", href: "/app/opportunities", key: "o", icon: IconTrendingUp, hint: "Growth we are not acting on" },
    { label: "Accounts", href: "/app/accounts", key: "a", icon: IconBuildingStore, hint: "Every customer and its risk" },
  ] },
  { id: "investigate", label: "Investigate", items: [
    { label: "Cases", href: "/app/incidents", key: "i", icon: IconListSearch, hint: "One problem from cause to plan" },
  ] },
  { id: "remember", label: "Remember", items: [
    { label: "Organizational memory", href: "/app/memory", key: "m", icon: IconBooks, hint: "Past cases, SOPs and outcomes" },
  ] },
  { id: "act", label: "Act", items: [
    { label: "Approvals", href: "/app/approvals", key: "p", icon: IconChecklist, hint: "Plans waiting for your decision" },
    { label: "Workflows & handoffs", href: "/app/workflows", key: "w", icon: IconArrowsExchange, hint: "Tasks and drafts (simulated)" },
    { label: "Outcomes", href: "/app/outcomes", key: "u", icon: IconTargetArrow, hint: "Did the plan work" },
  ] },
  { id: "review", label: "Review", items: [
    { label: "Time-to-action", href: "/app/time-to-action", key: "t", icon: IconClockHour4, hint: "How fast a signal becomes a plan" },
    { label: "Evaluation", href: "/app/evaluation", key: "e", icon: IconChartBar, hint: "How good STRATA is, misses included" },
    { label: "Audit trail", href: "/app/audit", key: "l", icon: IconShieldCheck, hint: "Every decision, tamper-evident" },
  ] },
  { id: "lab", label: "Lab", items: [
    { label: "Simulation lab", href: "/app/lab", key: "x", icon: IconFlask, hint: "Inject a scenario, watch the loop" },
    { label: "Engineering notebook", href: "/app/notebook", key: "n", icon: IconNotebook, hint: "What the team tried (human-written)" },
  ] },
  { id: "help", label: "Help", items: [
    { label: "Help & glossary", href: "/app/help", key: "q", icon: IconHelp, hint: "What every number and term means" },
  ] },
];

/** Groups folded into one collapsible "For reviewers" group in Simple mode. */
export const REVIEWER_SECTION_IDS = ["review", "lab"];

/** The sections as shown for a view mode. Simple mode merges Review + Lab into "For reviewers" (still reachable). */
export function navForMode(mode: "simple" | "detailed"): (NavSection & { collapsible?: boolean })[] {
  if (mode === "detailed") return NAV;
  const out: (NavSection & { collapsible?: boolean })[] = [];
  const reviewers: NavItem[] = NAV.filter((s) => REVIEWER_SECTION_IDS.includes(s.id)).flatMap((s) => s.items);
  for (const s of NAV) {
    if (s.id === REVIEWER_SECTION_IDS[0]) out.push({ id: "reviewers", label: "For reviewers", items: reviewers, collapsible: true });
    else if (!REVIEWER_SECTION_IDS.includes(s.id)) out.push(s);
  }
  return out;
}

export const NAV_ITEMS: (NavItem & { section: string })[] = NAV.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })));

/** Longest-prefix match: /app matches Home only exactly; /app/briefing → Briefing; /app/incidents/INC-1 → Cases. */
export function activeItem(pathname: string): (NavItem & { section: string }) | undefined {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (p === "/app") return NAV_ITEMS.find((i) => i.href === "/app");
  if (p.startsWith("/app/cases/")) return NAV_ITEMS.find((i) => i.href === "/app/incidents");
  return NAV_ITEMS.filter((i) => i.href !== "/app" && (p === i.href || p.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
