"use client";

/**
 * Persona = the signed-in user's role. It is no longer switchable in the UI: to see another role,
 * sign out and sign in as another user (the landing page lists one demo account per role).
 */
import { createContext, useCallback, useContext, useMemo } from "react";
import type { PersonaKey } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";

export const PERSONAS: { key: PersonaKey; label: string }[] = [
  { key: "operations_manager", label: "Operations Manager" },
  { key: "account_manager", label: "Account Manager" },
  { key: "sales_manager", label: "Sales Manager" },
  { key: "support_manager", label: "Support Manager" },
  { key: "business_head", label: "Business Head" },
  { key: "qa_head", label: "QA Head" },
];
export const DEFAULT_PERSONA: PersonaKey = "operations_manager";

export function personaLabel(key: string): string {
  return PERSONAS.find((p) => p.key === key)?.label ?? key.replace(/_/g, " ");
}

function isPersona(v: unknown): v is PersonaKey {
  return typeof v === "string" && PERSONAS.some((p) => p.key === v);
}

interface PersonaCtx {
  persona: PersonaKey;
  label: string;
  /** @deprecated No-op since login: the persona follows the signed-in user's role. */
  setPersona: (p: PersonaKey) => void;
}
const PersonaContext = createContext<PersonaCtx | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const role = user?.role;
  const persona: PersonaKey = isPersona(role) ? role : DEFAULT_PERSONA;
  const setPersona = useCallback((_p: PersonaKey) => { /* role changes = sign out, sign in as another user */ }, []);
  const value = useMemo(() => ({ persona, label: personaLabel(persona), setPersona }), [persona, setPersona]);
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaCtx {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error("usePersona must be used inside <PersonaProvider>");
  return ctx;
}
