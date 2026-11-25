"use client";
/**
 * Application state. A small external store read with useSyncExternalStore.
 *
 * Timer design (ported from TempoViewModel.kt):
 *   - The running timer is a few timestamps in localStorage, written synchronously on every
 *     transition. Nothing is counted in memory, so a refresh, crash or backgrounded tab resumes
 *     with the exact remaining time, and a timer that ran out while the page was closed is
 *     completed on the next load with its true finish time.
 *   - The session row is created when the timer starts and updated on every transition, so an
 *     unfinished session is always visible as unfinished.
 */
import { useSyncExternalStore } from "react";
import { defaultBreakMinutesFor } from "@/domain/energy";
import { defaultUserState, migrateUserState, type UserState } from "@/domain/exam";
import { advanceRound, initialRoundState, roundLabel, type RoundState } from "@/domain/timer/rounds";
import type { PrepEnvelope } from "@/domain/prep/types";
import { FEATURES, type Entitlement } from "@/domain/plans";
import { mergeSessions } from "@/domain/sync";
import { deviceTimeZone, localDateKey } from "@/domain/time";
import { elapsedSeconds, finishTimestamp, isFinished, pause as pauseTimer, restore, resume as resumeTimer, type ActiveTimer } from "@/domain/timer";
import { LIMITS, isTerminal, type DurationFeedback, type Session, type SessionType } from "@/domain/types";
import { clearOutbox, clearPrepOutbox, getMeta, loadPrep, loadSessions, outboxIds, prepOutboxKeys, saveSessions, setMeta, wipeDevice } from "./db";
import { applyRemotePrep, initPrep, resetPrepMemory, setPrepSyncHook } from "./prep";
import { prepFromWire, prepToWire, sessionFromWire, sessionToWire } from "./wire";
import { playCue, playTick } from "./sounds";
import { api, supabase, type ApiError } from "./supabase";

const TIMER_KEY = "tempo.timer.v1";
const STATE_KEY = "userState";
const CURSOR_KEY = "syncCursor";
const PREP_CURSOR_KEY = "prepSyncCursor";
const ROUND_KEY = "roundState";

export interface Me {
  user: { id: string; email?: string };
  profile: { display_name: string | null; timezone: string; ai_enabled: boolean; ai_include_notes: boolean };
  entitlement: Entitlement;
  /** Where Pro was bought: cancellation for Google Play purchases happens in the Play Store. */
  billingSource: "razorpay" | "play" | "grant" | "none";
  aiAvailable: boolean;
  billingAvailable: boolean;
  /** Shows the admin link only; every admin action is checked again in Postgres (role + MFA). */
  isAdmin?: boolean;
  prices: { pro_monthly: number; pro_annual: number; lifetime: number };
}

/** GET /api/me as the server sends it (shared with Android). */
interface ServerMe {
  user: { id: string; email: string | null };
  profile: { role: string; displayName: string | null; aiOptIn: boolean; aiNotesOptIn: boolean };
  entitlement: { isPro: boolean; plan: string; status: string; source: string; currentPeriodEnd: string | null };
  isAdmin: boolean;
  prices: Record<string, { amountPaise: number }>;
  paymentMethods: string[] | Record<string, unknown>;
}

function toMe(m: ServerMe, flags: Record<string, boolean>): Me {
  const plan = (["pro_monthly", "pro_annual", "lifetime"] as const).find((p) => p === m.entitlement.plan) ?? null;
  const tier = !m.entitlement.isPro ? "free" : plan === "lifetime" ? "lifetime" : "pro";
  const methods = Array.isArray(m.paymentMethods) ? m.paymentMethods : Object.keys(m.paymentMethods ?? {});
  return {
    user: { id: m.user.id, email: m.user.email ?? undefined },
    profile: { display_name: m.profile.displayName, timezone: deviceTimeZone(), ai_enabled: m.profile.aiOptIn, ai_include_notes: m.profile.aiNotesOptIn },
    entitlement: { tier, plan: tier === "free" ? null : plan, expiresAt: tier === "free" ? null : m.entitlement.currentPeriodEnd, features: FEATURES[tier] },
    billingSource: (["razorpay", "play", "grant"] as const).find((x) => x === m.entitlement.source) ?? "none",
    aiAvailable: Boolean(flags.ai_reflections),
    billingAvailable: methods.some((x) => String(x).toLowerCase().includes("razorpay")),
    isAdmin: m.isAdmin,
    prices: { pro_monthly: m.prices.pro_monthly?.amountPaise ?? 0, pro_annual: m.prices.pro_annual?.amountPaise ?? 0, lifetime: m.prices.lifetime?.amountPaise ?? 0 },
  };
}

