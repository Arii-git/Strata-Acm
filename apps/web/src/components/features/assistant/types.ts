/** Wire types for the engine's /assistant endpoints (strata_engine/assistant.py). */
export interface AssistantCitation { id: string; label: string; href: string }

export interface AssistantStatus { configured: boolean; provider: "anthropic" | "gemini" | "none"; model: string | null }

export interface ChatTurn { role: "user" | "assistant"; content: string }

export interface ChatReply {
  reply: string;
  citations: AssistantCitation[];
  provider: "anthropic" | "gemini" | "none";
  /** Set when the keyed path fell back to templates (API error, budget, refusal). */
  notice?: string | null;
}

/** A message as kept in the dock (and in sessionStorage). */
export interface DockMessage extends ChatTurn {
  id: string;
  citations?: AssistantCitation[];
  provider?: "anthropic" | "gemini" | "none";
  notice?: string | null;
  error?: boolean;
}
