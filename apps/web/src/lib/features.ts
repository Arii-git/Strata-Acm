"use client";

import { useApi } from "@/lib/api/client";
import type { Health } from "@/lib/api/types";

/** Feature flags come from the engine (`STRATA_FEATURES`, served on /health). Unknown = enabled while loading. */
export function useFeatures(): { has: (flag: string) => boolean; loaded: boolean } {
  const { data } = useApi<Health>("/health");
  const list = data?.features ?? null;
  return { has: (flag: string) => (list ? list.includes(flag) : true), loaded: !!list };
}
