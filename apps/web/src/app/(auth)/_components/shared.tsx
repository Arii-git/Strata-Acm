"use client";

/** Building blocks shared by the landing sign-in card and the (auth) pages. Styles: styles/lanes/auth.css. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconEye, IconEyeOff, IconInfoCircle } from "@tabler/icons-react";
import { ApiError } from "@/lib/api/client";
import type { PersonaKey } from "@/lib/api/types";

/* ------------------------------------------------------------------ */
/* Routing helpers                                                     */
/* ------------------------------------------------------------------ */

/** Only same-origin paths are allowed after sign-in; anything else falls back to /app. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/app";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/app";
  return raw;
}

/** Carry ?next= across the auth pages. */
export function withNext(path: string, next: string): string {
  return next && next !== "/app" ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/** The email being verified/reset is handed between pages via sessionStorage, never the URL. */
const PENDING_EMAIL_KEY = "strata.pendingEmail";
export function stashEmail(email: string): void {
  try { window.sessionStorage.setItem(PENDING_EMAIL_KEY, email); } catch { /* storage unavailable */ }
}
export function readStashedEmail(): string {
  try { return window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? ""; } catch { return ""; }
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

export const ROLE_INFO: { key: PersonaKey; label: string; blurb: string }[] = [
  { key: "operations_manager", label: "Operations Manager", blurb: "Runs day-to-day operations and owns incidents and cases." },
  { key: "account_manager", label: "Account Manager", blurb: "Looks after customer accounts and their health." },
  { key: "sales_manager", label: "Sales Manager", blurb: "Tracks renewals, pipeline and growth opportunities." },
  { key: "support_manager", label: "Support Manager", blurb: "Leads the support desk and customer escalations." },
  { key: "business_head", label: "Business Head", blurb: "Company admin. Sets agent policy and approves high-risk calls." },
  { key: "qa_head", label: "QA Head", blurb: "Quality and regulatory review, with four-eyes sign-off." },
];

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Turn an engine error into one calm sentence. `overrides` maps HTTP status → message. */
export function friendlyError(e: unknown, overrides: Record<number, string> = {}): string {
  if (e instanceof ApiError) {
    if (overrides[e.status]) return overrides[e.status];
    if (e.status === 0) return "Can't reach the STRATA engine. Check that it is running, then try again.";
    if (e.status === 429) return "Too many attempts. Wait a minute, then try again.";
    if (e.status >= 500) return "The engine hit an error. Try again in a moment.";
    return e.message || "Something went wrong. Try again.";
  }
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

/* ------------------------------------------------------------------ */
/* Form pieces                                                         */
/* ------------------------------------------------------------------ */

export function FormError({ message }: { message: string | null }) {
  // Always mounted so screen readers announce the text when it appears.
  return (
    <div role="alert" aria-live="assertive" className={message ? "af-error" : "af-error af-error--empty"}>
      {message}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export function TextField({ label, hint, error, id, ...input }: { label: string; hint?: React.ReactNode; error?: boolean } & InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="af-field">
      <label htmlFor={fid} className="af-label">{label}</label>
      <input
        id={fid}
        className="af-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? `${fid}-hint` : undefined}
        {...input}
      />
      {hint ? <p id={`${fid}-hint`} className="af-hint">{hint}</p> : null}
    </div>
  );
}

export function PasswordField({ label = "Password", hint, error, id, inputRef, ...input }: {
  label?: string; hint?: React.ReactNode; error?: boolean; inputRef?: React.Ref<HTMLInputElement>;
} & Omit<InputProps, "type">) {
  const auto = useId();
  const fid = id ?? auto;
  const [show, setShow] = useState(false);
  return (
    <div className="af-field">
      <label htmlFor={fid} className="af-label">{label}</label>
      <div className="af-password">
        <input
          ref={inputRef}
          id={fid}
          type={show ? "text" : "password"}
          className="af-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? `${fid}-hint` : undefined}
          {...input}
        />
        <button
          type="button"
          className="af-password__toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
        >
          {show ? <IconEyeOff size={16} stroke={1.5} aria-hidden="true" /> : <IconEye size={16} stroke={1.5} aria-hidden="true" />}
        </button>
      </div>
      {hint ? <div id={`${fid}-hint`} className="af-hint">{hint}</div> : null}
    </div>
  );
}

/** 0 = empty, 1 too short, 2 weak, 3 fair, 4 strong. Minimum accepted length is 8. */
export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  let s = 0;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  if (pw.length >= 12) s += 1;
  return s >= 3 ? 4 : s >= 1 ? 3 : 2;
}

const STRENGTH = ["", "Too short — use at least 8 characters", "Weak — add numbers or symbols", "Fair — longer is stronger", "Strong"];

export function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  if (score === 0) return <span className="af-hint">At least 8 characters. Mix letters, numbers and a symbol.</span>;
  return (
    <span className="af-strength" data-score={score}>
      <span className="af-strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className={i <= score ? "is-on" : undefined} />)}
      </span>
      <span>{STRENGTH[score]}</span>
    </span>
  );
}

/** Shown only when the engine returns dev_code (no SMTP configured). Clearly labelled; never pretends mail was sent. */
export function DevCodeNote({ code, onUse }: { code?: string | null; onUse?: (code: string) => void }) {
  if (!code) return null;
  return (
    <div className="af-devnote" role="note">
      <IconInfoCircle size={16} stroke={1.5} aria-hidden="true" />
      <div>
        <strong>Demo mode:</strong> email is not configured, so no mail was sent. Your code is{" "}
        <span className="af-devnote__code">{code}</span>
        {onUse ? (
          <>
            {" · "}
            <button type="button" className="af-link" onClick={() => onUse(code)}>Fill it in</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6-box code input                                                    */
/* ------------------------------------------------------------------ */

/**
 * Six single-digit boxes, contiguous value (no gaps). Typing advances, Backspace goes back,
 * arrows move, pasting or autofilling a 6-digit code fills every box. Enter submits the parent form.
 */
export function CodeInput({ value, onChange, onComplete, length = 6, label = "6-digit code", disabled, autoFocus, invalid }: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const labelId = useId();

  const focusBox = useCallback((i: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) { el.focus(); el.select(); }
  }, [length]);

  useEffect(() => {
    if (autoFocus) focusBox(0);
  }, [autoFocus, focusBox]);

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const setAt = (i: number, ch: string) => {
    const idx = Math.min(i, value.length);
    const arr = value.split("");
    arr[idx] = ch;
    const next = commit(arr.join(""));
    focusBox(Math.min(next.length, idx + 1));
  };

  const fillFrom = (i: number, text: string) => {
    const digits = text.replace(/\D/g, "");
    if (!digits) return;
    const start = digits.length >= length ? 0 : Math.min(i, value.length);
    const next = commit(value.slice(0, start) + digits);
    focusBox(next.length);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setAt(i, e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (i < value.length) { commit(value.slice(0, i) + value.slice(i + 1)); focusBox(i); }
      else if (i > 0) { commit(value.slice(0, i - 1) + value.slice(i)); focusBox(i - 1); }
    } else if (e.key === "Delete") {
      e.preventDefault();
      if (i < value.length) commit(value.slice(0, i) + value.slice(i + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault(); focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault(); focusBox(Math.min(i + 1, value.length));
    }
  };

  // Mobile keyboards and one-time-code autofill arrive as change events, not keydowns.
  const onInputChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) return;
    if (digits.length >= length) fillFrom(0, digits);
    else setAt(i, digits[digits.length - 1]);
  };

  return (
    <div className="af-field">
      <span id={labelId} className="af-label">{label}</span>
      <div className="af-code" role="group" aria-labelledby={labelId}>
        {Array.from({ length }, (_, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            className="af-code__box"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            pattern="[0-9]*"
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={invalid ? true : undefined}
            value={value[i] ?? ""}
            disabled={disabled}
            onKeyDown={(e) => onKeyDown(i, e)}
            onChange={(e) => onInputChange(i, e)}
            onPaste={(e) => { e.preventDefault(); fillFrom(i, e.clipboardData.getData("text")); }}
            onFocus={(e) => {
              // keep the value contiguous: jump to the first empty box
              if (i > value.length) focusBox(value.length);
              else e.target.select();
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resend timer                                                        */
/* ------------------------------------------------------------------ */

/** Seconds left before "Resend" is allowed. Call restart() after each send. */
export function useCooldown(seconds = 30): { left: number; restart: () => void } {
  const [until, setUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) window.clearInterval(t);
    }, 500);
    return () => window.clearInterval(t);
  }, [until]);
  const restart = useCallback(() => { const n = Date.now(); setNow(n); setUntil(n + seconds * 1000); }, [seconds]);
  return { left: until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0, restart };
}

export function ResendButton({ left, busy, onResend }: { left: number; busy?: boolean; onResend: () => void }) {
  return left > 0 ? (
    <span className="af-hint" aria-live="off">Resend a code in {left}s</span>
  ) : (
    <button type="button" className="af-link" onClick={onResend} disabled={busy}>
      {busy ? "Sending…" : "Resend code"}
    </button>
  );
}

/** Card placeholder while a client flow hydrates (Suspense fallback). */
export function CardSkeleton() {
  return (
    <div className="auth-card" aria-busy="true">
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__row" style={{ width: "40%" }} />
        <div className="skeleton__row" />
        <div className="skeleton__row" />
        <div className="skeleton__row" style={{ width: "60%" }} />
      </div>
    </div>
  );
}
