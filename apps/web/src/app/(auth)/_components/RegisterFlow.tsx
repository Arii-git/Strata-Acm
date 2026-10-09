"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IconBuilding, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { ApiError, apiGet, apiPost, qs } from "@/lib/api/client";
import { useAuth, type SessionResponse } from "@/lib/auth";
import type { PersonaKey } from "@/lib/api/types";
import { Button } from "@/components/ui/Button";
import { announce } from "@/components/ui/states";
import {
  CodeInput, DevCodeNote, FormError, PasswordField, PasswordStrength, ROLE_INFO, ResendButton, TextField,
  friendlyError, isEmail, passwordScore, safeNext, stashEmail, useCooldown, withNext,
} from "./shared";

interface Company { code: string; name: string; industry: string }
type Lookup = "idle" | "checking" | "found" | "missing" | "error";
type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Company" },
  { n: 2, label: "Your details" },
  { n: 3, label: "Verify email" },
];

export function StepIndicator({ step }: { step: Step }) {
  return (
    <ol className="steps" aria-label="Registration progress">
      {STEPS.map((s) => {
        const state = s.n < step ? "is-done" : s.n === step ? "is-current" : "";
        return (
          <li key={s.n} className={`steps__item ${state}`} aria-current={s.n === step ? "step" : undefined}>
            <span className="steps__dot" aria-hidden="true">
              {s.n < step ? <IconCheck size={12} stroke={2} /> : s.n}
            </span>
            <span className="steps__label">
              {s.label}
              {s.n < step ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RegisterFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { setSession } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // step 1
  const [companyCode, setCompanyCode] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [lookup, setLookup] = useState<Lookup>("idle");

  // step 2
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PersonaKey | "">("");

  // step 3
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [verifyVia, setVerifyVia] = useState<"register" | "otp">("register");
  const cooldown = useCooldown(30);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Move focus to the new step's heading so keyboard and screen-reader users land in the right place.
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  // Live company lookup once 6 characters are in.
  useEffect(() => {
    if (companyCode.length !== 6) { setCompany(null); setLookup("idle"); return; }
    const ctrl = new AbortController();
    setLookup("checking");
    const t = window.setTimeout(() => {
      apiGet<Company>(qs("/auth/companies/lookup", { code: companyCode }), ctrl.signal)
        .then((c) => { setCompany(c); setLookup("found"); announce(`Company found: ${c.name}.`); })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setCompany(null);
          setLookup(e instanceof ApiError && e.status === 404 ? "missing" : "error");
        });
    }, 250);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [companyCode]);

  const go = (s: Step) => { setError(null); setStep(s); };

  const onStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (companyCode.length !== 6) { setError("Company codes are 6 letters or numbers."); return; }
    if (lookup !== "found") { setError(lookup === "checking" ? "Still checking that code…" : "Enter a valid company code to continue."); return; }
    go(2);
  };

  const registerBody = () => ({
    name: name.trim(), email: email.trim().toLowerCase(), password, company_code: companyCode, role,
  });

  const onStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) { setError("Enter your full name."); return; }
    if (!isEmail(email)) { setError("Enter a valid work email."); return; }
    if (passwordScore(password) < 2) { setError("Use a password of at least 8 characters."); return; }
    if (!role) { setError("Choose your role."); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiPost<{ status: string; email: string; dev_code?: string }>("/auth/register", registerBody());
      setDevCode(r.dev_code ?? null);
      setVerifyVia("register");
      setCode("");
      stashEmail(email.trim().toLowerCase());
      cooldown.restart();
      announce(r.dev_code ? "Account created. Demo code ready." : `Account created. Code sent to ${email.trim()}.`);
      go(3);
    } catch (err) {
      setError(friendlyError(err, {
        409: "An account with that email already exists. Sign in instead.",
        404: "That company code is no longer valid. Go back and check it.",
      }));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true); setError(null); setCode("");
    try {
      let r: { dev_code?: string };
      if (verifyVia === "register") {
        try {
          r = await apiPost<{ dev_code?: string }>("/auth/register", registerBody());
        } catch (err) {
          // Already registered (unverified): fall back to an email sign-in code, which also proves the address.
          if (!(err instanceof ApiError && (err.status === 409 || err.status === 400))) throw err;
          r = await apiPost<{ dev_code?: string }>("/auth/otp/request", { email: email.trim().toLowerCase() });
          setVerifyVia("otp");
        }
      } else {
        r = await apiPost<{ dev_code?: string }>("/auth/otp/request", { email: email.trim().toLowerCase() });
      }
      setDevCode(r.dev_code ?? null);
      cooldown.restart();
      announce("A new code is on its way.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (busy) return;
    if (value.length !== 6) { setError("Enter all 6 digits."); return; }
    setBusy(true); setError(null);
    try {
      const path = verifyVia === "register" ? "/auth/verify" : "/auth/otp/verify";
      const r = await apiPost<SessionResponse>(path, { email: email.trim().toLowerCase(), code: value });
      setSession(r.token, r.user);
      announce(`Email verified. Welcome, ${r.user.name}.`);
      router.replace(next);
    } catch (err) {
      setError(friendlyError(err, { 400: "That code is wrong or has expired.", 401: "That code is wrong or has expired." }));
      setBusy(false);
    }
  };

  const roleInfo = ROLE_INFO.find((r) => r.key === role);

  return (
    <section className="auth-card auth-card--wide" aria-labelledby="reg-title">
      <StepIndicator step={step} />

      <div className="auth-swap" key={step}>
        {step === 1 ? (
          <form className="af-form" onSubmit={onStep1} noValidate>
            <div className="auth-card__head">
              <h1 id="reg-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Join your company</h1>
              <p className="af-hint">Enter the 6-character code your business head shared with you.</p>
            </div>
            <div className="af-field">
              <label htmlFor="company-code" className="af-label">Company code</label>
              <input
                id="company-code"
                className="af-input af-input--code"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="AB12CD"
                aria-describedby="company-status"
                aria-invalid={lookup === "missing" ? true : undefined}
                autoFocus
              />
              <div id="company-status" className="auth-lookup" aria-live="polite">
                {lookup === "checking" ? <span className="af-hint">Checking code…</span> : null}
                {lookup === "found" && company ? (
                  <span className="auth-lookup__found">
                    <IconBuilding size={16} stroke={1.5} aria-hidden="true" />
                    <span>You&apos;re joining <strong>{company.name}</strong> · {company.industry}</span>
                  </span>
                ) : null}
                {lookup === "missing" ? (
                  <span className="auth-lookup__missing">
                    <IconAlertCircle size={16} stroke={1.5} aria-hidden="true" />
                    <span>No company uses that code. Check it with your business head.</span>
                  </span>
                ) : null}
                {lookup === "error" ? <span className="auth-lookup__missing">Couldn&apos;t check the code. Is the engine running?</span> : null}
              </div>
            </div>
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={lookup !== "found"}>Continue</Button>
            <p className="af-hint auth-center">
              Already have an account? <Link href={withNext("/", next)} className="af-link">Sign in</Link>
            </p>
          </form>
        ) : step === 2 ? (
          <form className="af-form" onSubmit={onStep2} noValidate>
            <div className="auth-card__head">
              <h1 id="reg-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Your details</h1>
              <p className="af-hint">Joining <strong>{company?.name}</strong> · {company?.industry}</p>
            </div>
            <TextField label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField label="Work email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordField
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={<PasswordStrength password={password} />}
              required
            />
            <div className="af-field">
              <label htmlFor="reg-role" className="af-label">Your role</label>
              <select id="reg-role" className="af-input af-select" value={role} onChange={(e) => setRole(e.target.value as PersonaKey | "")} aria-describedby="reg-role-hint" required>
                <option value="" disabled>Choose a role…</option>
                {ROLE_INFO.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <p id="reg-role-hint" className="af-hint">{roleInfo ? roleInfo.blurb : "Your role decides what STRATA shows you first."}</p>
            </div>
            <FormError message={error} />
            <div className="af-actions">
              <Button variant="ghost" onClick={() => go(1)}>Back</Button>
              <Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
            </div>
          </form>
        ) : (
          <form className="af-form" onSubmit={(e) => { e.preventDefault(); void verify(code); }} noValidate>
            <div className="auth-card__head">
              <h1 id="reg-title" ref={headingRef} tabIndex={-1} className="auth-card__title">Check your email</h1>
              <p className="af-hint">We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in 10 minutes.</p>
            </div>
            <DevCodeNote code={devCode} onUse={(c) => { setCode(c); void verify(c); }} />
            <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} autoFocus disabled={busy} invalid={!!error} />
            <FormError message={error} />
            <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Verify and continue"}
            </Button>
            <div className="af-row af-row--between">
              <button type="button" className="af-link" onClick={() => go(2)}>Change email</button>
              <ResendButton left={cooldown.left} busy={busy} onResend={() => void resend()} />
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