export interface AppState {
  ready: boolean;
  /** Wall clock, refreshed by the ticker so countdowns and the ring's hand re-render. */
  now: number;
  sessions: Session[];
  userState: UserState;
  timer: ActiveTimer | null;
  /** Focus session that just finished and is waiting for feedback. */
  pendingFeedbackId: string | null;
  /** Pomotroid-style position in the focus/break cycle. */
  round: RoundState;
  /** Offer a break after feedback is saved or skipped. */
  breakOffer: boolean;
  signedIn: boolean;
  email: string | null;
  me: Me | null;
  sync: { status: "idle" | "syncing" | "offline" | "error" | "local"; lastSyncedAt: number | null; message: string | null };
}

let state: AppState = {
  ready: false, now: 0, sessions: [], userState: defaultUserState(), timer: null, pendingFeedbackId: null, round: initialRoundState(), breakOffer: false,
  signedIn: false, email: null, me: null, sync: { status: "local", lastSyncedAt: null, message: null },
};

const listeners = new Set<() => void>();
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export function useTempo(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
export const getState = () => state;

// ---------------------------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------------------------
function readTimer(): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as ActiveTimer;
    return t && typeof t.sessionId === "string" && typeof t.plannedSeconds === "number" && (t.state === "RUNNING" || t.state === "PAUSED") ? t : null;
  } catch {
    return null;
  }
}

function writeTimer(t: ActiveTimer | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch {
    /* storage unavailable (private mode): the timer still runs for this page load */
  }
  set({ timer: t });
}

async function persist(changed: Session[]) {
  const byId = new Map(state.sessions.map((s) => [s.id, s]));
  for (const s of changed) byId.set(s.id, s);
  set({ sessions: [...byId.values()] });
  await saveSessions(changed);
  scheduleSync();
}

function patchSession(id: string, patch: Partial<Session>, now = Date.now()): Session | null {
  const current = state.sessions.find((s) => s.id === id);
  if (!current) return null;
  return { ...current, ...patch, updatedAt: Math.max(now, current.updatedAt + 1) };
}

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------------------------
let started = false;
let ticker: ReturnType<typeof setInterval> | null = null;

export async function init() {
  if (started || typeof window === "undefined") return;
  started = true;

  const [sessions, storedState, storedRound] = await Promise.all([loadSessions(), getMeta<unknown>(STATE_KEY), getMeta<RoundState>(ROUND_KEY), initPrep()]);
  setPrepSyncHook(() => scheduleSync());
  set({ sessions, userState: migrateUserState(storedState), timer: readTimer(), round: storedRound ?? initialRoundState() });
  applyTheme(state.userState.theme);

  await reconcile();
  set({ ready: true, now: Date.now() });

  ticker = setInterval(tick, 500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
      scheduleSync(200);
    }
  });
  // Another tab changed the timer: follow it rather than running two clocks.
  window.addEventListener("storage", (e) => {
    if (e.key === TIMER_KEY) {
      set({ timer: readTimer() });
      void loadSessions().then((s) => set({ sessions: s }));
    }
  });
  window.addEventListener("online", () => scheduleSync(200));

  const sb = supabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    applyAuth(Boolean(data.session), data.session?.user.email ?? null);
    sb.auth.onAuthStateChange((_evt, session) => applyAuth(Boolean(session), session?.user.email ?? null));
  }
}

function applyAuth(signedIn: boolean, email: string | null) {
  const changed = signedIn !== state.signedIn;
  set({ signedIn, email, ...(signedIn ? {} : { me: null, sync: { status: "local", lastSyncedAt: null, message: null } }) });
  if (signedIn && changed) void refreshMe().then(() => scheduleSync(100));
}

