"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/api/client";
import { useAuth, type SessionResponse } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { announce } from "@/components/ui/states";
import {
  CodeInput, DevCodeNote, FormError, ResendButton, TextField,
  friendlyError, isEmail, readStashedEmail, safeNext, useCooldown, withNext,
} from "./shared";

/**
 * Reached when sign-in returns 403 (email not verified yet).
 * "Send a new code" uses the passwordless OTP endpoint (it proves the address too);
 * a code still in hand from registration goes to /auth/verify.
 */
export function VerifyFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { setSession } = useAuth();

  const [stage, setStage] = useState<"send" | "code">("send");
  const [via, setVia] = useState<"register" | "otp">("otp");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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
      const r = await apiPost<{ status: string; dev_code?: string }>("/auth/otp/request", { email: email.trim().toLowerCase() });
      setDevCode(r.dev_code ?? null);
      setVia("otp");
      cooldown.restart();
      announce(r.dev_code ? "Demo code ready." : `Code sent to ${email.trim()}.`);
      return true;
    } catch (err) {
      setError(friendlyError(err, { 404: "No account uses that email." }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (busy) return;
    if (value.length !== 6) { setError("Enter all 6 digits."); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiPost<SessionResponse>(via === "otp" ? "/auth/otp/verify" : "/auth/verify", { email: email.trim().toLowerCase(), code: value });
      setSession(r.token, r.user);
      announce(`Email verified. Welcome, ${r.user.name}.`);
      router.replace(next);
    } catch (err) {
      setError(friendlyError(err, { 400: "That code is wrong or has expired.", 401: "That code is wrong or has expired." }));
      setBusy(false);
    }
  };

  return (
    <section className="auth-card" aria-labelledby="verify-title">
      <div className="auth-swap" key={stage}>
        {stage === "send" ? (
          <form className="af-form" onSubmit={async (e) => { e.preventDefault(); if (!busy && await send()) { setCode(""); setStage("code"); } }} noValidate>
            <div className="auth-card__head">
              <h1 id="verify-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Verify your email first</h1>
              <p className="af-hint">Your account exists but the email isn&apos;t confirmed yet. We&apos;ll send a 6-digit code.</p>
            </div>
            <TextField label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy}>{busy ? "Sending…" : "Send verification code"}</Button>
            <div className="af-row af-row--between">
              <Link href={withNext("/", next)} className="af-link">Back to sign in</Link>
              <button
                type="button"
                className="af-link"
                onClick={() => {
                  if (!isEmail(email)) { setError("Enter a valid work email."); return; }
                  setVia("register"); setDevCode(null); setCode(""); setError(null); setStage("code");
                }}
              >
                I already have a code
              </button>
            </div>
          </form>
        ) : (
          <form className="af-form" onSubmit={(e) => { e.preventDefault(); void verify(code); }} noValidate>
            <div className="auth-card__head">
              <h1 id="verify-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Enter your code</h1>
              <p className="af-hint">
                {via === "otp" ? <>We sent a 6-digit code to <strong>{email.trim()}</strong>.</> : <>Use the code from your sign-up email to <strong>{email.trim()}</strong>.</>}
              </p>
            </div>
            <DevCodeNote code={devCode} onUse={(c) => { setCode(c); void verify(c); }} />
            <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} autoFocus disabled={busy} invalid={!!error} />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify and sign in"}</Button>
            <div className="af-row af-row--between">
              <button type="button" className="af-link" onClick={() => { setError(null); setStage("send"); }}>Change email</button>
              <ResendButton left={cooldown.left} busy={busy} onResend={() => { setCode(""); void send(); }} />
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
