"use client";
/**
 * Post-session feedback (Android: feedback dialog in FocusTimerScreen). These five answers are the
 * engine's only inputs besides energy, subject and planned length, so the wording stays neutral
 * and every field is optional.
 */
import { useState } from "react";
import { toMinutes } from "@/domain/analytics";
import { DURATION_FEEDBACK_LABELS, LIMITS, type DurationFeedback } from "@/domain/types";
import { closeFeedback, saveFeedback, useTempo } from "@/lib/client/store";
import { Button, Eyebrow, Scale, Sheet, cx, inputClass } from "./ui";

export function FeedbackSheet({ sessionId }: { sessionId: string }) {
  const { sessions } = useTempo();
  const session = sessions.find((s) => s.id === sessionId);
  const [focusQuality, setFocusQuality] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(session?.expectedDifficulty ?? null);
  const [durationFeedback, setDurationFeedback] = useState<DurationFeedback | null>(null);
  const [distractions, setDistractions] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  if (!session) return null;
  const early = session.status === "ended_early";
  const isMock = session.sessionType === "Mock Test";
  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Math.max(0, Number(v)));

  return (
    <Sheet title={early ? "Session stopped" : "Session complete"} onClose={closeFeedback}>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        {early
          ? `You studied ${toMinutes(session.actualSeconds)} of ${session.plannedMinutes} minutes, and that time counts. A few taps help Tempo size the next one.`
          : `${session.plannedMinutes} minutes${session.subject ? ` of ${session.subject}` : ""}. A few taps help Tempo size the next one.`}
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <Eyebrow className="mb-1">How was your focus?</Eyebrow>
          <Scale label="Focus quality" value={focusQuality} onChange={setFocusQuality} low="Scattered" high="Locked in" />
        </div>
        <div>
          <Eyebrow className="mb-1">How hard was the material?</Eyebrow>
          <Scale label="Difficulty" value={difficulty} onChange={setDifficulty} low="Light" high="Heavy" />
        </div>
        <div>
          <Eyebrow className="mb-2">The length felt</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {(["too_short", "about_right", "too_long", "not_sure"] as DurationFeedback[]).map((k) => (
              <button
                key={k} type="button" aria-pressed={durationFeedback === k} onClick={() => setDurationFeedback(durationFeedback === k ? null : k)}
                className={cx("min-h-11 rounded-xl border px-3 text-sm font-medium", durationFeedback === k ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-ink-2")}
              >
                {DURATION_FEEDBACK_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow className="mb-2">Times you were pulled away</Eyebrow>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="One fewer" className="h-11 w-11 rounded-full border border-line text-lg" onClick={() => setDistractions(Math.max(0, (distractions ?? 0) - 1))}>−</button>
            <span className="font-display tnum w-10 text-center text-2xl">{distractions ?? "–"}</span>
            <button type="button" aria-label="One more" className="h-11 w-11 rounded-full border border-line text-lg" onClick={() => setDistractions(Math.min(99, (distractions ?? 0) + 1))}>+</button>
          </div>
        </div>
        {isMock && (
          <div>
            <Eyebrow className="mb-2">Mock score</Eyebrow>
            <div className="flex items-center gap-2">
              <input className={inputClass} inputMode="decimal" placeholder="Score" value={score} onChange={(e) => setScore(e.target.value)} aria-label="Score" />
              <span className="text-muted">of</span>
              <input className={inputClass} inputMode="decimal" placeholder="Maximum" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} aria-label="Maximum score" />
            </div>
          </div>
        )}
        <div>
          <Eyebrow className="mb-2">Note to self</Eyebrow>
          <textarea
            className={cx(inputClass, "min-h-20 py-2")} maxLength={LIMITS.notesMax} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What you covered, what to pick up next" aria-label="Session note"
          />
          <p className="mt-1 text-right text-[11px] text-muted">{notes.length}/{LIMITS.notesMax} · private to you</p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button variant="quiet" onClick={closeFeedback}>Skip</Button>
        <Button
          className="flex-1"
          onClick={() => void saveFeedback(sessionId, {
            focusQuality, difficulty, durationFeedback, distractions, notes,
            ...(isMock ? { mockScore: num(score), mockMaxScore: num(maxScore) } : {}),
          })}
        >
          Save
        </Button>
      </div>
    </Sheet>
  );
}