/** AI consent lives on the profile row; users may update their own row (RLS), never its role. */
export async function updateProfile(patch: { ai_enabled?: boolean; ai_include_notes?: boolean }): Promise<void> {
  const sb = supabase();
  const uid = state.me?.user.id;
  if (!sb || !uid) throw { status: 401, error: "Sign in first." } as ApiError;
  const row: Record<string, boolean> = {};
  if (patch.ai_enabled !== undefined) { row.ai_opt_in = patch.ai_enabled; if (!patch.ai_enabled) row.ai_notes_opt_in = false; }
  if (patch.ai_include_notes !== undefined) row.ai_notes_opt_in = patch.ai_include_notes;
  const { error } = await sb.from("profiles").update(row).eq("id", uid);
  if (error) throw { status: 400, error: "Could not save that setting." } as ApiError;
  await refreshMe();
}

export async function refreshMe(): Promise<void> {
  if (!state.signedIn) return;
  try {
    const [me, flags] = await Promise.all([
      api<ServerMe>("/api/me", { method: "GET" }),
      api<{ flags: Record<string, boolean> }>("/api/flags", { method: "GET" }).catch(() => ({ flags: {} as Record<string, boolean> })),
    ]);
    set({ me: toMe(me, flags.flags) });
  } catch {
    /* offline: keep the last known value */
  }
}

/**
 * Brings stored state into a consistent shape after a reload:
 *   - a timer that ran out while the page was closed completes with its real finish time;
 *   - sessions left "active" or "paused" with no timer (a crash, cleared storage) are closed as
 *     ended early with the time they had recorded, or cancelled if they never ran.
 */
async function reconcile() {
  const now = Date.now();
  const timer = state.timer;
  const r = restore(timer, now);
  if (timer && r.completedWhileAway) await completeTimer(finishTimestamp(timer));

  const liveId = state.timer?.sessionId;
  const orphans = state.sessions
    .filter((s) => !s.deletedAt && (s.status === "active" || s.status === "paused" || s.status === "unknown") && s.id !== liveId)
    .map((s) => patchSession(s.id, { status: s.actualSeconds > 0 ? "ended_early" : "cancelled" }, now))
    .filter((s): s is Session => s !== null);
  if (orphans.length > 0) await persist(orphans);
  if (timer && !state.sessions.some((s) => s.id === timer.sessionId)) writeTimer(null);
}

function tick() {
  const t = state.timer;
  const now = Date.now();
  if (!t) {
    if (now - state.now > 20_000) set({ now });
    return;
  }
  if (isFinished(t, now)) void completeTimer(finishTimestamp(t));
  else {
    const prevSecond = Math.floor((state.now - t.runStartTimestamp) / 1000);
    const second = Math.floor((now - t.runStartTimestamp) / 1000);
    const wantTick = t.state === "RUNNING" && document.visibilityState === "visible" && (t.phase === "focus" ? state.userState.tickFocus : state.userState.tickBreak);
    if (wantTick && second !== prevSecond) playTick(state.userState.volume);
    set({ now });
  }
}

// ---------------------------------------------------------------------------------------------
// Timer actions
// ---------------------------------------------------------------------------------------------
export interface StartInput {
  energy: number;
  subject: string;
  sessionType: SessionType;
  plannedMinutes: number;
  expectedDifficulty: number | null;
  topicId: string | null;
}

export async function startFocus(input: StartInput) {
  if (state.timer) return;
  const now = Date.now();
  const tz = deviceTimeZone();
  const max = input.sessionType === "Mock Test" ? LIMITS.mockMaxMinutes : LIMITS.manualMaxMinutes;
  const plannedMinutes = Math.min(max, Math.max(LIMITS.manualMinMinutes, Math.round(input.plannedMinutes)));
  const session: Session = {
    id: newId(), timestamp: now, tz, localDate: localDateKey(now, tz), phase: "focus",
    energy: Math.min(5, Math.max(1, input.energy)), subject: input.subject.trim().slice(0, LIMITS.subjectMax),
    sessionType: input.sessionType, plannedMinutes, actualSeconds: 0, status: "active",
    focusQuality: null, difficulty: null, durationFeedback: null, distractions: null, notes: null,
    expectedDifficulty: input.expectedDifficulty, topicId: input.topicId, mockScore: null, mockMaxScore: null,
    createdAt: now, updatedAt: now, deletedAt: null,
  };
  set({ pendingFeedbackId: null, breakOffer: false });
  // Starting focus while a break is due counts as skipping that break (as in Pomotroid).
  if (state.round.current !== "focus") setRound(advanceRound(state.round, state.userState.rounds));
  writeTimer({
    sessionId: session.id, phase: "focus", energy: session.energy, subject: session.subject, sessionType: session.sessionType,
    plannedSeconds: plannedMinutes * 60, accumulatedElapsedMs: 0, runStartTimestamp: now, state: "RUNNING", savedTimestamp: now,
  });
  await persist([session]);
  void keepAwake(true);
}

