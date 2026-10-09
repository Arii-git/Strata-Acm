import {
  IconAffiliate, IconArrowsExchange, IconBooks, IconBuildingStore, IconChartBar, IconChartDots, IconChecklist, IconCircleCheck,
  IconClockHour4, IconFlask, IconFolders, IconHeartbeat, IconHelp, IconHome, IconLayoutKanban, IconList, IconListSearch, IconNews,
  IconNotebook, IconPlugConnected, IconRadar, IconSchool, IconSettings, IconShieldCheck, IconSitemap, IconTargetArrow,
  IconTrendingUp, type Icon,
} from "@tabler/icons-react";

export interface NavItem {
  label: string;
  href: string;
  /** second key of the `g <key>` shortcut */
  key: string;
  icon: Icon;
  /** one plain line: what you find there (tooltip + command palette only; never printed in the sidebar) */
  hint: string;
}
export interface NavSection { id: string; label: string; items: NavItem[] }

/** An accordion group in the sidebar: icon + short label, sub-items inside. */
export interface NavGroup { id: string; label: string; icon: Icon; hint: string; items: NavItem[] }

/** One top-level sidebar entry: a single link or an accordion group. */
export type NavEntry =
  | { kind: "link"; item: NavItem; /** the flagship page gets a small tag */ tag?: string }
  | { kind: "group"; group: NavGroup };

const link = (item: NavItem, tag?: string): NavEntry => ({ kind: "link", item, tag });
const group = (g: NavGroup): NavEntry => ({ kind: "group", group: g });

/**
 * Sidebar IA (night build): short labels, sub-items behind accordions, every route reachable.
 * Hints live in tooltips and the command palette only.
 */
export const NAV_TREE: NavEntry[] = [
  link({ label: "Home", href: "/app", key: "g", icon: IconHome, hint: "Choose where to start" }),
  link({ label: "Today's briefing", href: "/app/briefing", key: "b", icon: IconNews, hint: "What STRATA found since the last scan" }),
  group({ id: "problems", label: "Problems", icon: IconRadar, hint: "What is going wrong, and where", items: [
    { label: "Board", href: "/app/problems", key: "r", icon: IconLayoutKanban, hint: "Every problem by workflow stage" },
    { label: "List", href: "/app/risks", key: "v", icon: IconList, hint: "The same problems as a table" },
    { label: "Opportunities", href: "/app/opportunities", key: "o", icon: IconTrendingUp, hint: "Growth we are not acting on" },
    { label: "Accounts", href: "/app/accounts", key: "a", icon: IconBuildingStore, hint: "Every customer and its risk" },
  ] }),
  group({ id: "cases", label: "Cases", icon: IconFolders, hint: "Investigate one problem; recall past ones", items: [
    { label: "Cases", href: "/app/incidents", key: "i", icon: IconListSearch, hint: "One problem from cause to plan" },
    { label: "Memory", href: "/app/memory", key: "m", icon: IconBooks, hint: "Past cases, SOPs and outcomes" },
  ] }),
  group({ id: "act", label: "Act", icon: IconChecklist, hint: "Decide, hand off, check the result", items: [
    { label: "Approvals", href: "/app/approvals", key: "p", icon: IconCircleCheck, hint: "Plans waiting for your decision" },
    { label: "Workflows", href: "/app/workflows", key: "w", icon: IconArrowsExchange, hint: "Tasks and drafts (simulated)" },
    { label: "Outcomes", href: "/app/outcomes", key: "u", icon: IconTargetArrow, hint: "Did the plan work" },
  ] }),
  link({ label: "AI agents", href: "/app/agents", key: "j", icon: IconAffiliate, hint: "Where agents work and how much they may decide" }),
  link({ label: "Simulation lab", href: "/app/lab", key: "x", icon: IconFlask, hint: "Run a scenario and watch the loop" }),
  group({ id: "insights", label: "Insights", icon: IconChartDots, hint: "Health, data quality and how well STRATA does", items: [
    { label: "Business health", href: "/app/health", key: "h", icon: IconHeartbeat, hint: "Overall health and what drags it" },
    { label: "Sources & signals", href: "/app/sources", key: "s", icon: IconPlugConnected, hint: "Is the data fresh enough to trust" },
    { label: "Time-to-action", href: "/app/time-to-action", key: "t", icon: IconClockHour4, hint: "How fast a signal becomes a plan" },
    { label: "Evaluation", href: "/app/evaluation", key: "e", icon: IconChartBar, hint: "How good STRATA is, misses included" },
    { label: "Audit trail", href: "/app/audit", key: "l", icon: IconShieldCheck, hint: "Every decision, tamper-evident" },
  ] }),
  group({ id: "learn", label: "Learn", icon: IconSchool, hint: "How it works, terms, team notes", items: [
    { label: "How STRATA works", href: "/app/how-it-works", key: "y", icon: IconSitemap, hint: "The loop and the safeguards" },
    { label: "Help & glossary", href: "/app/help", key: "q", icon: IconHelp, hint: "What every number and term means" },
    { label: "Engineering notebook", href: "/app/notebook", key: "n", icon: IconNotebook, hint: "What the team tried (human-written)" },
  ] }),
];

/** Pinned at the bottom of the sidebar. */
export const NAV_SETTINGS: NavItem = { label: "Settings", href: "/app/settings", key: ",", icon: IconSettings, hint: "Your profile, company, theme and alerts" };

/** Flat sections (kept for callers that list pages by group). Stand-alone links form a "Go to" section. */
export const NAV: NavSection[] = (() => {
  const out: NavSection[] = [];
  const loose: NavItem[] = [];
  for (const e of NAV_TREE) {
    if (e.kind === "link") loose.push(e.item);
    else out.push({ id: e.group.id, label: e.group.label, items: e.group.items });
  }
  return [{ id: "start", label: "Go to", items: loose }, ...out, { id: "account", label: "Account", items: [NAV_SETTINGS] }];
})();

/** Kept for callers: both view modes now share one IA (detail is behind accordions instead). */
export function navForMode(_mode: "simple" | "detailed"): NavEntry[] {
  return NAV_TREE;
}

/** Every page, flat. `section` is the accordion label ("" for stand-alone links). */
export const NAV_ITEMS: (NavItem & { section: string })[] = [
  ...NAV_TREE.flatMap((e) => (e.kind === "link" ? [{ ...e.item, section: "" }] : e.group.items.map((i) => ({ ...i, section: e.group.label })))),
  { ...NAV_SETTINGS, section: "" },
];

/** Longest-prefix match: /app matches Home only exactly; /app/briefing → Briefing; /app/incidents/INC-1 → Cases. */
export function activeItem(pathname: string): (NavItem & { section: string }) | undefined {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (p === "/app") return NAV_ITEMS.find((i) => i.href === "/app");
  if (p === "/app/cases" || p.startsWith("/app/cases/")) return NAV_ITEMS.find((i) => i.href === "/app/incidents");
  return NAV_ITEMS.filter((i) => i.href !== "/app" && (p === i.href || p.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** The accordion group that holds a route, if any. */
export function activeGroupId(pathname: string): string | undefined {
  const a = activeItem(pathname);
  if (!a) return undefined;
  for (const e of NAV_TREE) if (e.kind === "group" && e.group.items.some((i) => i.href === a.href)) return e.group.id;
  return undefined;
}
