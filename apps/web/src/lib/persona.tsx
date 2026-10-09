"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PersonaKey } from "@/lib/api/types";

export const PERSONAS: { key: PersonaKey; label: string }[] = [
  { key: "operations_manager", label: "Operations Manager" },
  { key: "account_manager", label: "Account Manager" },
  { key: "sales_manager", label: "Sales Manager" },
  { key: "support_manager", label: "Support Manager" },
  { key: "business_head", label: "Business Head" },
  { key: "qa_head", label: "QA Head" },
];
export const DEFAULT_PERSONA: PersonaKey = "operations_manager";
const STORAGE_KEY = "strata.persona";

export function personaLabel(key: string): string {
  return PERSONAS.find((p) => p.key === key)?.label ?? key.replace(/_/g, " ");
}

interface PersonaCtx { persona: PersonaKey; label: string; setPersona: (p: PersonaKey) => void }
const PersonaContext = createContext<PersonaCtx | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [persona, setState] = useState<PersonaKey>(DEFAULT_PERSONA);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && PERSONAS.some((p) => p.key === saved)) setState(saved as PersonaKey);
    } catch { /* storage unavailable */ }
  }, []);

  const setPersona = useCallback((p: PersonaKey) => {
    setState(p);
    try { window.localStorage.setItem(STORAGE_KEY, p); } catch { /* storage unavailable */ }
  }, []);

  const value = useMemo(() => ({ persona, label: personaLabel(persona), setPersona }), [persona, setPersona]);
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaCtx {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used inside <PersonaProvider>");
  return ctx;
}
