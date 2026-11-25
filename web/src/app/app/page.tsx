"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeedbackSheet } from "@/components/FeedbackSheet";
import { Ring } from "@/components/Ring";
import { SeasonRings } from "@/components/SeasonRings";
import { Button, Card, Chip, Eyebrow, Scale, Segmented, cx, inputClass, minutesLabel } from "@/components/ui";
import { completionStats, focusMinutesOn, focusSeconds, toMinutes } from "@/domain/analytics";
import { defaultBreakMinutesFor, energyLevel } from "@/domain/energy";
import { dailyTarget, examCountdown } from "@/domain/exam";
import { effectiveSubjects, findExam, type CaGroup } from "@/domain/exams";
import { daysBetween } from "@/domain/time";
import { planFor, usePrep } from "@/lib/client/prep";
import { MiniTimerButton, useTimerChrome } from "@/components/TimerChrome";
import { recommend } from "@/domain/recommend";
import { calculateStreak } from "@/domain/streak";
import { deviceTimeZone, formatDateKey, localDateKey, minutesOfDay } from "@/domain/time";
import { elapsedSeconds, formatTimerDisplay, remainingSeconds } from "@/domain/timer";
import { LIMITS, SESSION_TYPES, type SessionType } from "@/domain/types";
import { cancelSession, dismissBreakOffer, endEarly, pauseSession, resetRounds, resumeSession, startBreak, startFocus, updateUserState, useTempo } from "@/lib/client/store";
import { roundLabel } from "@/domain/timer/rounds";
import { subjectColor } from "@/lib/subjectColor";

type Zoom = "now" | "day" | "season";
const SEASON_DAYS = 28;