export async function startBreak(minutes?: number) {
  if (state.timer) return;
  const now = Date.now();
  const tz = deviceTimeZone();
  const last = [...state.sessions].sort((a, b) => b.timestamp - a.timestamp)[0];
  const energy = last?.energy ?? 3;
  const isLong = state.round.current === "long_break";
  const plannedMinutes = Math.min(60, Math.max(1, Math.round(minutes ?? (isLong ? state.userState.rounds.longBreakMinutes : defaultBreakMinutesFor(energy)))));
  const session: Session = {
    id: newId(), timestamp: now, tz, localDate: localDateKey(now, tz), phase: "break", energy, subject: last?.subject ?? "",
    sessionType: last?.sessionType ?? "Study", plannedMinutes, actualSeconds: 0, status: "active",
    focusQuality: null, difficulty: null, durationFeedback: null, distractions: null, notes: null,
    expectedDifficulty: null, topicId: null, mockScore: null, mockMaxScore: null, createdAt: now, updatedAt: now, deletedAt: null,
  };
  set({ breakOffer: false, pendingFeedbackId: null });
  writeTimer({
    sessionId: session.id, phase: "break", energy, subject: session.subject, sessionType: session.sessionType,
    plannedSeconds: plannedMinutes * 60, accumulatedElapsedMs: 0, runStartTimestamp: now, state: "RUNNING", savedTimestamp: now,
  });
  await persist([session]);
}

export async function pauseSession() {
  const t = state.timer;
  if (!t || t.state !== "RUNNING") return;
  const now = Date.now();
  const paused = pauseTimer(t, now);
  writeTimer(paused);
  const s = patchSession(t.sessionId, { status: "paused", actualSeconds: elapsedSeconds(paused, now) }, now);
  if (s) await persist([s]);
  void keepAwake(false);
}

export async function resumeSession() {
  const t = state.timer;
  if (!t || t.state !== "PAUSED") return;
  const now = Date.now();
  writeTimer(resumeTimer(t, now));
  const s = patchSession(t.sessionId, { status: "active" }, now);
  if (s) await persist([s]);
  void keepAwake(true);
}

let completing = false;
async function completeTimer(finishedAt: number) {
  const t = state.timer;
  if (!t || completing) return;
  completing = true;
  try {
    writeTimer(null);
    const s = patchSession(t.sessionId, { status: "completed", actualSeconds: t.plannedSeconds }, finishedAt);
    if (s && !isTerminal(state.sessions.find((x) => x.id === s.id)?.status ?? "unknown")) await persist([s]);
    const isFocus = t.phase === "focus";
    setRound(advanceRound(state.round, state.userState.rounds));
    set({ pendingFeedbackId: isFocus ? t.sessionId : null, breakOffer: false });
    const nextIsLong = state.round.current === "long_break";
    announce(
      isFocus ? (nextIsLong ? "Focus round done: long break next" : "Focus session complete") : "Break over",
      isFocus ? t.subject || "Nicely done." : "Ready when you are.",
      isFocus ? (nextIsLong ? "long_break" : "short_break") : "focus",
    );
    void keepAwake(false);
    if (!isFocus && state.userState.autoStartFocus) restartLastFocus();
  } finally {
    completing = false;
  }
}

/** Stops the session and keeps the time studied. It is recorded as ended early, never as completed. */
export async function endEarly() {
  const t = state.timer;
  if (!t) return;
  const now = Date.now();
  const actualSeconds = elapsedSeconds(t, now);
  writeTimer(null);
  const s = patchSession(t.sessionId, { status: "ended_early", actualSeconds }, now);
  if (s) await persist([s]);
  set({ pendingFeedbackId: t.phase === "focus" && actualSeconds >= 60 ? t.sessionId : null, breakOffer: false });
  void keepAwake(false);
}

/** Discards the session: it counts for nothing. */
export async function cancelSession() {
  const t = state.timer;
  if (!t) return;
  const now = Date.now();
  writeTimer(null);
  const s = patchSession(t.sessionId, { status: "cancelled", actualSeconds: elapsedSeconds(t, now) }, now);
  if (s) await persist([s]);
  set({ pendingFeedbackId: null, breakOffer: false });
  void keepAwake(false);
}

