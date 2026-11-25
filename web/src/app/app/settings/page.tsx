"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, Eyebrow, Segmented, Toggle, cx, inputClass } from "@/components/ui";
import { generateCsv, generateJson } from "@/domain/export";
import { PLANS } from "@/domain/plans";
import { download } from "@/lib/client/download";
import { freeAccessLastDay } from "@/lib/client/freeAccess";
import { exportPrep, getPrep } from "@/lib/client/prep";
import type { ThemeId } from "@/domain/exam";
import { eraseThisDevice, signOut, syncNow, updateProfile, updateUserState, useTempo } from "@/lib/client/store";
import { accessToken, api, supabase, type ApiError } from "@/lib/client/supabase";

export default function SettingsPage() {
  const { userState, sessions, signedIn, email, me, sync } = useTempo();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const accounts = supabase() !== null;
  const ent = me?.entitlement;
  const exportable = sessions.filter((s) => !s.deletedAt).sort((a, b) => a.timestamp - b.timestamp);

  async function patchProfile(patch: Record<string, unknown>) {
    setBusy("profile");
    setMsg(null);
    try {
      await updateProfile(patch as { ai_enabled?: boolean; ai_include_notes?: boolean });
    } catch (e) {
      setMsg((e as ApiError).error);
    } finally {
      setBusy(null);
    }
  }

  async function accountExport() {
    const token = await accessToken();
    const res = await fetch("/api/account", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) download("tempo-account-export.json", await res.text(), "application/json");
    else setMsg("Could not download your account data. Please try again.");
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      await api("/api/account", { method: "DELETE", body: { confirmation: "DELETE" } });
      await eraseThisDevice();
      await signOut();
      setMsg("Your account and its data have been deleted.");
    } catch (e) {
      setMsg((e as ApiError).error);
    } finally {
      setBusy(null);
      setConfirmDelete("");
    }
  }

  const goal = (key: "dailyGoalMinutes" | "weeklyGoalMinutes", label: string, max: number) => (
    <label className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2 text-xs text-muted">
        <input type="number" inputMode="numeric" min={0} max={max} step={15} className={cx(inputClass, "w-24 text-right")} value={userState[key]}
          onChange={(e) => void updateUserState({ [key]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) })} />
        min
      </span>
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-3xl">You</h1>
      {msg && <Card className="border-blue bg-blue-soft text-sm" ><p role="status">{msg}</p></Card>}

      <Card>
        <Eyebrow>Account</Eyebrow>
        {signedIn ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{email}</p>
              <p className="text-xs text-muted">
                {sync.status === "idle" && sync.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : sync.message ?? "Your sessions are stored on this device."}
              </p>
            </div>
            <div className="flex gap-2">
              {ent?.features.sync && <Button variant="outline" onClick={() => void syncNow()}>Sync now</Button>}
              {me?.isAdmin && <Link href="/app/admin" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-medium">Admin</Link>}
              <Button variant="quiet" onClick={() => void signOut()}>Sign out</Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-sm text-ink-2">
              {accounts ? "Tempo works fully without an account. Sign in to back up and sync across devices with Pro." : "This deployment runs in local-only mode. Everything is stored on this device."}
            </p>
            {accounts && <Link href="/login"><Button>Sign in</Button></Link>}
          </div>
        )}
      </Card>

      <Card>
        <Eyebrow>Plan</Eyebrow>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl">{me?.billingSource === "free_access" ? "Pro · launch offer" : ent?.plan ? PLANS[ent.plan].name : "Free"}</p>
            <p className="text-xs text-muted">
              {me?.billingSource === "free_access" && me.freeAccessUntil ? `Every Pro feature is free for everyone until ${freeAccessLastDay(me.freeAccessUntil)}.` : ent?.tier === "lifetime" ? "Never expires." : ent?.expiresAt ? `Active until ${new Date(ent.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.` : "Timer, adaptive recommendations, exam mode and exports are free."}
            </p>
          </div>
          <div className="flex gap-2">
            {me?.billingSource === "play" && <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noreferrer"><Button variant="quiet">Manage in Google Play</Button></a>}
            <Link href="/pricing"><Button variant="outline">{ent && ent.tier !== "free" ? "Plans" : "See Pro"}</Button></Link>
          </div>
        </div>
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          {me?.billingSource === "free_access" ? "Nothing to pay and nothing to cancel. When the offer ends your data stays put; cloud sync pauses unless you choose a plan." : me?.billingSource === "play" ? "Bought on Android through Google Play. Renewal and cancellation are managed in the Play Store." : "Web passes are one-time payments: nothing renews automatically. Pro bought on Android or the web works on both."}
        </p>
      </Card>

      <Card>
        <Eyebrow>Goals</Eyebrow>
        <div className="mt-1 divide-y divide-line">
          {goal("dailyGoalMinutes", "Daily focus goal", 1440)}
          {goal("weeklyGoalMinutes", "Weekly focus goal", 10080)}
        </div>
        <p className="mt-2 text-xs text-muted">Subject goals in Exam mode replace the daily goal when they are set.</p>
      </Card>

      <Card>
        <Eyebrow>Timer</Eyebrow>
        <div className="divide-y divide-line">
          <Toggle label="Completion sound" checked={userState.soundEnabled} onChange={(v) => void updateUserState({ soundEnabled: v })} />
          <Toggle label="Start the break automatically" description="After you finish the feedback for a focus session." checked={userState.autoStartBreak} onChange={(v) => void updateUserState({ autoStartBreak: v })} />
          <Toggle label="Plain view instead of the ring" description="Shows the timer as large text with a progress bar. Better for screen readers and very small screens." checked={userState.listView} onChange={(v) => void updateUserState({ listView: v })} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Rounds and sounds</Eyebrow>
        <p className="mt-1 text-xs text-muted">Round cycle and ticking adapted from Pomotroid (MIT licence). Focus length still comes from Tempo&apos;s recommendation.</p>
        <div className="divide-y divide-line">
          <Stepper label="Focus rounds before a long break" value={userState.rounds.roundsBeforeLongBreak} min={1} max={12} step={1} unit=""
            onChange={(v) => void updateUserState({ rounds: { ...userState.rounds, roundsBeforeLongBreak: v } })} />
          <Stepper label="Long break" value={userState.rounds.longBreakMinutes} min={5} max={60} step={5} unit=" min"
            onChange={(v) => void updateUserState({ rounds: { ...userState.rounds, longBreakMinutes: v } })} />
          <Toggle label="Short breaks" description="Between focus rounds. Their length follows your energy." checked={userState.rounds.shortBreaksEnabled} onChange={(v) => void updateUserState({ rounds: { ...userState.rounds, shortBreaksEnabled: v } })} />
          <Toggle label="Long breaks" checked={userState.rounds.longBreaksEnabled} onChange={(v) => void updateUserState({ rounds: { ...userState.rounds, longBreaksEnabled: v } })} />
          <Toggle label="Start the next focus round automatically" description="When a break ends, repeat your last focus setup." checked={userState.autoStartFocus} onChange={(v) => void updateUserState({ autoStartFocus: v })} />
          <Toggle label="Tick during focus" checked={userState.tickFocus} onChange={(v) => void updateUserState({ tickFocus: v })} />
          <Toggle label="Tick during breaks" checked={userState.tickBreak} onChange={(v) => void updateUserState({ tickBreak: v })} />
          <label className="flex items-center justify-between gap-4 py-3 text-sm">
            <span className="font-medium">Volume</span>
            <input type="range" min={0} max={100} step={5} value={userState.volume} onChange={(e) => void updateUserState({ volume: Number(e.target.value) })} className="w-40 accent-[var(--ink)]" aria-label="Volume" />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">Shortcuts on the Focus page: Space starts, pauses and resumes; B starts a break.</p>
      </Card>

      <Card>
        <Eyebrow>Appearance</Eyebrow>
        <div className="mt-2">
          <Segmented<ThemeId> label="Theme" value={userState.theme} onChange={(t) => void updateUserState({ theme: t })}
            options={[{ value: "auto", label: "Match device" }, { value: "paper", label: "Paper" }, { value: "night", label: "Night" }, { value: "contrast", label: "High contrast" }]} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Exam mode</Eyebrow>
        <Toggle label="Use exam preparation" description="Adds your exam's subjects to the timer, exam-aware recommendations, and the Exam tab's syllabus, revisions, mocks and plan. Off is Simple Mode: just the timer."
          checked={userState.advancedMode} onChange={(v) => void updateUserState({ advancedMode: v })} />
      </Card>

      <Card>
        <Eyebrow>AI study reflections</Eyebrow>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Optional, and off unless you turn it on. When on, Tempo sends totals from your last 14 days (minutes, completion, energy and focus ratings per subject) to Google Gemini through our server to write a short reflection. Everything else in Tempo works without it.
        </p>
        <div className="mt-1 divide-y divide-line">
          <Toggle label="Allow AI reflections" checked={me?.profile.ai_enabled ?? false} disabled={!signedIn || !ent?.features.aiReflections || busy === "profile"}
            description={!signedIn ? "Sign in first." : !ent?.features.aiReflections ? "Included with Pro." : me?.aiAvailable ? `${ent.features.aiMonthlyQuota} reflections a month on your plan.` : "Not available on this deployment yet."}
            onChange={(v) => void patchProfile({ ai_enabled: v, ...(v ? {} : { ai_include_notes: false }) })} />
          <Toggle label="Include my session notes" checked={me?.profile.ai_include_notes ?? false} disabled={!me?.profile.ai_enabled || busy === "profile"}
            description="Off by default. Up to five recent notes, shortened and with emails, phone numbers and passwords removed first."
            onChange={(v) => void patchProfile({ ai_include_notes: v })} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Your data</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download("tempo-sessions.csv", generateCsv(exportable), "text/csv;charset=utf-8")}>Export sessions (CSV)</Button>
          <Button variant="outline" onClick={() => download("tempo-sessions.json", generateJson(exportable), "application/json")}>Export sessions (JSON)</Button>
          <Button variant="outline" onClick={() => download("tempo-exam-prep.json", JSON.stringify({ settings: userState, ...exportPrep(getPrep()) }, null, 2), "application/json")}>Export exam prep and settings</Button>
          {signedIn && <Button variant="outline" onClick={() => void accountExport()}>Download everything on our servers</Button>}
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-medium">Erase this device</p>
          <p className="mt-0.5 text-xs text-muted">Removes all sessions, goals and settings stored in this browser. It cannot be undone{signedIn && ent?.features.sync ? "; synced data will download again on the next sync" : ""}.</p>
          {confirmErase ? (
            <div className="mt-2 flex gap-2">
              <Button variant="danger" onClick={() => { void eraseThisDevice(); setConfirmErase(false); setMsg("This device has been erased."); }}>Yes, erase {exportable.length} sessions</Button>
              <Button variant="quiet" onClick={() => setConfirmErase(false)}>Cancel</Button>
            </div>
          ) : <Button variant="danger" className="mt-2" onClick={() => setConfirmErase(true)}>Erase this device</Button>}
        </div>

        {signedIn && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-medium">Delete my account</p>
            <p className="mt-0.5 text-xs text-muted">Permanently deletes your account, synced sessions, preferences, exam prep (plans, syllabus progress, revisions, mocks) and group memberships from our servers, and erases this device. Type DELETE to confirm.</p>
            <div className="mt-2 flex gap-2">
              <input className={cx(inputClass, "max-w-40")} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
              <Button variant="danger" disabled={confirmDelete !== "DELETE" || busy === "delete"} onClick={() => void deleteAccount()}>Delete account</Button>
            </div>
          </div>
        )}
      </Card>

      <p className="pb-4 text-center text-xs text-muted">
        <Link className="underline" href="/privacy">Privacy</Link> · <Link className="underline" href="/terms">Terms</Link> · <Link className="underline" href="/">About Tempo</Link>
      </p>
    </div>
  );
}

function Stepper({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label={`Less: ${label}`} className="h-9 w-9 rounded-full border border-line disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
        <span className="tnum w-14 text-center">{value}{unit}</span>
        <button type="button" aria-label={`More: ${label}`} className="h-9 w-9 rounded-full border border-line disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
      </span>
    </div>
  );
}
