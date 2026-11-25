"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, inputClass, Segmented } from "@/components/ui";
import { supabase } from "@/lib/client/supabase";

type Mode = "password" | "link";
type Status = { kind: "idle" | "busy" } | { kind: "ok" | "error"; message: string };

/** Supabase error text is not shown verbatim: it can reveal whether an address has an account. */
function friendly(code: string | undefined, fallback: string) {
  if (code === "weak_password") return "Choose a longer password: at least 8 characters, mixing letters and numbers.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many attempts. Wait a minute and try again.";
  return fallback;
}

export default function LoginPage() {
  const sb = supabase();
  const [mode, setMode] = useState<Mode>("password");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setStatus({ kind: "busy" });
    const addr = email.trim();
    if (mode === "link") {
      const { error } = await sb.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: `${origin}/app` } });
      setStatus(error ? { kind: "error", message: friendly(error.code, "That did not work. Check the address and try again.") } : { kind: "ok", message: `Check ${addr} for your sign-in link. You can close this tab.` });
      return;
    }
    if (creating) {
      if (password.length < 8) { setStatus({ kind: "error", message: "Use at least 8 characters." }); return; }
      const { data, error } = await sb.auth.signUp({ email: addr, password, options: { emailRedirectTo: `${origin}/app` } });
      if (error) { setStatus({ kind: "error", message: friendly(error.code, "We could not create the account. Try again, or use an email link.") }); return; }
      if (data.session) { window.location.assign("/app"); return; }
      setStatus({ kind: "ok", message: `We sent a confirmation link to ${addr}. Open it to finish creating your account.` });
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email: addr, password });
    if (error) { setStatus({ kind: "error", message: friendly(error.code, "That email and password do not match.") }); return; }
    window.location.assign("/app");
  }

  async function google() {
    if (!sb) return;
    setStatus({ kind: "busy" });
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${origin}/app` } });
    if (error) setStatus({ kind: "error", message: "Google sign-in is not available right now. Use email instead." });
  }

  const busy = status.kind === "busy";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link href="/" className="font-display text-2xl">Tempo</Link>
      <h1 className="font-display mt-6 text-4xl leading-tight">{creating && mode === "password" ? "Create account" : "Sign in"}</h1>
      <p className="mt-2 text-sm text-ink-2">An account backs up your sessions and exam prep and syncs them across devices.</p>
      {!sb ? (
        <Card className="mt-6 text-sm text-ink-2">Accounts are not set up on this deployment. Tempo still works fully on this device. <Link className="underline" href="/app">Open the app</Link>.</Card>
      ) : status.kind === "ok" ? (
        <Card className="mt-6 border-green bg-green-soft text-sm"><p role="status">{status.message}</p></Card>
      ) : (
        <>
          <Button variant="outline" className="mt-6 w-full" onClick={google} disabled={busy}>Continue with Google</Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
          <Segmented label="Sign-in method" value={mode} onChange={(v) => { setMode(v); setStatus({ kind: "idle" }); }} options={[{ value: "password", label: "Password" }, { value: "link", label: "Email link" }]} />
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input type="email" required autoComplete="email" className={inputClass} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
            {mode === "password" && (
              <input type="password" required minLength={creating ? 8 : 1} autoComplete={creating ? "new-password" : "current-password"} className={inputClass} placeholder={creating ? "New password (8+ characters)" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "link" ? "Email me a link" : creating ? "Create account" : "Sign in"}
            </Button>
            {status.kind === "error" && <p className="text-sm text-terra" role="alert">{status.message}</p>}
          </form>
          {mode === "password" && (
            <div className="mt-3 flex justify-between text-sm">
              <button type="button" className="underline" onClick={() => { setCreating(!creating); setStatus({ kind: "idle" }); }}>{creating ? "I have an account" : "Create an account"}</button>
              {!creating && <Link className="underline" href="/reset">Forgot password?</Link>}
            </div>
          )}
        </>
      )}
      <p className="mt-8 text-xs text-muted">You do not need an account to use the timer. <Link className="underline" href="/app">Continue without signing in</Link>. By signing in you agree to the <Link className="underline" href="/terms">terms</Link> and <Link className="underline" href="/privacy">privacy notice</Link>.</p>
    </main>
  );
}
