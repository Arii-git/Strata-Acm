"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { StrataLoader } from "@/components/ui/Loader";
import { apiPost } from "@/lib/api/client";
import { useAuth, type AuthUser } from "@/lib/auth";
import { takeGoogleNext } from "../_components/GoogleButton";
import { FormError, ROLE_INFO, TextField, friendlyError } from "../_components/shared";

type Resp = { token: string; user: AuthUser } | { status: "join_required"; email: string; name: string };

/** Return page for Google sign-in (Supabase Auth). Supabase puts the access token in the URL fragment. */
export default function GoogleReturn() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [join, setJoin] = useState<{ email: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = (r: Resp) => {
    if ("token" in r) {
      setSession(r.token, r.user);
      router.replace(takeGoogleNext());
    } else {
      setJoin({ email: r.email, name: r.name });
      setName(r.name);
    }
  };

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const t = hash.get("access_token");
    window.history.replaceState(null, "", "/google"); // keep the token out of history
    if (!t) {
      setError(hash.get("error_description") || "Google sign-in did not complete. Please try again.");
      return;
    }
    setToken(t);
    apiPost<Resp>("/auth/supabase", { access_token: t }).then(finish).catch((e) => setError(friendlyError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      finish(await apiPost<Resp>("/auth/supabase", { access_token: token, company_code: code.trim().toUpperCase(), role, name }));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (join) {
    return (
      <section className="auth-card" aria-labelledby="g-title">
        <div className="auth-card__head">
          <h2 id="g-title" className="auth-card__title">Join your company</h2>
          <p className="af-hint">Signed in with Google as <strong>{join.email}</strong>. One last step.</p>
        </div>
        <form className="af-form" onSubmit={submitJoin} noValidate>
          <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField label="Company join code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required
            hint="Six characters, from your Business Head." />
          <label className="af-field">
            <span className="af-label">Your role</span>
            <select className="af-input af-select" value={role} onChange={(e) => setRole(e.target.value)} required>
              <option value="" disabled>Pick a role</option>
              {ROLE_INFO.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <FormError message={error} />
          <Button type="submit" variant="primary" className="auth-btn-block" disabled={busy || code.trim().length !== 6 || !role}>
            {busy ? "Joining…" : "Join and continue"}
          </Button>
        </form>
      </section>
    );
  }
  if (error) {
    return (
      <section className="auth-card">
        <h2 className="auth-card__title">Google sign-in failed</h2>
        <FormError message={error} />
        <Button variant="primary" onClick={() => router.replace("/")}>Back to sign in</Button>
      </section>
    );
  }
  return <StrataLoader size="lg" label="Finishing Google sign-in" />;
}
