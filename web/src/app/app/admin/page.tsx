"use client";
/**
 * Admin dashboard. Postgres refuses every admin call unless the profile role is 'admin' AND the
 * session passed two-factor verification (aal2), so this page first walks the admin through
 * setting up or using an authenticator app. Hiding the page is a convenience, not the protection.
 * Metrics are counts only: no emails, notes or subjects.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Eyebrow, Segmented, Stat, Toggle, inputClass } from "@/components/ui";
import { formatRupees } from "@/domain/plans";
import { supabase } from "@/lib/client/supabase";

interface Metrics {
  windowDays: number;
  totalUsers: number;
  newUsers: number;
  activeProUsers: number;
  proBySource: Record<string, number>;
  dau: number;
  mau: number;
  sessionsLogged: number;
  focusMinutes: number;
  mocksLogged: number;
  revisionsLogged: number;
  revenuePaise: number;
  paymentsByStatus: Record<string, number>;
  examDistribution: { examId: string; users: number }[];
  dailyActive: { day: string; users: number }[];
}
interface Flag { key: string; enabled: boolean; description: string | null }
interface Audit { id: string; action: string; target: string; metadata: Record<string, unknown> | null; created_at: string }
type MfaStep = { kind: "checking" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string } | { kind: "ok" };

const fmt = (n: number) => Number(n ?? 0).toLocaleString("en-IN");

export default function AdminPage() {
  const sb = supabase();
  const [mfa, setMfa] = useState<MfaStep>({ kind: "checking" });
  const [code, setCode] = useState("");
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [m, setM] = useState<Metrics | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 1. Two-factor: reach aal2 before anything else.
  useEffect(() => {
    if (!sb) return;
    void (async () => {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return setMfa({ kind: "ok" });
      const { data: factors } = await sb.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) return setMfa({ kind: "verify", factorId: verified.id });
      // Remove half-finished enrolments so a fresh QR code can be issued.
      for (const f of factors?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Tempo admin ${new Date().toISOString().slice(0, 10)}` });
      if (e || !data) return setError("Two-factor sign-in is not enabled for this project. Turn on TOTP in Supabase → Authentication → Sign In / MFA.");
      setMfa({ kind: "enroll", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [sb]);

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!sb || (mfa.kind !== "enroll" && mfa.kind !== "verify")) return;
    setError(null);
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId: mfa.factorId, code: code.trim() });
    if (err) return setError("That code did not work. Check your authenticator app's clock and try the newest code.");
    setCode("");
    setMfa({ kind: "ok" });
  }

  // 2. Data, once at aal2.
  const load = useCallback(async () => {
    if (!sb || mfa.kind !== "ok") return;
    const [metrics, f, a] = await Promise.all([
      sb.rpc("admin_metrics", { p_days: Number(days) }),
      sb.from("feature_flags").select("key, enabled, description").order("key"),
      sb.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (metrics.error) {
      setError(/admin role/.test(metrics.error.message) ? "This page is for Tempo administrators." : "Could not load metrics.");
      return;
    }
    setError(null);
    setM(metrics.data as Metrics);
    setFlags((f.data ?? []) as Flag[]);
    setAudit((a.data ?? []) as Audit[]);
  }, [sb, days, mfa.kind]);
  useEffect(() => { void load(); }, [load]);

  async function toggle(flag: Flag, enabled: boolean) {
    if (!sb) return;
    const reason = window.prompt(`Reason for turning ${flag.key} ${enabled ? "on" : "off"} (kept in the audit log)`) ?? "";
    const { error: e } = await sb.rpc("set_feature_flag", { p_key: flag.key, p_enabled: enabled, p_reason: reason.slice(0, 200) });
    if (e) setError("Could not change the flag.");
    await load();
  }

  if (!sb) return <Card className="mx-auto max-w-xl text-sm text-ink-2">Accounts are not configured on this deployment.</Card>;

  if (mfa.kind !== "ok") {
    return (
      <Card className="mx-auto max-w-md space-y-3">
        <h1 className="font-display text-2xl">Admin sign-in check</h1>
        {mfa.kind === "checking" && !error && <p className="text-sm text-muted">Checking two-factor status…</p>}
        {mfa.kind === "enroll" && (
          <>
            <p className="text-sm text-ink-2">Admin access needs an authenticator app (Google Authenticator, Authy, 1Password…). Scan this code, then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mfa.qr} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
            <p className="break-all text-center text-xs text-muted">Or enter this key: <code>{mfa.secret}</code></p>
          </>
        )}
        {mfa.kind === "verify" && <p className="text-sm text-ink-2">Enter the 6-digit code from your authenticator app.</p>}
        {(mfa.kind === "enroll" || mfa.kind === "verify") && (
          <form onSubmit={confirmCode} className="flex gap-2">
            <input className={inputClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} aria-label="Authenticator code" />
            <Button type="submit">Verify</Button>
          </form>
        )}
        {error && <p className="text-sm text-terra" role="alert">{error}</p>}
      </Card>
    );
  }

  if (error && !m) return <Card className="mx-auto max-w-xl text-sm text-ink-2">{error}</Card>;
  if (!m) return <p className="text-center text-sm text-muted">Loading…</p>;

  const maxDaily = Math.max(1, ...m.dailyActive.map((d) => d.users));
  const listRows = (o: Record<string, number>) => Object.entries(o).length === 0
    ? <li className="text-muted">None.</li>
    : Object.entries(o).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{fmt(v)}</span></li>);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl">Admin</h1>
        <div className="w-60"><Segmented label="Period" value={days} onChange={setDays} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} /></div>
      </div>
      {error && <Card className="border-terra bg-terra-soft text-sm"><p role="alert">{error}</p></Card>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><Stat label="Accounts" value={fmt(m.totalUsers)} sub={`+${fmt(m.newUsers)} in period`} /></Card>
        <Card><Stat label="Active today" value={fmt(m.dau)} sub={`${fmt(m.mau)} in last 30 days`} /></Card>
        <Card><Stat label="Pro users" value={fmt(m.activeProUsers)} sub={Object.entries(m.proBySource).map(([k, v]) => `${k} ${v}`).join(" · ") || "none yet"} /></Card>
        <Card><Stat label="Web revenue" value={formatRupees(m.revenuePaise)} sub="Razorpay, in period" /></Card>
      </div>

      <Card>
        <Eyebrow>Daily active users (synced accounts)</Eyebrow>
        {m.dailyActive.length === 0 ? <p className="mt-2 text-sm text-muted">No synced sessions in this period.</p> : (
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Distinct users with at least one synced session, per day</caption>
            <tbody>
              {m.dailyActive.slice(-14).map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="w-28 py-0.5 text-left font-normal text-muted">{new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</th>
                  <td className="py-0.5"><div className="h-3 rounded-r-full bg-blue" style={{ width: `${Math.max(2, (d.users / maxDaily) * 100)}%` }} aria-hidden /></td>
                  <td className="w-14 py-0.5 text-right tabular-nums">{fmt(d.users)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Eyebrow>Exams chosen</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm">
            {m.examDistribution.length === 0 && <li className="text-muted">No synced exam plans yet.</li>}
            {m.examDistribution.slice(0, 12).map((e) => <li key={e.examId} className="flex justify-between"><span>{e.examId}</span><span className="tabular-nums">{fmt(e.users)}</span></li>)}
          </ul>
        </Card>
        <Card>
          <Eyebrow>Use in period</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex justify-between"><span>Sessions</span><span className="tabular-nums">{fmt(m.sessionsLogged)}</span></li>
            <li className="flex justify-between"><span>Focus minutes</span><span className="tabular-nums">{fmt(m.focusMinutes)}</span></li>
            <li className="flex justify-between"><span>Mocks logged</span><span className="tabular-nums">{fmt(m.mocksLogged)}</span></li>
            <li className="flex justify-between"><span>Revisions logged</span><span className="tabular-nums">{fmt(m.revisionsLogged)}</span></li>
          </ul>
          <Eyebrow className="mt-4">Web payments by status</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm">{listRows(m.paymentsByStatus)}</ul>
        </Card>
      </div>

      <Card>
        <Eyebrow>Feature flags</Eyebrow>
        <div className="mt-2 divide-y divide-line">
          {flags.map((f) => <div key={f.key} className="py-2"><Toggle checked={f.enabled} onChange={(v) => void toggle(f, v)} label={f.key} description={f.description ?? undefined} /></div>)}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between"><Eyebrow>Audit log</Eyebrow><Button variant="quiet" onClick={() => void load()}>Refresh</Button></div>
        <ul className="mt-2 space-y-1 text-sm">
          {audit.length === 0 && <li className="text-muted">No admin actions yet.</li>}
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2">
              <span><strong className="font-medium">{a.action}</strong> {a.target} <span className="text-muted">{a.metadata ? JSON.stringify(a.metadata) : ""}</span></span>
              <time className="text-muted" dateTime={a.created_at}>{new Date(a.created_at).toLocaleString("en-IN")}</time>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