export interface FeedbackInput {
  focusQuality: number | null;
  difficulty: number | null;
  durationFeedback: DurationFeedback | null;
  distractions: number | null;
  notes: string | null;
  mockScore?: number | null;
  mockMaxScore?: number | null;
}

export async function saveFeedback(id: string, f: FeedbackInput) {
  const s = patchSession(id, {
    focusQuality: f.focusQuality, difficulty: f.difficulty, durationFeedback: f.durationFeedback,
    distractions: f.distractions, notes: f.notes?.trim().slice(0, LIMITS.notesMax) || null,
    ...(f.mockScore !== undefined ? { mockScore: f.mockScore, mockMaxScore: f.mockMaxScore ?? null } : {}),
  });
  if (s) await persist([s]);
  closeFeedback();
}

export function closeFeedback() {
  const wasFocus = state.pendingFeedbackId !== null;
  set({ pendingFeedbackId: null, breakOffer: wasFocus });
  if (wasFocus && state.userState.autoStartBreak) void startBreak();
}

export const dismissBreakOffer = () => set({ breakOffer: false });

function setRound(round: RoundState) {
  set({ round });
  void setMeta(ROUND_KEY, round);
}

/** Restarts the focus/break cycle at focus round 1. */
export const resetRounds = () => setRound(initialRoundState());
export const currentRoundLabel = () => roundLabel(state.round, state.userState.rounds);

/** Pomotroid's auto-start for work rounds: repeat the last focus setup. */
function restartLastFocus() {
  const last = [...state.sessions].filter((s) => s.phase === "focus" && !s.deletedAt).sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!last) return;
  void startFocus({ energy: last.energy, subject: last.subject, sessionType: last.sessionType, plannedMinutes: last.plannedMinutes, expectedDifficulty: last.expectedDifficulty, topicId: last.topicId });
}

const THEMES = ["paper", "night", "contrast"] as const;
export function applyTheme(theme: UserState["theme"]) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  THEMES.forEach((t) => el.classList.remove(`theme-${t}`));
  if (theme !== "auto") el.classList.add(`theme-${theme}`);
}

export async function deleteSession(id: string) {
  const s = patchSession(id, { deletedAt: Date.now() });
  if (s) await persist([s]);
}

export async function updateUserState(patch: Partial<UserState>) {
  const userState = migrateUserState({ ...state.userState, ...patch, updatedAt: Date.now() });
  set({ userState });
  if (patch.theme) applyTheme(patch.theme);
  await setMeta(STATE_KEY, userState);
  scheduleSync();
}

/** Erases all study data on this device. The cloud copy, if any, is removed by deleting the account. */
export async function eraseThisDevice() {
  writeTimer(null);
  await wipeDevice();
  resetPrepMemory();
  set({ sessions: [], userState: defaultUserState(), pendingFeedbackId: null, breakOffer: false, round: initialRoundState() });
}

// ---------------------------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------------------------
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

export function scheduleSync(delay = 1500) {
  if (!state.signedIn) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), delay);
}

interface SyncResponse {
  sessions: Record<string, unknown>[];
  cursor: number;
  prepCursor: number;
  more: boolean;
  resetCursor?: boolean;
  preferences: { web?: unknown; updatedAt?: number } | null;
  prep: { table: string; row: Record<string, unknown> }[];
  rejected: { id: string | null; table: string; code?: string; reason: string }[];
}

const DEVICE_KEY = "syncDeviceId";
async function deviceId(): Promise<string> {
  let id = await getMeta<string>(DEVICE_KEY);
  if (!id) { id = `web-${crypto.randomUUID()}`; await setMeta(DEVICE_KEY, id); }
  return id;
}

