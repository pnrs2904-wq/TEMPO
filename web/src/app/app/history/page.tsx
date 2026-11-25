"use client";
import { useMemo, useState } from "react";
import { Button, Card, Chip, Eyebrow, cx, minutesLabel } from "@/components/ui";
import { completionStats, focusSeconds, toMinutes } from "@/domain/analytics";
import { generateCsv, generateJson } from "@/domain/export";
import { formatDateKey } from "@/domain/time";
import type { Session } from "@/domain/types";
import { download } from "@/lib/client/download";
import { deleteSession, useTempo } from "@/lib/client/store";
import { subjectColor } from "@/lib/subjectColor";
import { useSubjectNames } from "@/lib/client/subjects";

type StatusFilter = "all" | "completed" | "ended_early";

const STATUS_LABEL: Record<string, string> = { completed: "Completed", ended_early: "Stopped early", cancelled: "Discarded", active: "In progress", paused: "Paused", unknown: "Unknown" };

export default function HistoryPage() {
  const { sessions, userState } = useTempo();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [subject, setSubject] = useState<string | null>(null);
  const [showBreaks, setShowBreaks] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const live = useMemo(() => sessions.filter((s) => !s.deletedAt && s.status !== "cancelled"), [sessions]);
  const subjectNames = useSubjectNames();

  const filtered = useMemo(
    () => live
      .filter((s) => (showBreaks ? true : s.phase === "focus"))
      .filter((s) => (status === "all" ? true : s.status === status))
      .filter((s) => (subject === null ? true : s.subject.trim().toLowerCase() === subject.toLowerCase()))
      .sort((a, b) => b.timestamp - a.timestamp),
    [live, status, subject, showBreaks],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of filtered) m.set(s.localDate, [...(m.get(s.localDate) ?? []), s]);
    return [...m.entries()];
  }, [filtered]);
  const stats = completionStats(filtered);
  const exportable = [...sessions].filter((s) => !s.deletedAt).sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl">History</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => download("tempo-sessions.csv", generateCsv(exportable), "text/csv;charset=utf-8")}>Export CSV</Button>
          <Button variant="outline" onClick={() => download("tempo-sessions.json", generateJson(exportable), "application/json")}>JSON</Button>
        </div>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={status === "all"} onClick={() => setStatus("all")}>Any status</Chip>
        <Chip active={status === "completed"} onClick={() => setStatus("completed")}>Completed</Chip>
        <Chip active={status === "ended_early"} onClick={() => setStatus("ended_early")}>Stopped early</Chip>
        <Chip active={showBreaks} onClick={() => setShowBreaks((v) => !v)}>Show breaks</Chip>
        <span className="mx-1 w-px shrink-0 bg-line" />
        <Chip active={subject === null} onClick={() => setSubject(null)}>All subjects</Chip>
        {subjectNames.map((n) => <Chip key={n} active={subject === n} color={subjectColor(n, subjectNames)} onClick={() => setSubject(n)}>{n}</Chip>)}
      </div>

      <p className="text-sm text-ink-2">
        {filtered.length} session{filtered.length === 1 ? "" : "s"} · {minutesLabel(toMinutes(focusSeconds(filtered)))} of focus · {stats.completed} completed, {stats.endedEarly} stopped early
      </p>

      {groups.length === 0 && <Card><p className="text-sm text-ink-2">Nothing here yet.</p></Card>}

      {groups.map(([date, list]) => (
        <section key={date}>
          <Eyebrow className="mb-2">{formatDateKey(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {toMinutes(focusSeconds(list))} min</Eyebrow>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: s.phase === "break" ? "var(--line)" : subjectColor(s.subject, subjectNames), opacity: s.status === "completed" ? 1 : 0.45 }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.phase === "break" ? "Break" : s.subject || "General"} {s.phase === "focus" && <span className="font-normal text-muted">· {s.sessionType}</span>}</span>
                    <span className="block text-xs text-muted">
                      {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: s.tz }).format(s.timestamp)} · energy {s.energy} · {STATUS_LABEL[s.status]}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-right text-sm">{toMinutes(s.actualSeconds)}<span className="text-muted"> / {s.plannedMinutes} min</span></span>
                </button>
                {open === s.id && (
                  <div className="space-y-2 bg-surface px-4 pb-4 pt-1 text-sm">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      {[["Focus", s.focusQuality], ["Difficulty", s.difficulty], ["Pulled away", s.distractions], ["Length felt", s.durationFeedback?.replace("_", " ")]].map(([k, v]) => (
                        <div key={String(k)}><dt className="text-muted">{k}</dt><dd className={cx("font-medium", v == null && "text-muted")}>{v ?? "not rated"}</dd></div>
                      ))}
                    </dl>
                    {s.mockScore != null && <p className="text-xs">Mock score: <strong>{s.mockScore}{s.mockMaxScore ? ` / ${s.mockMaxScore}` : ""}</strong></p>}
                    {s.notes && <p className="whitespace-pre-wrap rounded-xl bg-bg p-3 text-sm">{s.notes}</p>}
                    <Button variant="danger" className="min-h-9 px-3 text-xs" onClick={() => void deleteSession(s.id)}>Delete this session</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
