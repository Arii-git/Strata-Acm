"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconCircleCheck } from "@tabler/icons-react";
import { apiPost } from "@/lib/api/client";
import { Button, buttonClass } from "@/components/ui/Button";
import { announce } from "@/components/ui/states";
import {
  CodeInput, DevCodeNote, FormError, PasswordField, PasswordStrength, ResendButton, TextField,
  friendlyError, isEmail, passwordScore, readStashedEmail, safeNext, stashEmail, useCooldown, withNext,
} from "./shared";

type Stage = "email" | "reset" | "done";

export function ForgotFlow() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldown(30);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => { setEmail((e) => e || readStashedEmail()); }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headingRef.current?.focus();
  }, [stage]);

  const send = async () => {
    if (!isEmail(email)) { setError("Enter a valid work email."); return false; }
    setBusy(true); setError(null);
    try {
      const r = await apiPost<{ status: string; dev_code?: string }>("/auth/password/forgot", { email: email.trim().toLowerCase() });
      setDevCode(r.dev_code ?? null);
      cooldown.restart();
      announce(r.dev_code ? "Demo reset code ready." : "If that email has an account, a reset code is on its way.");
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (await send()) { setCode(""); setStage("reset"); }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (code.length !== 6) { setError("Enter all 6 digits of the code."); return; }
    if (passwordScore(pw) < 2) { setError("Use a password of at least 8 characters."); return; }
    if (pw !== pw2) { setError("The two passwords don't match."); return; }
    setBusy(true); setError(null);
    try {
      await apiPost<{ status: string }>("/auth/password/reset", { email: email.trim().toLowerCase(), code, new_password: pw });
      stashEmail(email.trim().toLowerCase());
      announce("Password updated. You can sign in now.");
      setStage("done");
    } catch (err) {
      setError(friendlyError(err, { 400: "That code is wrong or has expired.", 401: "That code is wrong or has expired." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-card" aria-labelledby="forgot-title">
      <div className="auth-swap" key={stage}>
        {stage === "email" ? (
          <form className="af-form" onSubmit={onEmail} noValidate>
            <div className="auth-card__head">
              <h1 id="forgot-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Reset your password</h1>
              <p className="af-hint">We&apos;ll email you a 6-digit code to set a new one.</p>
            </div>
            <TextField label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy}>{busy ? "Sending…" : "Send reset code"}</Button>
            <p className="af-hint auth-center"><Link href={withNext("/", next)} className="af-link">Back to sign in</Link></p>
          </form>
        ) : stage === "reset" ? (
          <form className="af-form" onSubmit={onReset} noValidate>
            <div className="auth-card__head">
              <h1 id="forgot-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Choose a new password</h1>
              <p className="af-hint">Enter the code sent to <strong>{email.trim()}</strong>, then a new password.</p>
            </div>
            <DevCodeNote code={devCode} onUse={setCode} />
            <CodeInput value={code} onChange={setCode} autoFocus disabled={busy} />
            <PasswordField label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={<PasswordStrength password={pw} />} required />
            <PasswordField label="Confirm new password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy}>{busy ? "Saving…" : "Set new password"}</Button>
            <div className="af-row af-row--between">
              <button type="button" className="af-link" onClick={() => { setError(null); setStage("email"); }}>Change email</button>
              <ResendButton left={cooldown.left} busy={busy} onResend={() => { setCode(""); void send(); }} />
            </div>
          </form>
        ) : (
          <div className="af-form auth-done">
            <IconCircleCheck size={32} stroke={1.5} aria-hidden="true" className="auth-done__icon" />
            <h1 id="forgot-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Password updated</h1>
            <p className="af-hint">Sign in with your new password.</p>
            <Link href={withNext("/", next)} className={`${buttonClass("primary")} auth-btn-block`}>Go to sign in</Link>
          </div>
        )}
      </div>
    </section>
  );
}