export async function syncNow(): Promise<void> {
  if (syncing || !state.signedIn) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    set({ sync: { ...state.sync, status: "offline", message: "Offline. Sessions are saved on this device and will sync later." } });
    return;
  }
  // Cloud sync is a Pro feature; the server refuses writes without it.
  if (state.me && !state.me.entitlement.features.sync) {
    set({ sync: { status: "local", lastSyncedAt: null, message: "Cloud sync comes with Pro. Everything stays saved on this device." } });
    return;
  }
  syncing = true;
  set({ sync: { ...state.sync, status: "syncing", message: null } });
  try {
    const tz = deviceTimeZone();
    const device = await deviceId();
    let resetCursor = false;
    let more = true;
    let rejectedCount = 0;
    while (more) {
      const ids = (await outboxIds()).slice(0, 200);
      const sending = state.sessions.filter((s) => ids.includes(s.id));
      const cursor = resetCursor ? 0 : ((await getMeta<number>(CURSOR_KEY)) ?? 0);
      const prepCursor = resetCursor ? 0 : ((await getMeta<number>(PREP_CURSOR_KEY)) ?? 0);
      const prepKeys = new Set((await prepOutboxKeys()).slice(0, 300));
      const prepSending = prepKeys.size ? (await loadPrep()).filter((r) => prepKeys.has(`${r.table}:${r.row.id}`)) : [];
      const res = await api<SyncResponse>("/api/sync", {
        body: {
          cursor, prepCursor, resetCursor, clientPlatform: "web", appVersion: "4.0.0", deviceId: device,
          sessions: sending.map(sessionToWire),
          prep: prepSending.map(prepToWire),
          preferences: state.userState.updatedAt > 0 ? { web: state.userState, updatedAt: state.userState.updatedAt } : null,
        },
      });
      resetCursor = false;
      rejectedCount += res.rejected?.length ?? 0;
      // Rejected records are dropped from the queue (they would be rejected again) but kept on the device.
      await clearOutbox(sending.map((s) => ({ id: s.id, updatedAt: s.updatedAt })));
      await clearPrepOutbox(prepSending);
      await applyRemotePrep(res.prep.map(prepFromWire).filter((e): e is NonNullable<typeof e> => e !== null));
      await setMeta(PREP_CURSOR_KEY, res.prepCursor ?? prepCursor);
      const remote = res.sessions.map((r) => sessionFromWire(r, tz)).filter((x): x is Session => x !== null);
      if (remote.length > 0) {
        const merged = mergeSessions(state.sessions, remote);
        const changed = merged.filter((m) => remote.some((r) => r.id === m.id));
        await saveSessions(changed, { fromServer: true });
        set({ sessions: merged });
      }
      const prefs = res.preferences;
      if (prefs?.web && Number(prefs.updatedAt) > state.userState.updatedAt) {
        const userState = { ...migrateUserState(prefs.web), updatedAt: Number(prefs.updatedAt) };
        set({ userState });
        await setMeta(STATE_KEY, userState);
      }
      await setMeta(CURSOR_KEY, res.cursor);
      // The server asks for an occasional full re-pull to pick up anything a cursor skipped.
      if (res.resetCursor) { resetCursor = true; more = true; continue; }
      more = res.more || ((await outboxIds()).length > 0 && sending.length === 200) || ((await prepOutboxKeys()).length > 0 && prepSending.length === 300);
    }
    set({ sync: { status: "idle", lastSyncedAt: Date.now(), message: rejectedCount ? `${rejectedCount} item(s) were not accepted by the server and stay on this device only.` : null } });
  } catch (e) {
    const err = e as ApiError;
    if (err?.code === "PRO_REQUIRED") set({ sync: { status: "local", lastSyncedAt: null, message: "Cloud sync comes with Pro. Everything stays saved on this device." } });
    else if (err?.status) set({ sync: { ...state.sync, status: "error", message: err.error } });
    else set({ sync: { ...state.sync, status: "offline", message: "Offline. Sessions are saved on this device and will sync later." } });
  } finally {
    syncing = false;
  }
}

export async function signOut() {
  await supabase()?.auth.signOut();
  await setMeta(CURSOR_KEY, 0);
  await setMeta(PREP_CURSOR_KEY, 0);
}

// ---------------------------------------------------------------------------------------------
// Device niceties (all optional; failures are ignored)
// ---------------------------------------------------------------------------------------------
let wakeLock: { release: () => Promise<void> } | null = null;
async function keepAwake(on: boolean) {
  try {
    if (on && "wakeLock" in navigator) {
      wakeLock = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* not supported or not allowed */
  }
}

function announce(title: string, body: string, cue: "focus" | "short_break" | "long_break") {
  try {
    if (state.userState.soundEnabled) {
      playCue(cue, state.userState.volume);
    }
    if ("vibrate" in navigator) navigator.vibrate?.([120, 60, 120]);
    if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
      void navigator.serviceWorker?.ready.then((reg) => reg.showNotification(title, { body, icon: "/icons/icon-192.png", tag: "tempo-timer" }));
    }
  } catch {
    /* ignore */
  }
}
