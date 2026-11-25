"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bars, RankBars } from "@/components/charts";
import { Button, Card, Eyebrow, Segmented, Stat, minutesLabel } from "@/components/ui";
import {
  averageSessionMinutes, completionStats, dailySeries, dayPartPattern, durationFeedbackDistribution, energyVsFocusQuality,
  focusMinutesInWeekOf, subjectPerformance, weeklySeries,
} from "@/domain/analytics";
import { generateLocalReflection } from "@/domain/reflection";
import { calculateStreak } from "@/domain/streak";
import { addDays, deviceTimeZone, formatDateKey, localDateKey } from "@/domain/time";
import { DURATION_FEEDBACK_LABELS, type DurationFeedback } from "@/domain/types";
import { useTempo } from "@/lib/client/store";
import { api, type ApiError } from "@/lib/client/supabase";
import { subjectColor } from "@/lib/subjectColor";
import { useSubjectNames } from "@/lib/client/subjects";

type Range = "7" | "14" | "30" | "90";

export default function PatternsPage() {
  const { sessions, userState, now, me, signedIn } = useTempo();
  const today = localDateKey(now, deviceTimeZone());
  const [range, setRange] = useState<Range>("14");
  const [ai, setAi] = useState<{ text: string; source: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const tier = me?.entitlement.tier ?? "free";
  const historyLimit = me?.entitlement.features.analyticsHistoryDays ?? 14;
  const days = Number(range);
  const locked = historyLimit !== null && days > historyLimit;
  const from = addDays(today, -(Math.min(days, locked ? historyLimit! : days) - 1));

  const live = useMemo(() => sessions.filter((s) => !s.deletedAt), [sessions]);
  const inRange = useMemo(() => live.filter((s) => s.localDate >= from && s.localDate <= today), [live, from, today]);
  const subjectsKnown = useSubjectNames();

  const daily = dailySeries(inRange, from, today);
  const weekly = weeklySeries(live, today, 8);
  const completion = completionStats(inRange);
  const avg = averageSessionMinutes(inRange);
  const streak = calculateStreak(live, today);
  const subjects = subjectPerformance(inRange);
  const energy = energyVsFocusQuality(inRange);
  const parts = dayPartPattern(inRange);
  const feedback = durationFeedbackDistribution(inRange);
  const local = generateLocalReflection(inRange);
  const empty = inRange.filter((s) => s.phase === "focus").length === 0;

  async function askAi() {
    setAiBusy(true);
    setAiError(null);
    try {
      // Only these fields leave the device: subject, energy and planned minutes of the last few
      // focus sessions, plus notes when the user separately allowed it.
      const recent = inRange
        .filter((s) => s.phase === "focus" && !s.deletedAt && s.subject.trim() && s.plannedMinutes >= 5)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5)
        .map((s) => ({ subject: s.subject.trim().slice(0, 60), energy: s.energy, plannedMinutes: Math.min(180, s.plannedMinutes), ...(me?.profile.ai_include_notes && s.notes ? { note: s.notes.slice(0, 300) } : {}) }));
      if (recent.length === 0) throw { error: "Record a focus session with a subject first." };
      const res = await api<{ insight: string }>("/api/reflections", { body: { sessions: recent, includeNotes: Boolean(me?.profile.ai_include_notes) } });
      setAi({ text: res.insight, source: "ai" });
    } catch (e) {
      setAiError((e as ApiError).error ?? "AI reflections are not available right now.");
    } finally {
      setAiBusy(false);
    }
  }

  const aiReady = signedIn && me?.entitlement.features.aiReflections && me.profile.ai_enabled && me.aiAvailable;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl">Patterns</h1>
        <div className="w-full sm:w-72">
          <Segmented<Range> label="Period" value={range} onChange={setRange}
            options={[{ value: "7", label: "7 days" }, { value: "14", label: "14" }, { value: "30", label: "30" }, { value: "90", label: "90" }]} />
        </div>
      </div>

      {locked && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-ochre bg-ochre-soft">
          <p className="text-sm">The free plan shows the last {historyLimit} days. Your older sessions are still saved on this device.</p>
          <Link href="/pricing"><Button>See Pro</Button></Link>
        </Card>
      )}

      {empty ? (
        <Card><p className="text-sm text-ink-2">No sessions in this period yet. Finish one focus session and this page starts filling in.</p></Card>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="This week" value={minutesLabel(focusMinutesInWeekOf(live, today))} sub={`goal ${minutesLabel(userState.weeklyGoalMinutes)}`} />
            <Stat label="Average session" value={avg === null ? "–" : `${avg} min`} sub="completed sessions" />
            <Stat label="Completed" value={completion.rate === null ? "–" : `${Math.round(completion.rate * 100)}%`} sub={`${completion.completed} of ${completion.completed + completion.endedEarly} sessions`} />
            <Stat label="Current run" value={`${streak.currentStreak} d`} sub={`longest ${streak.bestStreak} d`} />
          </Card>

          <Card>
            <Eyebrow>Daily focus time</Eyebrow>
            <p className="mb-2 mt-1 text-sm text-ink-2">Minutes actually studied each day, including sessions you stopped early.</p>
            <Bars unit="min" tickEvery={days > 14 ? Math.ceil(days / 7) : days > 7 ? 2 : 1}
              summary={`Daily focus minutes for the last ${daily.length} days. Total ${daily.reduce((a, d) => a + d.minutes, 0)} minutes.`}
              data={daily.map((d) => ({ label: formatDateKey(d.date), value: d.minutes, note: `${d.completed} completed${d.endedEarly ? `, ${d.endedEarly} stopped early` : ""}` }))} />
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <Eyebrow>Weekly focus time</Eyebrow>
              <p className="mb-2 mt-1 text-sm text-ink-2">Last 8 weeks, Monday to Sunday.</p>
              <Bars unit="min" height={160} summary="Weekly focus minutes for the last 8 weeks."
                data={weekly.map((w) => ({ label: formatDateKey(w.weekStart), value: w.minutes }))} />
            </Card>
            <Card>
              <Eyebrow>Consistency</Eyebrow>
              <p className="mb-2 mt-1 text-sm text-ink-2">Days studied in each week, out of 7.</p>
              <Bars unit="days" height={160} domain={[0, 7]} ticks={[0, 1, 2, 3, 4, 5, 6, 7]} summary="Number of days studied per week for the last 8 weeks."
                data={weekly.map((w) => ({ label: formatDateKey(w.weekStart), value: w.activeDays }))} />
            </Card>
          </div>

          <Card>
            <Eyebrow>Subject-wise performance</Eyebrow>
            <div className="mt-3">
              <RankBars unit="min" rows={subjects.slice(0, 10).map((s) => ({
                label: s.subject, value: s.minutes, color: subjectColor(s.subject === "General" ? "" : s.subject, subjectsKnown),
                detail: [
                  `${s.sessions} session${s.sessions === 1 ? "" : "s"}`,
                  s.completionRate !== null && `${Math.round(s.completionRate * 100)}% completed`,
                  s.avgFocusQuality !== null && `focus ${s.avgFocusQuality.toFixed(1)}/5`,
                  s.avgDifficulty !== null && `difficulty ${s.avgDifficulty.toFixed(1)}/5`,
                ].filter(Boolean).join(" · "),
              }))} />
            </div>
          </Card>

          <div className="grid gap-5 sm:grid-cols-2">
            <Card>
              <Eyebrow>Energy versus focus quality</Eyebrow>
              <p className="mb-2 mt-1 text-sm text-ink-2">Average focus rating (1 to 5) at each energy level you logged.</p>
              <Bars unit="/ 5" height={160} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} summary="Average focus quality by energy level."
                data={energy.map((e) => ({ label: `E${e.energy}`, value: e.avgFocusQuality, note: e.rated ? `${e.rated} rated session${e.rated === 1 ? "" : "s"}` : "no rated sessions" }))} />
            </Card>
            <Card>
              <Eyebrow>Time of day</Eyebrow>
              <p className="mb-2 mt-1 text-sm text-ink-2">When your study minutes happen.</p>
              <Bars unit="min" height={160} summary="Focus minutes by part of day."
                data={parts.map((p) => ({ label: p.part.split(" ")[0], value: p.minutes, note: `${p.part}${p.avgFocusQuality !== null ? ` · focus ${p.avgFocusQuality.toFixed(1)}/5` : ""}` }))} />
            </Card>
          </div>

          <Card>
            <Eyebrow>How session lengths felt</Eyebrow>
            <p className="mb-3 mt-1 text-sm text-ink-2">Your answers after completed sessions. This is what moves the recommendation.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(feedback) as DurationFeedback[]).map((k) => (
                <div key={k} className="rounded-xl bg-surface-2 p-3"><p className="font-display tnum text-2xl">{feedback[k]}</p><p className="text-xs text-ink-2">{DURATION_FEEDBACK_LABELS[k]}</p></div>
              ))}
            </div>
          </Card>
        </>
      )}

      <Card>
        <Eyebrow>Reflection</Eyebrow>
        <p className="mt-2 text-[15px] leading-relaxed">{ai?.text ?? local}</p>
        <p className="mt-2 text-xs text-muted">
          {ai?.source === "ai" ? "Written by AI from your study totals. It can be wrong; treat it as a prompt, not advice." : "Worked out on this device. Nothing was sent anywhere."}
        </p>
        {aiError && <p className="mt-2 text-xs text-terra">{aiError}</p>}
        <div className="mt-3">
          {aiReady ? (
            <Button variant="outline" disabled={aiBusy} onClick={() => void askAi()}>{aiBusy ? "Thinking…" : "Ask for an AI reflection"}</Button>
          ) : (
            <p className="text-xs text-muted">
              AI reflections are optional and off by default.{" "}
              <Link href="/app/settings" className="underline">{tier === "free" ? "Available with Pro" : "Turn on in Settings"}</Link>.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
