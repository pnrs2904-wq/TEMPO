"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { supabase } from "@/lib/client/supabase";

/**
 * Two steps on one page: ask for a reset email, then (arriving from that email with a recovery
 * session) choose a new password. The response never says whether the address has an account.
 */
export default function ResetPage() {
  const sb = supabase();
  const [recovering, setRecovering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setRecovering(true); });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
    setBusy(false);
    setMsg({ ok: true, text: `If ${email.trim()} has a Tempo account, a reset link is on its way.` });
  }

  async function update(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) return;
    if (password.length < 8) { setMsg({ ok: false, text: "Use at least 8 characters." }); return; }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    setMsg(error ? { ok: false, text: "The link has expired. Request a new one." } : { ok: true, text: "Password changed. You are signed in." });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <Link href="/" className="font-display text-2xl">Tempo</Link>
      <h1 className="font-display mt-6 text-4xl">{recovering ? "New password" : "Reset password"}</h1>
      {!sb ? (
        <Card className="mt-6 text-sm text-ink-2">Accounts are not set up on this deployment.</Card>
      ) : msg?.ok ? (
        <Card className="mt-6 border-green bg-green-soft text-sm"><p role="status">{msg.text}</p>{recovering && <Link className="mt-2 block underline" href="/app">Open Tempo</Link>}</Card>
      ) : (
        <form onSubmit={recovering ? update : request} className="mt-6 space-y-3">
          {recovering
            ? <input type="password" required minLength={8} autoComplete="new-password" className={inputClass} placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" />
            : <input type="email" required autoComplete="email" className={inputClass} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : recovering ? "Save password" : "Send reset link"}</Button>
          {msg && !msg.ok && <p className="text-sm text-terra" role="alert">{msg.text}</p>}
        </form>
      )}
      <p className="mt-6 text-sm"><Link className="underline" href="/login">Back to sign in</Link></p>
    </main>
  );
}