export default function FocusPage() {
  const { sessions, userState, timer, now, pendingFeedbackId, breakOffer, round } = useTempo();
  const prep = usePrep();
  const exam = userState.advancedMode ? findExam(userState.selectedExamId) : undefined;
  const plan = exam ? planFor(prep, exam.examId) : null;
  const tz = deviceTimeZone();
  const today = localDateKey(now, tz);

  const [zoom, setZoom] = useState<Zoom>("now");
  const [energy, setEnergy] = useState(3);
  const [subject, setSubject] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("Study");
  const [expectedDifficulty, setExpectedDifficulty] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const live = useMemo(() => sessions.filter((s) => !s.deletedAt), [sessions]);
  const subjects = useMemo(() => {
    const names = [...(exam ? effectiveSubjects(exam, (plan?.caGroup ?? "both") as CaGroup).map((s) => s.name) : []), ...userState.customSubjects];
    const seen = new Set(names.map((n) => n.toLowerCase()));
    for (const s of [...live].sort((a, b) => b.timestamp - a.timestamp)) {
      const n = s.subject.trim();
      if (n && !seen.has(n.toLowerCase())) {
        seen.add(n.toLowerCase());
        names.push(n);
      }
    }
    return names;
  }, [live, userState.customSubjects, exam, plan?.caGroup]);

  const isMock = sessionType === "Mock Test";
  const daysToExam = plan?.examDate ? daysBetween(localDateKey(now || Date.now(), deviceTimeZone()), plan.examDate) : null;
  const rec = useMemo(
    () => recommend(live, energy, subject, exam ? { examName: exam.shortName, sessionType, daysUntilExam: daysToExam } : null),
    [live, energy, subject, exam, sessionType, daysToExam],
  );
  const mockDefault = exam?.markingScheme.durationMinutes ?? 120;
  const suggested = isMock ? mockDefault : rec.result.recommendedMinutes;
  const planned = customMinutes ?? suggested;
  const maxMinutes = isMock ? LIMITS.mockMaxMinutes : LIMITS.manualMaxMinutes;

  const todays = useMemo(() => live.filter((s) => s.localDate === today), [live, today]);
  const target = dailyTarget(userState, plan, live, today);
  const countdown = examCountdown(plan?.examDate ?? null, today);
  useTimerChrome(timer, now);
  const streak = useMemo(() => calculateStreak(live, today), [live, today]);

  const running = timer !== null;
  const activeSession = timer ? live.find((s) => s.id === timer.sessionId) : null;
  const remaining = timer ? remainingSeconds(timer, now) : 0;
  const effectiveZoom: Zoom = running ? "now" : zoom;
  const activeColor = timer ? (timer.phase === "break" ? "var(--muted)" : subjectColor(timer.subject, subjects)) : subjectColor(subject, subjects);

  const begin = useCallback(() => {
    void startFocus({ energy, subject, sessionType, plannedMinutes: planned, expectedDifficulty, topicId: null });
    setCustomMinutes(null);
    setShowReceipt(false);
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
  }, [energy, subject, sessionType, planned, expectedDifficulty]);

  // Keyboard shortcuts (Pomotroid has global shortcuts; a web page can only listen while focused).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || !el || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || document.querySelector('[role="dialog"]')) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!timer) begin();
        else if (timer.state === "RUNNING") void pauseSession();
        else void resumeSession();
      } else if (e.key === "b" && !timer) {
        void startBreak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timer, begin]);

  const addSubject = () => {
    const name = newSubject.trim().slice(0, LIMITS.subjectMax);
    if (!name) return;
    if (!subjects.some((s) => s.toLowerCase() === name.toLowerCase())) {
      void updateUserState({ customSubjects: [...userState.customSubjects, name] });
    }
    setSubject(name);
    setNewSubject("");
    setAdding(false);
  };

  const step = (delta: number) => setCustomMinutes(Math.min(maxMinutes, Math.max(LIMITS.manualMinMinutes, planned + delta)));

  const center = running ? (
    <>
      <Eyebrow>{timer.phase === "break" ? "Break" : timer.subject || timer.sessionType}</Eyebrow>
      <p className="font-display tnum mt-1 text-[clamp(2.6rem,13vw,3.75rem)] leading-none" aria-live="off">{formatTimerDisplay(remaining)}</p>
      <p className="mt-2 text-xs text-muted">
        {timer.state === "PAUSED" ? "Paused. Time is not counting." : `of ${minutesLabel(Math.round(timer.plannedSeconds / 60))}`}
      </p>
    </>
  ) : effectiveZoom === "now" ? (
    <>
      <Eyebrow>{customMinutes !== null && customMinutes !== suggested ? "Your choice" : isMock ? "Paper length" : "Recommended"}</Eyebrow>
      <div className="mt-1 flex items-center gap-3">
        <button type="button" onClick={() => step(-5)} aria-label="5 minutes shorter" className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg text-ink-2 hover:bg-surface-2">−</button>
        <p className="font-display tnum text-[clamp(3rem,15vw,4.25rem)] leading-none">{planned}</p>
        <button type="button" onClick={() => step(5)} aria-label="5 minutes longer" className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-lg text-ink-2 hover:bg-surface-2">+</button>
      </div>
      <p className="mt-1 text-xs text-muted">minutes</p>
      {customMinutes !== null && customMinutes !== suggested && (
        <button type="button" onClick={() => setCustomMinutes(null)} className="mt-1 text-xs font-medium text-blue underline underline-offset-2">Back to {suggested}</button>
      )}
    </>
  ) : (
    <>
      <Eyebrow>Today</Eyebrow>
      <p className="font-display tnum mt-1 text-6xl leading-none">{target.doneToday}</p>
      <p className="mt-1 text-xs text-muted">of {target.minutes} min</p>
    </>
  );

  const ringLabel = running
    ? `${formatTimerDisplay(remaining)} remaining`
    : `Today's sessions on a 24-hour dial. ${todays.filter((s) => s.phase === "focus").length} sessions, ${target.doneToday} minutes.`;

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:items-start md:gap-10">
      <div className="min-w-0 md:sticky md:top-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-2xl leading-tight">{formatDateKey(today, { weekday: "long", day: "numeric", month: "long" })}</p>
            <p className="mt-0.5 text-sm text-ink-2">
              {target.doneToday} of {target.minutes} min today
              {countdown?.state === "upcoming" && (
                <> · <Link href="/app/exam" className="underline decoration-line underline-offset-4">{countdown.days} days to {exam?.shortName || "exam"}</Link></>
              )}
            </p>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-ink-2">
          <span title="Focus rounds before a long break, from Pomotroid. Change in You → Timer.">
            {running && timer.phase === "break" ? (round.current === "long_break" ? "Long break" : "Short break") : roundLabel(round, userState.rounds)}
            {!running && round.focusRoundNumber > 1 && <button type="button" className="ml-2 underline underline-offset-2" onClick={resetRounds}>restart cycle</button>}
          </span>
          <MiniTimerButton timer={timer} now={now} label={timer?.phase === "break" ? "Break" : timer?.subject || "Focus"} />
        </div>
        <Segmented<Zoom>
          label="Zoom" value={effectiveZoom} disabled={running} onChange={setZoom}
          options={[{ value: "now", label: "Now" }, { value: "day", label: "Today" }, { value: "season", label: "4 weeks" }]}
        />

        <div className="mt-4">
          {userState.listView && effectiveZoom !== "season" ? (
            <Card className="flex flex-col items-center py-8 text-center">
              {center}
              {running && (
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={timer.plannedSeconds} aria-valuenow={timer.plannedSeconds - remaining}>
                  <div className="h-full rounded-full" style={{ width: `${((timer.plannedSeconds - remaining) / timer.plannedSeconds) * 100}%`, background: activeColor }} />
                </div>
              )}
            </Card>
          ) : effectiveZoom === "season" ? (
            <SeasonRings
              sessions={live} subjects={subjects} today={today} days={SEASON_DAYS} selected={selectedDay} onSelect={setSelectedDay}
              center={<><p className="font-display tnum text-3xl leading-none">{streak.currentStreak}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">day run</p></>}
            />
          ) : (
            <Ring
              label={ringLabel} sessions={todays} subjects={subjects} nowMin={minutesOfDay(now, tz)} liveSessionId={timer?.sessionId}
              ghost={!running && effectiveZoom === "now" ? { startMin: minutesOfDay(now, tz), minutes: planned, energy, color: activeColor } : null}
              live={running && activeSession ? {
                startMin: minutesOfDay(activeSession.timestamp, activeSession.tz), minutes: timer.plannedSeconds / 60,
                elapsedMin: elapsedSeconds(timer, now) / 60, energy: timer.energy, color: activeColor, paused: timer.state === "PAUSED",
              } : null}
            >
              {center}
            </Ring>
          )}
        </div>

        {running ? (
          <div className="mt-4 space-y-2">
            {timer.state === "RUNNING" ? (
              <Button className="h-14 w-full text-base" onClick={() => void pauseSession()}>Pause</Button>
            ) : (
              <Button className="h-14 w-full text-base" onClick={() => void resumeSession()}>Resume</Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => void endEarly()}>
                {timer.phase === "break" ? "End break" : "Stop and keep this time"}
              </Button>
              {timer.phase === "focus" && <Button variant="quiet" onClick={() => setConfirmDiscard(true)}>Discard</Button>}
            </div>
            {confirmDiscard && (
              <Card className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-2">Discard this session? Its time will not be counted.</p>
                <div className="flex shrink-0 gap-2">
                  <Button variant="quiet" onClick={() => setConfirmDiscard(false)}>Keep going</Button>
                  <Button variant="danger" onClick={() => { setConfirmDiscard(false); void cancelSession(); }}>Discard</Button>
                </div>
              </Card>
            )}
          </div>
        ) : effectiveZoom === "now" ? (
          <Button className="mt-4 h-14 w-full text-base" onClick={begin}>
            Start {planned} min{subject ? ` of ${subject}` : ""}
          </Button>
        ) : null}

        {breakOffer && !running && (
          <Card className="mt-3 flex items-center justify-between gap-3 border-green bg-green-soft">
            <p className="text-sm">{round.current === "long_break" ? `Round ${userState.rounds.roundsBeforeLongBreak} done. A ${userState.rounds.longBreakMinutes}-minute long break is next.` : `A ${defaultBreakMinutesFor(energy)}-minute break fits your energy.`}</p>
            <div className="flex shrink-0 gap-1">
              <Button variant="quiet" onClick={dismissBreakOffer}>Skip</Button>
              <Button onClick={() => void startBreak()}>Take it</Button>
            </div>
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-5">
        {effectiveZoom === "now" && (
          <>
            {!isMock ? (
              <Card className={cx(running && "opacity-60")}>
                <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setShowReceipt((v) => !v)} aria-expanded={showReceipt}>
                  <span>
                    <Eyebrow>Why {rec.result.recommendedMinutes} minutes</Eyebrow>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-2">{rec.summary}</span>
                  </span>
                  <span className="mt-1 shrink-0 text-xs font-semibold text-blue">{showReceipt ? "Hide" : "Show working"}</span>
                </button>
                {showReceipt && (
                  <div className="mt-3 border-t border-dashed border-line pt-3 font-mono text-[13px]">
                    {rec.receipt.map((l, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-4 py-1">
                        <span className="font-sans text-ink-2">{l.label}</span>
                        <span className={cx("tnum shrink-0", l.kind === "plus" && "text-green", l.kind === "minus" && "text-blue", l.kind === "hold" && "text-ochre")}>
                          {l.minutes === null ? "" : l.kind === "base" ? `${l.minutes}` : l.minutes > 0 ? `+${l.minutes}` : l.minutes === 0 ? "±0" : `−${Math.abs(l.minutes)}`}
                        </span>
                      </div>
                    ))}
                    <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2 font-semibold">
                      <span className="font-sans">Recommended</span><span className="tnum">{rec.result.recommendedMinutes} min</span>
                    </div>
                    <p className="mt-2 font-sans text-xs leading-relaxed text-muted">
                      Tempo moves at most 5 minutes at a time and stays between 10 and 50. Only sessions you completed are used; sessions you stopped early are never held against you.
                    </p>
                  </div>
                )}
              </Card>
            ) : (
              <Card className={cx(running && "opacity-60")}>
                <Eyebrow>Mock test</Eyebrow>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  Mock tests run for the length of the real paper, so Tempo does not adapt them or use them to adjust your study sessions. You can log your score afterwards.
                </p>
              </Card>
            )}

            <fieldset disabled={running} className={cx("min-w-0 space-y-5", running && "opacity-60")}>
              <div>
                <Eyebrow className="mb-2">Subject</Eyebrow>
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
                  <Chip active={subject === ""} onClick={() => setSubject("")}>General</Chip>
                  {subjects.map((s) => (
                    <Chip key={s} active={subject.toLowerCase() === s.toLowerCase()} color={subjectColor(s, subjects)} onClick={() => setSubject(s)}>{s}</Chip>
                  ))}
                  <Chip onClick={() => setAdding(true)}>+ Add</Chip>
                </div>
                {adding && (
                  <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); addSubject(); }}>
                    <input autoFocus className={inputClass} maxLength={LIMITS.subjectMax} placeholder="e.g. Polity" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} aria-label="New subject" />
                    <Button type="submit">Add</Button>
                  </form>
                )}
                {subjects.length === 0 && !adding && (
                  <p className="mt-2 text-xs text-muted">Add subjects here, or pick your exam in <Link className="underline" href="/app/exam">Exam</Link> to load its syllabus.</p>
                )}
              </div>

              <div>
                <Eyebrow className="mb-2">Study type</Eyebrow>
                <Segmented<SessionType>
                  label="Study type" value={sessionType} onChange={(v) => { setSessionType(v); setCustomMinutes(null); }}
                  options={SESSION_TYPES.map((t) => ({ value: t, label: t === "Practice Questions" ? "Practice" : t === "Mock Test" ? "Mock" : t }))}
                />
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <Eyebrow>Energy right now</Eyebrow>
                  <span className="text-xs text-ink-2">{energyLevel(energy).shortLabel} · {energyLevel(energy).description.toLowerCase()}</span>
                </div>
                <Scale label="Energy" tone="energy" value={energy} onChange={(v) => { setEnergy(v); setCustomMinutes(null); }} low="Drained" high="Sharp" />
              </div>

              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <Eyebrow>How hard will this be?</Eyebrow>
                  <span className="text-xs text-muted">optional</span>
                </div>
                <Scale label="Expected difficulty" value={expectedDifficulty} onChange={(v) => setExpectedDifficulty(v === expectedDifficulty ? null : v)} low="Light" high="Heavy" />
                {expectedDifficulty !== null && expectedDifficulty >= 4 && !isMock && (
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Noted. If hard sessions keep coming up, Tempo holds your length steady instead of stretching it.
                  </p>
                )}
              </div>
            </fieldset>
          </>
        )}

        {effectiveZoom === "day" && <DayList sessions={todays} subjects={subjects} />}

        {effectiveZoom === "season" && (
          <>
            <Card>
              <Eyebrow>Reading the rings</Eyebrow>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                Each ring is one day, oldest in the middle, today on the outside. Arcs sit at the time of day you studied. A spoke of arcs lining up across rings is a time that keeps working for you.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div><p className="font-display tnum text-2xl">{streak.currentStreak}</p><p className="text-xs text-muted">day run</p></div>
                <div><p className="font-display tnum text-2xl">{streak.bestStreak}</p><p className="text-xs text-muted">longest run</p></div>
                <div><p className="font-display tnum text-2xl">{streak.totalActiveDays}</p><p className="text-xs text-muted">days studied</p></div>
              </div>
            </Card>
            {selectedDay ? (
              <div>
                <p className="mb-2 font-display text-xl">{formatDateKey(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</p>
                <DayList sessions={live.filter((s) => s.localDate === selectedDay)} subjects={subjects} />
              </div>
            ) : (
              <p className="text-sm text-muted">Tap a ring to see that day.</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {subjects.slice(0, 10).map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-xs text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: subjectColor(s, subjects) }} />{s}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {pendingFeedbackId && <FeedbackSheet sessionId={pendingFeedbackId} />}
    </div>
  );
}

function DayList({ sessions, subjects }: { sessions: ReturnType<typeof useTempo>["sessions"]; subjects: string[] }) {
  const focus = sessions.filter((s) => s.phase === "focus" && s.status !== "cancelled").sort((a, b) => a.timestamp - b.timestamp);
  const stats = completionStats(sessions);
  if (focus.length === 0) return <p className="text-sm text-muted">Nothing logged on this day.</p>;
  const day = focus[0].localDate;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div><p className="font-display tnum text-2xl">{focusMinutesOn(sessions, day)}</p><p className="text-xs text-muted">minutes</p></div>
        <div><p className="font-display tnum text-2xl">{stats.completed}</p><p className="text-xs text-muted">completed</p></div>
        <div><p className="font-display tnum text-2xl">{stats.endedEarly}</p><p className="text-xs text-muted">stopped early</p></div>
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {focus.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: subjectColor(s.subject, subjects), opacity: s.status === "completed" ? 1 : 0.45 }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.subject || "General"} <span className="font-normal text-muted">· {s.sessionType}</span></span>
              <span className="block text-xs text-muted">
                {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: s.tz }).format(s.timestamp)} · energy {s.energy}
                {s.status === "ended_early" && ` · stopped at ${toMinutes(s.actualSeconds)} of ${s.plannedMinutes}`}
                {(s.status === "active" || s.status === "paused") && " · in progress"}
              </span>
            </span>
            <span className="tnum text-sm">{toMinutes(focusSeconds([s]))} min</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
