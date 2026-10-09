import {
  IconAlertTriangle, IconArrowsExchange, IconBooks, IconBuildingStore, IconChartBar, IconChecklist, IconClockHour4,
  IconFlask, IconHeartbeat, IconLayoutDashboard, IconListSearch, IconNotebook, IconPlugConnected, IconShieldCheck,
  IconTargetArrow, IconTrendingUp, type Icon,
} from "@tabler/icons-react";

export interface NavItem { label: string; href: string; key: string; icon: Icon }
export interface NavSection { label: string; items: NavItem[] }

/** Sidebar IA (Blueprint §10.4). `key` = second key of the `g <key>` shortcut. */
export const NAV: NavSection[] = [
  { label: "Command", items: [
    { label: "Briefing", href: "/app", key: "b", icon: IconLayoutDashboard },
    { label: "Business Health", href: "/app/health", key: "h", icon: IconHeartbeat },
  ] },
  { label: "Observe", items: [
    { label: "Sources & Signals", href: "/app/sources", key: "s", icon: IconPlugConnected },
  ] },
  { label: "Detect", items: [
    { label: "Risk Register", href: "/app/risks", key: "r", icon: IconAlertTriangle },
    { label: "Opportunity Radar", href: "/app/opportunities", key: "o", icon: IconTrendingUp },
    { label: "Accounts", href: "/app/accounts", key: "a", icon: IconBuildingStore },
  ] },
  { label: "Investigate", items: [
    { label: "Incident Workbench", href: "/app/incidents", key: "i", icon: IconListSearch },
  ] },
  { label: "Remember", items: [
    { label: "Organizational Memory", href: "/app/memory", key: "m", icon: IconBooks },
  ] },
  { label: "Act", items: [
    { label: "Approvals", href: "/app/approvals", key: "p", icon: IconChecklist },
    { label: "Workflows & Handoffs", href: "/app/workflows", key: "w", icon: IconArrowsExchange },
    { label: "Outcomes", href: "/app/outcomes", key: "u", icon: IconTargetArrow },
  ] },
  { label: "Assure", items: [
    { label: "Time-to-Action", href: "/app/time-to-action", key: "t", icon: IconClockHour4 },
    { label: "Evaluation", href: "/app/evaluation", key: "e", icon: IconChartBar },
    { label: "Audit Trail", href: "/app/audit", key: "l", icon: IconShieldCheck },
  ] },
  { label: "Lab", items: [
    { label: "Simulation Lab", href: "/app/lab", key: "x", icon: IconFlask },
    { label: "Engineering Notebook", href: "/app/notebook", key: "n", icon: IconNotebook },
  ] },
];

export const NAV_ITEMS: (NavItem & { section: string })[] = NAV.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })));

/** Longest-prefix match so /app/incidents/123 activates Incident Workbench, and /app only matches Briefing exactly. */
export function activeItem(pathname: string): (NavItem & { section: string }) | undefined {
  if (pathname === "/app" || pathname === "/app/") return NAV_ITEMS[0];
  return NAV_ITEMS.filter((i) => i.href !== "/app" && (pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
