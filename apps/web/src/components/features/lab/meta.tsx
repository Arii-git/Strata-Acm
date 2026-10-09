import {
  IconAlertOctagon, IconBasket, IconBolt, IconBooks, IconBuildingFactory2, IconBuildingWarehouse, IconCloudStorm, IconCpu,
  IconDiscount, IconEye, IconGasStation, IconGavel, IconHandStop, IconMail, IconPackageOff, IconPill, IconRadar,
  IconReceiptOff, IconSchool, IconSearch, IconServerOff, IconShip, IconShoppingBag, IconSnowflake, IconTrendingUp,
  IconTruckDelivery, IconUser, IconUserMinus, IconWorld, type Icon,
} from "@tabler/icons-react";
import type { SimEvent, StageKey } from "./types";

export const INDUSTRY_ICON: Record<string, Icon> = {
  pharma: IconPill, fmcg: IconBasket, manufacturing: IconBuildingFactory2,
  ecommerce: IconShoppingBag, logistics: IconTruckDelivery, food: IconSnowflake,
};

export const CATEGORY_ICON: Record<string, Icon> = {
  natural_disaster: IconCloudStorm, late_shipment: IconShip, transit_damage: IconPackageOff,
  supplier_failure: IconBuildingWarehouse, demand_spike: IconTrendingUp, quality_recall: IconAlertOctagon,
  payment_default: IconReceiptOff, account_churn: IconUserMinus, it_outage: IconServerOff, labour_strike: IconHandStop,
  regulatory_change: IconGavel, cost_spike: IconGasStation, price_war: IconDiscount,
};

export const STAGE_META: { key: StageKey; label: string; icon: Icon; meaning: string }[] = [
  { key: "observe", label: "Observe", icon: IconEye, meaning: "Feeds are watched continuously." },
  { key: "detect", label: "Detect", icon: IconRadar, meaning: "Signals that break the norm raise an alert and a risk level." },
  { key: "investigate", label: "Investigate", icon: IconSearch, meaning: "Causes are tested against the evidence and ranked." },
  { key: "remember", label: "Remember", icon: IconBooks, meaning: "Similar past cases and SOPs are recalled." },
  { key: "act", label: "Act", icon: IconBolt, meaning: "A plan goes through the human gate, then tasks run." },
  { key: "learn", label: "Learn", icon: IconSchool, meaning: "The outcome is recorded and written back to memory." },
];
export const STAGE_INDEX: Record<StageKey, number> = { observe: 0, detect: 1, investigate: 2, remember: 3, act: 4, learn: 5 };

export const ACTOR_META: Record<SimEvent["actor"], { label: string; icon: Icon }> = {
  agent: { label: "Agent", icon: IconCpu },
  human: { label: "Human", icon: IconUser },
  external: { label: "Outside world", icon: IconWorld },
  system: { label: "Notification", icon: IconMail },
};

export const LEVEL_LABEL: Record<number, string> = { 1: "Low", 2: "Moderate", 3: "Elevated", 4: "High", 5: "Critical" };
export const LEVEL_TONE: Record<number, string> = { 1: "healthy", 2: "watch", 3: "elevated", 4: "high", 5: "critical" };

export const MODE_LABEL: Record<string, string> = {
  auto: "Agent decides at deadline",
  provisional: "Provisional agent decision at deadline",
  human_only: "Human only: escalates at deadline",
};

/** Day 0 = start of the run. "Day 4 · 06:00". */
export function fmtSimTime(day: number): string {
  const d = Math.floor(day);
  const mins = Math.round((day - d) * 24 * 60);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  if (day >= 21) return `Week ${Math.floor(day / 7) + 1} · Day ${d + 1}`;
  return `Day ${d + 1} · ${hh}:${mm}`;
}

/** A lag in days, shown as hours when short. */
export function fmtLag(days: number | null | undefined): string {
  if (days === null || days === undefined) return "n/a";
  if (days < 2) return `${Math.max(1, Math.round(days * 24))} h`;
  return `${Math.round(days * 10) / 10} days`;
}

export function fmtWeeks(w: number | null | undefined, horizon?: number): string {
  if (w === null || w === undefined) return horizon ? `> ${horizon} weeks` : "not within horizon";
  return `${w} week${w === 1 ? "" : "s"}`;
}

export function fmtSigned(v: number, digits = 1): string {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("en-IN")}`;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
