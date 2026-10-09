"use client";

import { useState } from "react";
import { IconCopy, IconCheck, IconDeviceDesktop, IconMoon, IconSun, IconLogout } from "@tabler/icons-react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiPatch, useApi } from "@/lib/api/client";
import { useAuth, type AuthUser } from "@/lib/auth";
import { useTheme, type ThemePref } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageTemplate, StatusPill, announce } from "@/components/ui";
import { PolicyEditor } from "@/components/features/agentic";
import "@/styles/lanes/auth.css";

interface Member { name: string; email: string; role: string; role_label: string; verified: boolean }
interface CompanyResp { company: { id: string; name: string; industry: string; code?: string | null }; members: Member[] }
interface Mail { to: string; subject: string; sent_via: "smtp" | "outbox"; at: string }

type Prefs = AuthUser["prefs"];

export default function SettingsPage() {
  const { user, token, setSession, logout } = useAuth();
  const isHead = user?.role === "business_head";
  const company = useApi<CompanyResp>("/auth/company");
  const outbox = useApi<Mail[] | { items: Mail[] }>(isHead ? "/mail/outbox" : null);
  const mails: Mail[] | null = outbox.data ? (Array.isArray(outbox.data) ? outbox.data : outbox.data.items ?? []) : null;
  const smtp: "on" | "off" | "unknown" = !mails || mails.length === 0 ? "unknown" : mails[0].sent_via === "smtp" ? "on" : "off";

  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  /** PATCH /auth/me/prefs and keep the session user in sync. */
  const savePrefs = async (patch: Partial<Prefs>, what: string) => {
    const key = Object.keys(patch)[0] as keyof Prefs;
    setSaving(key); setPrefError(null);
    try {
      const r = await apiPatch<{ user: AuthUser }>("/auth/me/prefs", patch);
      if (token && r?.user) setSession(token, r.user);
      announce(`${what} saved.`);
    } catch (e) {
      setPrefError(e instanceof Error ? `Couldn't save: ${e.message}` : "Couldn't save that change.");
    } finally {
      setSaving(null);
    }
  };

  if (!user) return <Loading rows={4} label="Loading your account" />;

  return (
    <PageTemplate explainKey="settings" title="Settings" question="How is your account set up?">
      <div className="settings">
        <div className="settings__pair">
          <Card title="Profile">
            <dl className="settings__dl">
              <dt>Name</dt><dd>{user.name}</dd>
              <dt>Email</dt><dd className="mono">{user.email}</dd>
              <dt>Role</dt><dd>{user.role_label}</dd>
              <dt>Company</dt><dd>{user.company_name}</dd>
            </dl>
            <p className="caption settings__note">To use STRATA as another role, sign out and sign in with that role&apos;s account.</p>
            <Button variant="secondary" size="sm" onClick={logout} icon={<IconLogout size={16} stroke={1.5} aria-hidden="true" />}>Sign out</Button>
          </Card>

          <div className="settings__stack">
            <Card title="Appearance">
              <AppearanceControl
                busy={saving === "theme"}
                onSaved={(t) => void savePrefs({ theme: t }, "Appearance")}
              />
            </Card>
            <Card title="Notifications">
              <div className="settings__toggle-row">
                <div>
                  <div id="alerts-label" className="settings__toggle-title">Email alerts</div>
                  <p id="alerts-desc" className="caption">High-risk decisions and missed deadlines for your role.</p>
                </div>
                <Switch
                  checked={user.prefs?.email_alerts ?? true}
                  disabled={saving === "email_alerts"}
                  labelledBy="alerts-label"
                  describedBy="alerts-desc"
                  onChange={(v) => void savePrefs({ email_alerts: v }, v ? "Email alerts on" : "Email alerts off")}
                />
              </div>
              <p className="caption settings__note">
                {smtp === "off"
                  ? "Email isn't configured on this engine, so alerts go to the in-app mail outbox below."
                  : smtp === "on"
                    ? "Alerts are delivered to your inbox."
                    : "If the engine has no email (SMTP) set up, alerts go to the in-app outbox instead of your inbox."}
              </p>
            </Card>
            {prefError ? <p className="af-error" role="alert">{prefError}</p> : null}
          </div>
        </div>

        <Card title="Company">
          {company.loading ? (
            <Loading rows={3} label="Loading company" />
          ) : company.error ? (
            <ErrorState error={company.error} onRetry={company.reload} title="Could not load your company" />
          ) : company.data ? (
            <CompanySection data={company.data} isHead={isHead} fallbackCode={user.company_code ?? null} />
          ) : (
            <EmptyState title="No company found" next="Sign out and join a company with its 6-character code." />
          )}
        </Card>

        {isHead ? (
          <>
            <Card title="Agent decision deadlines">
              <p className="caption settings__intro">How long people have to decide at each risk level before an agent acts or escalates.</p>
              <PolicyEditor />
            </Card>

            <Card title="Mail outbox">
              <p className="caption settings__intro">The last 50 messages STRATA sent or queued, newest first.</p>
              {outbox.loading ? (
                <Loading rows={4} label="Loading outbox" />
              ) : outbox.error ? (
                <ErrorState error={outbox.error} onRetry={outbox.reload} title="Could not load the outbox" />
              ) : !mails || mails.length === 0 ? (
                <EmptyState title="No mail yet" next="Alerts, sign-in codes and resets will appear here as they are sent." />
              ) : (
                <ul className="outbox">
                  {mails.map((m, i) => (
                    <li key={`${m.at}-${i}`} className="outbox__row">
                      <div className="outbox__main">
                        <span className="outbox__subject">{m.subject}</span>
                        <span className="outbox__to mono">{m.to}</span>
                      </div>
                      <div className="outbox__meta">
                        <StatusPill status={m.sent_via} tone={m.sent_via === "smtp" ? "ok" : "neutral"} label={m.sent_via === "smtp" ? "Emailed" : "Outbox only"} />
                        <span className="caption mono">{fmtDate(m.at, true)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </PageTemplate>
  );
}

/* ------------------------------------------------------------------ */

const THEMES: { key: ThemePref; label: string; icon: React.ReactNode }[] = [
  { key: "light", label: "Light", icon: <IconSun size={16} stroke={1.5} aria-hidden="true" /> },
  { key: "dark", label: "Dark", icon: <IconMoon size={16} stroke={1.5} aria-hidden="true" /> },
  { key: "system", label: "System", icon: <IconDeviceDesktop size={16} stroke={1.5} aria-hidden="true" /> },
];

function AppearanceControl({ busy, onSaved }: { busy: boolean; onSaved: (t: ThemePref) => void }) {
  const { theme, resolved, setTheme } = useTheme();
  const pick = (t: ThemePref) => {
    if (t === theme) return;
    setTheme(t);
    onSaved(t);
  };
  return (
    <fieldset className="segmented" aria-busy={busy || undefined}>
      <legend className="sr-only">Colour theme</legend>
      {THEMES.map((t) => (
        <label key={t.key} className={`segmented__opt${theme === t.key ? " is-on" : ""}`}>
          <input type="radio" name="theme" value={t.key} checked={theme === t.key} onChange={() => pick(t.key)} className="segmented__input" />
          {t.icon}
          <span>{t.label}</span>
        </label>
      ))}
      <p className="caption segmented__hint">{theme === "system" ? `Following your device (now ${resolved}).` : "Saved to your account."}</p>
    </fieldset>
  );
}

function Switch({ checked, onChange, disabled, labelledBy, describedBy }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; labelledBy: string; describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      className={`switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" aria-hidden="true" />
      <span className="switch__text" aria-hidden="true">{checked ? "On" : "Off"}</span>
    </button>
  );
}

const MEMBER_COLUMNS: ColumnDef<Member>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email", meta: { mono: true } },
  { accessorKey: "role_label", header: "Role" },
  {
    accessorKey: "verified",
    header: "Status",
    cell: ({ row }) => row.original.verified
      ? <StatusPill status="ok" label="Verified" />
      : <StatusPill status="pending" label="Awaiting verification" />,
  },
];

function CompanySection({ data, isHead, fallbackCode }: { data: CompanyResp; isHead: boolean; fallbackCode: string | null }) {
  const code = isHead ? (data.company.code ?? fallbackCode) : null;
  return (
    <div className="stack">
      <dl className="settings__dl">
        <dt>Name</dt><dd>{data.company.name}</dd>
        <dt>Industry</dt><dd>{data.company.industry}</dd>
      </dl>
      {code ? <JoinCode code={code} /> : null}
      <div>
        <h3 className="section-label">Members</h3>
        <DataTable
          columns={MEMBER_COLUMNS}
          data={data.members ?? []}
          provenance="synthetic"
          caption="Everyone who joined with your company code. Demo users are synthetic."
          emptyText="Only you so far."
        />
      </div>
    </div>
  );
}

function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      announce("Join code copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      announce(`Copy failed. The code is ${code.split("").join(" ")}.`, "assertive");
    }
  };
  return (
    <div className="joincode">
      <div className="joincode__label">Company join code</div>
      <div className="joincode__row">
        <span className="joincode__code" aria-label={`Join code ${code.split("").join(" ")}`}>{code}</span>
        <Button variant="secondary" size="sm" onClick={() => void copy()} icon={copied ? <IconCheck size={16} stroke={1.5} aria-hidden="true" /> : <IconCopy size={16} stroke={1.5} aria-hidden="true" />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="caption">Share this code with colleagues. It never changes.</p>
    </div>
  );
}
