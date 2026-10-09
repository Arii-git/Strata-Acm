"use client";

import "@/styles/lanes/assistant.css";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowUp, IconEraser, IconX, IconZoomQuestion } from "@tabler/icons-react";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { usePersona } from "@/lib/persona";
import { StrataLoader } from "@/components/ui/Loader";
import { MarkdownLite } from "./MarkdownLite";
import { suggestedPrompts } from "./prompts";
import type { AssistantStatus, ChatReply, ChatTurn, DockMessage } from "./types";

const STORE_KEY = "strata.assistant.v1";
const MAX_SENT = 12;
const FOCUSABLE = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

function loadConversation(): DockMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DockMessage[]).filter((m) => m && typeof m.content === "string").slice(-40) : [];
  } catch {
    return [];
  }
}

function saveConversation(msgs: DockMessage[]): void {
  try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* storage unavailable */ }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function providerChip(s: AssistantStatus | null): { text: string; title: string } {
  if (s?.provider === "gemini" && s.model) return { text: `Gemini / ${s.model}`, title: "Answers use Gemini with STRATA's read-only evidence packet" };
  if (!s) return { text: "Checking…", title: "Checking the assistant provider" };
  if (s.provider === "anthropic" && s.model) return { text: `Anthropic · ${s.model}`, title: "Answers use Anthropic with STRATA's read-only tools" };
  return { text: "Keyless · templates", title: "No API key set: answers come from STRATA's deterministic templates" };
}

/** Floating "Ask STRATA" button + slide-in side panel. Mounted once by the app shell. */
export function AssistantDock() {
  const pathname = usePathname();
  const { persona, label: personaLabel } = usePersona();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DockMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const loaded = useRef(false);
  const titleId = `${useId()}-ask-title`;

  // restore the conversation for this browser tab
  useEffect(() => {
    setMessages(loadConversation());
    loaded.current = true;
  }, []);
  useEffect(() => { if (loaded.current) saveConversation(messages); }, [messages]);

  // provider chip: fetched when the panel first opens
  useEffect(() => {
    if (!open || status) return;
    const ctl = new AbortController();
    apiGet<AssistantStatus>("/assistant/status", ctl.signal)
      .then(setStatus)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStatus({ configured: false, provider: "none", model: null });
      });
    return () => ctl.abort();
  }, [open, status]);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  // focus into the panel on open; Esc closes; Tab / Shift+Tab stay inside
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panelRef.current.contains(active);
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const userMsg: DockMessage = { id: newId(), role: "user", content: q };
    const history: ChatTurn[] = [...messages.filter((m) => !m.error), userMsg].map(({ role, content }) => ({ role, content })).slice(-MAX_SENT);
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setBusy(true);
    try {
      const r = await apiPost<ChatReply>("/assistant/chat", { messages: history, persona, page: pathname });
      setMessages((m) => [...m, { id: newId(), role: "assistant", content: r.reply, citations: r.citations, provider: r.provider, notice: r.notice ?? null }]);
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 0 ? "The engine is not reachable right now. Try again in a moment." : "Something went wrong answering that. Try again.";
      setMessages((m) => [...m, { id: newId(), role: "assistant", content: msg, error: true }]);
    } finally {
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [busy, messages, persona, pathname]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const clear = () => { setMessages([]); inputRef.current?.focus(); };
  const chip = providerChip(status);
  const prompts = suggestedPrompts(pathname);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className="ask-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="ask-strata-panel"
        onClick={() => (open ? close() : setOpen(true))}
        data-open={open || undefined}
      >
        <IconZoomQuestion size={18} stroke={1.75} aria-hidden="true" />
        <span>Ask STRATA</span>
      </button>

      <div className="ask-scrim" data-open={open || undefined} onClick={close} aria-hidden="true" />

      <div
        ref={panelRef}
        id="ask-strata-panel"
        className="ask-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-open={open || undefined}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="ask-panel__head">
          <div className="ask-panel__titles">
            <h2 id={titleId} className="ask-panel__title">Ask STRATA</h2>
            <p className="ask-panel__sub">Answers from your data, as {personaLabel}. Read-only.</p>
          </div>
          <span className="ask-chip" title={chip.title}>{chip.text}</span>
          <div className="ask-panel__actions">
            <button type="button" className="ask-icon-btn" onClick={clear} disabled={!messages.length || busy} aria-label="Clear conversation" title="Clear conversation">
              <IconEraser size={16} stroke={1.75} aria-hidden="true" />
            </button>
            <button type="button" className="ask-icon-btn" onClick={close} aria-label="Close assistant" title="Close (Esc)">
              <IconX size={16} stroke={1.75} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div ref={listRef} className="ask-list" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <div className="ask-empty">
              <p className="ask-empty__lead">Ask about today&apos;s priorities, a case, an account or business health.</p>
              <p className="ask-empty__fine">Every answer cites the records it used. Numbers come only from STRATA&apos;s data.</p>
            </div>
          )}
          {messages.map((m) => (
            <article key={m.id} className={`ask-msg ask-msg--${m.role}${m.error ? " ask-msg--error" : ""}`}>
              <div className="ask-msg__who">{m.role === "user" ? "You" : "STRATA"}</div>
              {m.role === "user" ? <p className="ask-msg__text">{m.content}</p> : <MarkdownLite text={m.content} citations={m.citations} />}
              {m.notice && <p className="ask-msg__notice">{m.notice}</p>}
              {m.citations && m.citations.length > 0 && (
                <ul className="ask-cites" aria-label="Sources">
                  {m.citations.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <Link className="ask-cite" href={c.href} title={c.label}>
                        <span className="ask-cite__id">{c.id}</span>
                        <span className="ask-cite__label">{c.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {m.error && lastUser && (
                <button type="button" className="ask-retry" onClick={() => { setMessages((x) => x.filter((y) => y.id !== m.id)); void send(lastUser.content); }} disabled={busy}>
                  Try again
                </button>
              )}
            </article>
          ))}
          {busy && (
            <div className="ask-thinking">
              <StrataLoader size="sm" label="Thinking" />
            </div>
          )}
        </div>

        {messages.length === 0 && (
          <div className="ask-prompts" role="group" aria-label="Suggested questions">
            {prompts.map((p) => (
              <button key={p} type="button" className="ask-prompt" onClick={() => void send(p)} disabled={busy}>{p}</button>
            ))}
          </div>
        )}

        <form className="ask-input" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
          <label htmlFor="ask-strata-input" className="ask-sr">Your question</label>
          <textarea
            id="ask-strata-input"
            ref={inputRef}
            className="ask-input__box"
            rows={2}
            value={draft}
            maxLength={2000}
            placeholder="Ask a question…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="submit" className="ask-send" disabled={busy || !draft.trim()} aria-label="Send question">
            <IconArrowUp size={16} stroke={2} aria-hidden="true" />
          </button>
          <p className="ask-input__hint">Enter to send · Shift+Enter for a new line</p>
        </form>
      </div>
    </>
  );
}
