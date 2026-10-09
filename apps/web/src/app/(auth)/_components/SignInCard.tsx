"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowRight, IconChevronDown, IconLogout, IconMail, IconUserCircle } from "@tabler/icons-react";
import { ApiError, apiGet, apiPost } from "@/lib/api/client";
import { useAuth, type SessionResponse } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { announce } from "@/components/ui/states";
import {
  CodeInput, DevCodeNote, FormError, PasswordField, ResendButton, TextField,
  friendlyError, isEmail, readStashedEmail, safeNext, stashEmail, useCooldown, withNext,
} from "./shared";

interface DemoAccount { email: string; role: string; role_label: string; company_name: string; demo_password?: string }

type Mode = "password" | "otp-email" | "otp-code";
export type PortalKind = "company" | "user";

export function SignInCard({ portal = "user" }: { portal?: PortalKind }) {
  const { user, loading, login, logout, setSession } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldown(30);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Coming back from a password reset or verification: keep the email they already typed.
  useEffect(() => { setEmail((e) => e || readStashedEmail()); }, []);

  const switchMode = (m: Mode) => { setMode(m); setError(null); setCode(""); };

  const finish = (name: string) => {
    announce(`Signed in as ${name}.`);
    router.replace(next);
  };

  const onPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isEmail(email)) { setError("Enter a valid work email."); return; }
    if (!password) { setError("Enter your password."); passwordRef.current?.focus(); return; }
    setBusy(true); setError(null);
    try {
      const u = await login(email, password);
      finish(u.name);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        stashEmail(email.trim().toLowerCase());
        router.push(withNext("/verify", next));
        return;
      }
      setError(friendlyError(err, { 401: "That email and password don't match. Try again or use a sign-in code." }));
      setBusy(false);
    }
  };

  const requestOtp = async () => {
    if (!isEmail(email)) { setError("Enter a valid work email."); return false; }
    setBusy(true); setError(null);
    try {
      const r = await apiPost<{ status: string; dev_code?: string }>("/auth/otp/request", { email: email.trim().toLowerCase() });
      setDevCode(r.dev_code ?? null);
      cooldown.restart();
      announce(r.dev_code ? "Demo code ready." : `Code sent to ${email.trim()}.`);
      return true;
    } catch (err) {
      setError(friendlyError(err, { 404: "No account uses that email. Create one with your company code." }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onOtpEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (await requestOtp()) { setCode(""); setMode("otp-code"); }
  };

  const verifyOtp = async (value: string) => {
    if (busy) return;
    if (value.length !== 6) { setError("Enter all 6 digits."); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiPost<SessionResponse>("/auth/otp/verify", { email: email.trim().toLowerCase(), code: value });
      setSession(r.token, r.user);
      finish(r.user.name);
    } catch (err) {
      setError(friendlyError(err, { 400: "That code is wrong or has expired.", 401: "That code is wrong or has expired." }));
      setBusy(false);
    }
  };

  const pickDemo = (a: DemoAccount) => {
    setMode("password");
    setEmail(a.email);
    setError(null);
    if (a.demo_password) {
      setPassword(a.demo_password);
      announce(`Filled in the ${a.role_label} demo account. Press Sign in.`);
      window.setTimeout(() => submitRef.current?.focus(), 0);
    } else {
      setPassword("");
      announce(`Filled in the ${a.role_label} email. Enter the demo password.`);
      window.setTimeout(() => passwordRef.current?.focus(), 0);
    }
  };

  if (loading) {
    return (
      <section className="auth-card" aria-busy="true" aria-label="Sign in">
        <p className="af-hint" role="status">Checking your session…</p>
      </section>
    );
  }

  if (user) {
    const first = user.name.split(" ")[0] || user.name;
    return (
      <section className="auth-card auth-card--signed" aria-labelledby="signed-title">
        <div className="auth-who">
          <span className="auth-who__avatar" aria-hidden="true">{initials(user.name)}</span>
          <div>
            <h2 id="signed-title" className="auth-card__title">Welcome back, {first}</h2>
            <p className="af-hint">{user.role_label} · {user.company_name}</p>
          </div>
        </div>
        <Link href={next} className="btn btn--primary auth-btn-block">
          Continue as {user.name} <IconArrowRight size={16} stroke={1.5} aria-hidden="true" />
        </Link>
        <Button variant="ghost" className="auth-btn-block" onClick={logout} icon={<IconLogout size={16} stroke={1.5} aria-hidden="true" />}>
          Sign out
        </Button>
        <p className="af-hint">To see another role, sign out and sign in with that role&apos;s demo account.</p>
      </section>
    );
  }

  return (
    <section className="auth-card" aria-labelledby="signin-title">
      <div className="auth-card__head">
        <h2 id="signin-title" className="auth-card__title">{portal === "company" ? "Company sign in" : "Team sign in"}</h2>
        <p className="af-hint">{portal === "company" ? "Use the Business Head work account for this company." : "Use the work email your company has on file."}</p>
      </div>

      <div className="auth-swap" key={mode}>
        {mode === "password" ? (
          <form className="af-form" onSubmit={onPasswordSubmit} noValidate>
            <TextField label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordField
              inputRef={passwordRef}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="af-row">
              <Link href={withNext("/forgot", next)} className="af-link">Forgot password?</Link>
            </div>
            <FormError message={error} />
            <Button ref={submitRef} type="submit" variant="primary" className="auth-btn-block" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <button type="button" className="af-alt" onClick={() => switchMode("otp-email")}>
              <IconMail size={16} stroke={1.5} aria-hidden="true" /> Email me a sign-in code instead
            </button>
          </form>
        ) : mode === "otp-email" ? (
          <form className="af-form" onSubmit={onOtpEmailSubmit} noValidate>
            <p className="af-lead">We&apos;ll email you a 6-digit code. No password needed.</p>
            <TextField label="Work email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </Button>
            <button type="button" className="af-alt" onClick={() => switchMode("password")}>Use my password instead</button>
          </form>
        ) : (
          <form className="af-form" onSubmit={(e) => { e.preventDefault(); void verifyOtp(code); }} noValidate>
            <p className="af-lead">Enter the code we sent to <strong>{email.trim()}</strong>. It expires in 10 minutes.</p>
            <DevCodeNote code={devCode} onUse={(c) => { setCode(c); void verifyOtp(c); }} />
            <CodeInput value={code} onChange={setCode} onComplete={(v) => void verifyOtp(v)} autoFocus disabled={busy} invalid={!!error} />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <div className="af-row af-row--between">
              <button type="button" className="af-link" onClick={() => switchMode("otp-email")}>Change email</button>
              <ResendButton left={cooldown.left} busy={busy} onResend={() => { setCode(""); void requestOtp(); }} />
            </div>
          </form>
        )}
      </div>

      <div className="auth-card__foot">
        <span className="af-hint">New to STRATA?</span>{" "}
        <Link href={withNext("/register", next)} className="af-link">Join your company with its code</Link>
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
