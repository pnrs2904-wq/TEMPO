"use client";
/**
 * Exam preparation (Tempo 2.0's Prep Hub and Exam Dashboard on the web).
 * Same registry, engines and rules as Android; see domain/exams.ts and domain/prep/*.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bars } from "@/components/charts";
import { Button, Card, Chip, Eyebrow, Scale, Segmented, Sheet, Stat, cx, inputClass, minutesLabel } from "@/components/ui";
import { examCountdown } from "@/domain/exam";
import { DIFFICULTY_LABEL, EXAMS, examsByCategory, findExam, type CaGroup, type ExamConfig, type TopicDifficulty } from "@/domain/exams";
import { ERROR_CATEGORIES, errorLabel, scoreMarksEntry, scoreQuestionAttempts, scoreQuickEntry, validateMarksEntry, validateQuickEntry, type ErrorCategory, type QuestionAttemptInput } from "@/domain/prep/mockScoring";
import { evaluateReadiness } from "@/domain/prep/readiness";
import { REVISION_METHODS, isDueOrOverdue, type RevisionMethod } from "@/domain/prep/revision";
import { generatePlan, statusLabel, TOPIC_STATUSES, type TopicPlanInput, type TopicStatus } from "@/domain/prep/studyPlan";
import type { TopicProgress } from "@/domain/prep/types";
import { addDays, deviceTimeZone, formatDateKey, isDateKey, localDateKey } from "@/domain/time";
import {
  addCustomTopic, attemptsFor, deleteMock, deleteTopic, ensureExamInitialized, importSyllabusCsv, logRevision, mocksFor, planFor,
  recordDetailedMock, recordMarksMock, recordQuickMock, rescheduleRevision, revisionsFor, setTopicFlags, setTopicStatus, topicsFor, updatePlan, usePrep,
} from "@/lib/client/prep";
import { updateUserState, useTempo } from "@/lib/client/store";

type Tab = "overview" | "syllabus" | "revisions" | "mocks" | "plan";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" }, { value: "syllabus", label: "Syllabus" }, { value: "revisions", label: "Revise" },
  { value: "mocks", label: "Mocks" }, { value: "plan", label: "Plan" },
];

export default function ExamPage() {
  const { userState } = useTempo();
  const prep = usePrep();
  const exam = findExam(userState.selectedExamId);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (exam && prep.ready && !planFor(prep, exam.examId)) void ensureExamInitialized(exam);
  }, [exam, prep]);

  if (!exam || picking) return <ExamPicker current={exam?.examId ?? null} onDone={() => setPicking(false)} />;
  if (!prep.ready || !planFor(prep, exam.examId)) return <p className="pt-16 text-center text-sm text-muted">Preparing {exam.name}…</p>;
  return <ExamWorkspace exam={exam} onSwitch={() => setPicking(true)} />;
}

function ExamPicker({ current, onDone }: { current: string | null; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => examsByCategory().map((g) => ({ ...g, exams: g.exams.filter((e) => `${e.name} ${e.shortName} ${e.authorityName}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter((g) => g.exams.length), [query]);
  const choose = async (e: ExamConfig) => {
    await updateUserState({ selectedExamId: e.examId, advancedMode: true });
    await ensureExamInitialized(e);
    onDone();
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{current ? "Switch examination" : "What are you preparing for?"}</h1>
          <p className="mt-1 text-sm text-ink-2">{EXAMS.length} examinations. Switching keeps every exam&apos;s progress; nothing is deleted.</p>
        </div>
        {current && <Button variant="quiet" onClick={onDone}>Cancel</Button>}
      </div>
      <input className={inputClass} placeholder="Search, e.g. NEET, CLAT, CA Inter" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search examinations" />
      {groups.map((g) => (
        <section key={g.category}>
          <Eyebrow className="mb-2">{g.label}</Eyebrow>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.exams.map((e) => (
              <button key={e.examId} type="button" onClick={() => void choose(e)} aria-current={e.examId === current}
                className={cx("rounded-2xl border bg-surface p-4 text-left transition hover:border-ink-2", e.examId === current ? "border-ink" : "border-line")}>
                <span className="flex items-start justify-between gap-2">
                  <span className="font-display text-lg leading-tight">{e.name}</span>
                  <PatternBadge exam={e} />
                </span>
                <span className="mt-1 block text-xs text-ink-2">{e.authorityName} · {e.applicableYear} · {e.syllabusVersion}</span>
                <span className="mt-1 block text-xs text-muted">{e.markingScheme.scoringMode === "MARKS_ENTRY" ? `Marks entry · ${e.markingScheme.maxMarks} marks per paper` : `${e.markingScheme.totalQuestions} Qs · ${e.markingScheme.maxMarks} marks · +${e.markingScheme.positiveMarks}${e.markingScheme.hasNegativeMarking ? ` / −${e.markingScheme.negativeMarks}` : ", no negative marking"}`}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PatternBadge({ exam }: { exam: ExamConfig }) {
  return exam.patternStatus === "VERIFIED"
    ? <span className="shrink-0 rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-semibold text-green" title="Marked as the official pattern in Tempo's registry">Official</span>
    : <span className="shrink-0 rounded-full bg-ochre-soft px-2 py-0.5 text-[10px] font-semibold text-ochre" title="Pattern not verified against the official notification; edit marking when you log a mock">Provisional</span>;
}

function ExamWorkspace({ exam, onSwitch }: { exam: ExamConfig; onSwitch: () => void }) {
  const { sessions, userState, now } = useTempo();
  const prep = usePrep();
  const today = localDateKey(now || Date.now(), deviceTimeZone());
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "overview";
    const h = window.location.hash.replace("#", "");
    return (TABS.find((t) => t.value === h)?.value ?? "overview") as Tab;
  });
  const plan = planFor(prep, exam.examId)!;
  const group = plan.caGroup as CaGroup;
  const topics = topicsFor(prep, exam, group);
  const revisions = revisionsFor(prep, exam.examId);
  const mocks = mocksFor(prep, exam.examId);
  const attempts = attemptsFor(prep, exam.examId);
  const countdown = examCountdown(plan.examDate, today);
  const planInputs: TopicPlanInput[] = topics.map((t) => ({ topicId: t.id, subject: t.subject, topicName: t.topicName, status: t.status, difficulty: t.difficulty, nextRevisionDate: t.nextRevisionDate }));
  const due = topics.filter((t) => isDueOrOverdue(t.nextRevisionDate, today) || t.status === "revision_due");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Eyebrow>{exam.categoryLabel} · {exam.syllabusVersion}</Eyebrow><PatternBadge exam={exam} /></div>
          <h1 className="font-display mt-1 text-3xl leading-tight">{exam.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {countdown?.state === "upcoming" ? `${countdown.days} days to go` : countdown?.state === "today" ? "Exam day. All the best." : countdown?.state === "past" ? "Exam date has passed" : "No exam date set"}
            {due.length > 0 && <> · <button type="button" className="underline underline-offset-4" onClick={() => setTab("revisions")}>{due.length} revision{due.length === 1 ? "" : "s"} due</button></>}
          </p>
        </div>
        <Button variant="outline" onClick={onSwitch}>Switch exam</Button>
      </div>

      {exam.supportsCaGroups && (
        <div className="max-w-sm">
          <Segmented<CaGroup> label="CA group" value={group} onChange={(g) => void updatePlan(exam.examId, { caGroup: g })}
            options={[{ value: "group_1", label: "Group I" }, { value: "group_2", label: "Group II" }, { value: "both", label: "Both" }]} />
          <p className="mt-1 text-xs text-muted">Switching group only filters what you see. Progress in the other group is kept.</p>
        </div>
      )}

      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <div className="min-w-[340px]"><Segmented<Tab> label="Section" value={tab} onChange={(t) => { setTab(t); history.replaceState(null, "", `#${t}`); }} options={TABS} /></div>
      </div>

      {tab === "overview" && <Overview exam={exam} today={today} topics={topics} planInputs={planInputs} revisions={revisions} mocks={mocks} />}
      {tab === "syllabus" && <Syllabus exam={exam} topics={topics} today={today} />}
      {tab === "revisions" && <Revisions exam={exam} due={due} today={today} history={revisions} />}
      {tab === "mocks" && <Mocks exam={exam} attempts={attempts} />}
      {tab === "plan" && <PlanTab exam={exam} planInputs={planInputs} today={today} />}
      <p className="text-xs text-muted">
        Source: {exam.authorityName}. <a className="underline" href={exam.officialNotificationUrl} target="_blank" rel="noreferrer">Official site</a>.
        {exam.patternStatus === "PROVISIONAL" && " This pattern is provisional in Tempo's registry: check marks and timing against the current official notification."}
        {sessions.length === 0 && userState.selectedExamId && <> Start timing your study on <Link href="/app" className="underline">Focus</Link>.</>}
      </p>
    </div>
  );

}

function Overview({ exam, today, topics, planInputs, revisions, mocks }: { exam: ExamConfig; today: string; topics: TopicProgress[]; planInputs: TopicPlanInput[]; revisions: ReturnType<typeof revisionsFor>; mocks: ReturnType<typeof mocksFor> }) {
  const { sessions, userState } = useTempo();
  const report = evaluateReadiness(sessions, planInputs, revisions.map((r) => ({ recallRating: r.recallRating, accuracyPercent: r.accuracyPercent })),
    mocks.map((m) => ({ dateTimestamp: m.dateTimestamp, percentage: m.percentage, accuracyPercent: m.accuracyPercent, avgSecondsPerQuestion: m.avgSecondsPerQuestion, weakestSubject: m.weakestSubject, weakestSubjectAccuracy: m.weakestSubjectAccuracy })),
    userState.dailyGoalMinutes, today);
  const statusCounts = TOPIC_STATUSES.map(([k, label]) => ({ label, value: topics.filter((t) => t.status === k).length }));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Pillar letter="A" title="Consistency" score={report.consistency.scorePercent} formula={report.consistency.formula}
          detail={`${report.consistency.activeDaysLast14Days} of 14 days active · ${report.consistency.studyHoursLast14Days} h studied · ${report.consistency.currentStreakDays}-day run`} />
        <Pillar letter="B" title="Coverage" score={report.coverage.scorePercent} formula={report.coverage.formula}
          detail={`${report.coverage.completedOrMasteredTopics} of ${report.coverage.totalTopics} topics completed or mastered · ${report.coverage.overdueBacklog} revisions due`} />
        <Pillar letter="C" title="Competency" score={report.competency.scorePercent} formula={report.competency.formula}
          detail={report.competency.scorePercent === null ? "Log a revision or a mock to measure this." : `Mock accuracy ${report.competency.averageAccuracyPercent ?? "–"}% · recall ${report.competency.averageRecallRating ?? "–"}/5 · ${report.competency.masteredTopicsPercent}% mastered`} />
        {report.readiness.kind === "score" ? (
          <Pillar letter="D" title="Exam readiness" score={report.readiness.scorePercent} formula={report.readiness.formula}
            detail={`Recent mocks ${report.readiness.recentMockAveragePercent}% · ${report.readiness.trendLabel}${report.readiness.weakestSubjectName ? ` · weakest: ${report.readiness.weakestSubjectName}` : ""}`} />
        ) : (
          <Pillar letter="D" title="Exam readiness" score={null} formula={report.readiness.formula} detail={report.readiness.reason} />
        )}
      </div>
      <Card>
        <Eyebrow>Syllabus status</Eyebrow>
        <div className="mt-2"><Bars unit="topics" height={150} summary="Topics in each status." data={statusCounts.map((s) => ({ label: s.label.replace(" ", " "), value: s.value }))} /></div>
      </Card>
      <Card>
        <Eyebrow>Strategy</Eyebrow>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{exam.strategySummary}</p>
        {exam.markingScheme.passCriteriaNote && <p className="mt-2 text-xs text-muted">{exam.markingScheme.passCriteriaNote}</p>}
      </Card>
    </div>
  );
}

function Pillar({ letter, title, score, detail, formula }: { letter: string; title: string; score: number | null; detail: string; formula: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>{letter}. {title}</Eyebrow>
          <p className="font-display tnum mt-1 text-4xl leading-none">{score === null ? "—" : `${score}%`}</p>
        </div>
        <button type="button" className="text-xs font-semibold text-blue" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Hide" : "How calculated"}</button>
      </div>
      <p className="mt-2 text-sm text-ink-2">{score === null && letter === "D" ? <span className="font-medium">Insufficient data. </span> : null}{detail}</p>
      {open && <p className="mt-2 border-t border-dashed border-line pt-2 text-xs text-muted">{formula}</p>}
    </Card>
  );
}

function Syllabus({ exam, topics, today }: { exam: ExamConfig; topics: TopicProgress[]; today: string }) {
  const [filter, setFilter] = useState<TopicStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = topics.filter((t) => (filter === "all" || t.status === filter) && `${t.topicName} ${t.subtopics} ${t.chapter}`.toLowerCase().includes(query.trim().toLowerCase()));
  const bySubject = new Map<string, TopicProgress[]>();
  for (const t of [...shown].sort((a, b) => `${a.subject}${a.unit}${a.chapter}${a.topicName}`.localeCompare(`${b.subject}${b.unit}${b.chapter}${b.topicName}`))) bySubject.set(t.subject, [...(bySubject.get(t.subject) ?? []), t]);
  const done = topics.filter((t) => t.status === "completed" || t.status === "mastered").length;
  const cycle = (s: TopicStatus): TopicStatus => TOPIC_STATUSES[(TOPIC_STATUSES.findIndex(([k]) => k === s) + 1) % TOPIC_STATUSES.length][0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">{done} of {topics.length} topics completed or mastered</p>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setAdding(true)}>Add topic</Button><Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button></div>
      </div>
      <input className={inputClass} placeholder="Search topics" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search topics" />
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        {TOPIC_STATUSES.map(([k, l]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}
      </div>
      {shown.length === 0 && <Card><p className="text-sm text-ink-2">{topics.length === 0 ? "No topics yet. Add your own or import a CSV." : "No topics match."}</p></Card>}
      {[...bySubject.entries()].map(([subject, list]) => (
        <section key={subject}>
          <Eyebrow className="mb-2">{subject} · {list.length}</Eyebrow>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {list.map((t) => (
              <li key={t.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => void setTopicStatus(t.id, cycle(t.status), today)} title="Tap to move to the next status"
                    className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", statusTone(t.status))}>{statusLabel(t.status)}</button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                    <span className="block truncate text-sm font-medium">{t.topicName}</span>
                    <span className="block truncate text-xs text-muted">{t.unit} › {t.chapter} · {DIFFICULTY_LABEL[t.difficulty]}{t.nextRevisionDate ? ` · revise ${formatDateKey(t.nextRevisionDate)}` : ""}{t.isCustom ? " · custom" : ""}</span>
                  </button>
                </div>
                {open === t.id && (
                  <div className="space-y-3 bg-surface px-4 pb-4 pt-2 text-sm">
                    {t.subtopics && <p className="text-xs text-ink-2">{t.subtopics}</p>}
                    <div className="flex flex-wrap gap-1">{TOPIC_STATUSES.map(([k, l]) => <Chip key={k} active={t.status === k} onClick={() => void setTopicStatus(t.id, k, today)}>{l}</Chip>)}</div>
                    {(exam.supportsNcertTracking || exam.supportsPaperExemptions) && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        {exam.supportsNcertTracking && <>
                          <Check label="NCERT read" checked={t.ncertCompleted} onChange={(v) => void setTopicFlags(t.id, { ncertCompleted: v })} />
                          <Check label="Formulae revised" checked={t.formulaRevisionDone} onChange={(v) => void setTopicFlags(t.id, { formulaRevisionDone: v })} />
                          <Check label="Diagrams revised" checked={t.diagramRevisionDone} onChange={(v) => void setTopicFlags(t.id, { diagramRevisionDone: v })} />
                        </>}
                        {exam.supportsPaperExemptions && <Check label="RTP / MTP done" checked={t.rtpMtpCompleted} onChange={(v) => void setTopicFlags(t.id, { rtpMtpCompleted: v })} />}
                      </div>
                    )}
                    {t.isCustom && <Button variant="danger" className="min-h-9 px-3 text-xs" onClick={() => void deleteTopic(t.id)}>Delete topic and its revision history</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {adding && <AddTopicSheet exam={exam} onClose={() => setAdding(false)} />}
      {importing && <ImportSheet exam={exam} onClose={() => setImporting(false)} />}
    </div>
  );
}

const statusTone = (s: TopicStatus) =>
  s === "mastered" ? "bg-green text-bg" : s === "completed" ? "bg-green-soft text-green" : s === "revision_due" ? "bg-ochre-soft text-ochre"
  : s === "practising" ? "bg-blue-soft text-blue" : s === "learning" ? "bg-surface-2 text-ink" : "bg-surface-2 text-muted";

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function AddTopicSheet({ exam, onClose }: { exam: ExamConfig; onClose: () => void }) {
  const [subject, setSubject] = useState(exam.subjects[0]?.name ?? "");
  const [unit, setUnit] = useState("");
  const [chapter, setChapter] = useState("");
  const [name, setName] = useState("");
  const [difficulty, setDifficulty] = useState<TopicDifficulty>("moderate");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title="Add a topic" onClose={onClose}>
      <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); const err = await addCustomTopic(exam, subject, unit, chapter, name, difficulty); if (err) setError(err); else onClose(); }}>
        <input className={inputClass} list="subjects" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" maxLength={60} />
        <datalist id="subjects">{exam.subjects.map((s) => <option key={s.name} value={s.name} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" maxLength={80} />
          <input className={inputClass} placeholder="Chapter (optional)" value={chapter} onChange={(e) => setChapter(e.target.value)} aria-label="Chapter" maxLength={80} />
        </div>
        <input className={inputClass} placeholder="Topic name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Topic name" maxLength={120} required />
        <Segmented<TopicDifficulty> label="Difficulty" value={difficulty} onChange={setDifficulty} options={(["foundational", "moderate", "high", "critical"] as const).map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} />
        {error && <p className="text-sm text-terra" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit">Add topic</Button></div>
      </form>
    </Sheet>
  );
}

function ImportSheet({ exam, onClose }: { exam: ExamConfig; onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const [subject, setSubject] = useState(exam.subjects[0]?.name ?? "General");
  const [result, setResult] = useState<string | null>(null);
  return (
    <Sheet title="Import syllabus" onClose={onClose}>
      <p className="mt-2 text-sm text-ink-2">One topic per line. Accepted: <code>Subject,Unit,Chapter,Topic,Difficulty</code>, <code>Subject,Chapter,Topic</code>, <code>Subject,Topic</code> or just <code>Topic</code>. Topics already in the list are skipped.</p>
      <div className="mt-3 space-y-3">
        <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject for lines without one" placeholder="Subject for lines without one" />
        <textarea className={cx(inputClass, "min-h-40 py-2 font-mono text-xs")} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"Polity,Constitution,Fundamental Rights,Article 14-18,high\nPolity,Parliament"} aria-label="CSV text" />
        <input type="file" accept=".csv,.txt,text/csv,text/plain" className="text-xs" aria-label="Or choose a CSV file"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size < 1_000_000) setRaw(await f.text()); }} />
        {result && <p className="text-sm text-green" role="status">{result}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>Close</Button>
          <Button disabled={!raw.trim()} onClick={async () => { const n = await importSyllabusCsv(exam, raw, subject); setResult(`${n} new topic${n === 1 ? "" : "s"} added.`); setRaw(""); }}>Import</Button>
        </div>
      </div>
    </Sheet>
  );
}

function Revisions({ exam, due, today, history }: { exam: ExamConfig; due: TopicProgress[]; today: string; history: ReturnType<typeof revisionsFor> }) {
  const [logging, setLogging] = useState<TopicProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const upcoming = topicsFor(usePrep(), exam, "both").filter((t) => t.nextRevisionDate && t.nextRevisionDate > today && t.nextRevisionDate <= addDays(today, 14)).sort((a, b) => (a.nextRevisionDate! < b.nextRevisionDate! ? -1 : 1));
  return (
    <div className="space-y-5">
      {message && <Card className="border-blue bg-blue-soft text-sm"><p role="status">{message}</p></Card>}
      <Card>
        <Eyebrow>Due now · {due.length}</Eyebrow>
        {due.length === 0 ? <p className="mt-2 text-sm text-ink-2">Nothing due. Mark topics Completed in Syllabus and they come back after 1, 3, 7, 14 and 30 days, sooner if recall was weak.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {due.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.topicName}</span><span className="text-xs text-muted">{t.subject} · revision {t.revisionCount + 1}{t.nextRevisionDate && t.nextRevisionDate < today ? ` · since ${formatDateKey(t.nextRevisionDate)}` : ""}</span></span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="quiet" className="min-h-9 px-3 text-xs" onClick={() => void rescheduleRevision(t.id, addDays(today, 1))}>Tomorrow</Button>
                  <Button className="min-h-9 px-3 text-xs" onClick={() => setLogging(t)}>Log revision</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {upcoming.length > 0 && (
        <Card>
          <Eyebrow>Next 14 days</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm">{upcoming.map((t) => <li key={t.id} className="flex justify-between gap-3"><span className="truncate">{t.topicName}</span><span className="shrink-0 text-xs text-muted">{formatDateKey(t.nextRevisionDate!, { weekday: "short", day: "numeric", month: "short" })}</span></li>)}</ul>
        </Card>
      )}
      <Card>
        <Eyebrow>History</Eyebrow>
        {history.length === 0 ? <p className="mt-2 text-sm text-ink-2">No revisions logged yet.</p> : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {history.slice(0, 50).map((r) => (
              <li key={r.id} className="py-2"><span className="font-medium">{r.topicName}</span> <span className="text-xs text-muted">· {formatDateKey(r.revisionDate)} · #{r.revisionNumber} · recall {r.recallRating}/5{r.accuracyPercent !== null ? ` · ${r.accuracyPercent}%` : ""} · {REVISION_METHODS.find(([k]) => k === r.method)?.[1]} · next {formatDateKey(r.nextRevisionDate)}</span></li>
            ))}
          </ul>
        )}
      </Card>
      {logging && <LogRevisionSheet exam={exam} topic={logging} today={today} onClose={(msg) => { setLogging(null); if (msg) setMessage(msg); }} />}
    </div>
  );
}

function LogRevisionSheet({ exam, topic, today, onClose }: { exam: ExamConfig; topic: TopicProgress; today: string; onClose: (msg?: string) => void }) {
  const [recall, setRecall] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState("");
  const [difficulty, setDifficulty] = useState<number | null>(3);
  const [method, setMethod] = useState<RevisionMethod>("active_recall");
  const [notes, setNotes] = useState("");
  const acc = accuracy.trim() === "" ? null : Number(accuracy);
  const invalid = recall === null || (acc !== null && (!Number.isFinite(acc) || acc < 0 || acc > 100));
  return (
    <Sheet title={`Revise: ${topic.topicName}`} onClose={() => onClose()}>
      <div className="mt-4 space-y-4">
        <div><Eyebrow className="mb-1">How well did you recall it?</Eyebrow><Scale label="Recall" value={recall} onChange={setRecall} low="Blank" high="Solid" /></div>
        <div><Eyebrow className="mb-1">Difficulty</Eyebrow><Scale label="Difficulty" value={difficulty} onChange={setDifficulty} low="Light" high="Heavy" /></div>
        <div>
          <Eyebrow className="mb-1">Method</Eyebrow>
          <div className="flex flex-wrap gap-1">{REVISION_METHODS.map(([k, l]) => <Chip key={k} active={method === k} onClick={() => setMethod(k)}>{l}</Chip>)}</div>
        </div>
        <input className={inputClass} inputMode="numeric" placeholder="Accuracy % if you practised questions (optional)" value={accuracy} onChange={(e) => setAccuracy(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} aria-label="Accuracy percent" />
        <input className={inputClass} placeholder="Notes (optional)" value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => onClose()}>Cancel</Button>
          <Button disabled={invalid} onClick={async () => {
            const r = await logRevision(exam, topic.id, recall!, acc, difficulty ?? 3, method, notes, today);
            onClose(r.ok ? `Logged. ${r.explanation}.` : r.message);
          }}>Save revision</Button>
        </div>
      </div>
    </Sheet>
  );
}

function Mocks({ exam, attempts }: { exam: ExamConfig; attempts: ReturnType<typeof attemptsFor> }) {
  const prep = usePrep();
  const mocks = mocksFor(prep, exam.examId);
  const [entry, setEntry] = useState<"quick" | "marks" | "detailed" | null>(null);
  const m = exam.markingScheme;
  const marksMode = m.scoringMode === "MARKS_ENTRY";
  const errors = new Map<ErrorCategory, number>();
  for (const a of attempts) if (!a.isCorrect && a.errorCategory) errors.set(a.errorCategory, (errors.get(a.errorCategory) ?? 0) + 1);
  const sorted = [...mocks].sort((a, b) => a.dateTimestamp - b.dateTimestamp);
  return (
    <div className="space-y-5">
      <Card>
        <Eyebrow>{exam.shortName} scoring</Eyebrow>
        <p className="mt-1 text-sm text-ink-2">{marksMode ? `Scored by marks obtained · ${m.maxMarks} marks per paper · ${m.durationMinutes} min` : `${m.totalQuestions} Qs · max ${m.maxMarks} · +${m.positiveMarks} correct, ${m.hasNegativeMarking ? `−${m.negativeMarks} wrong` : "no negative marking"} · ${m.durationMinutes} min`}</p>
        {m.sections.length > 0 && <p className="mt-1 text-xs text-muted">{m.sections.map((s) => `${s.name}: ${s.questions} Q${s.minutes ? `, ${s.minutes} min` : ""}`).join(" · ")}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {marksMode ? <Button onClick={() => setEntry("marks")}>Log a paper</Button> : <>
            <Button onClick={() => setEntry("quick")}>Quick entry</Button>
            <Button variant="outline" onClick={() => setEntry("detailed")}>Question by question</Button>
          </>}
        </div>
      </Card>
      {sorted.length >= 2 && (
        <Card>
          <Eyebrow>Score trend</Eyebrow>
          <div className="mt-2"><Bars unit="%" height={160} domain={[0, 100]} summary="Mock percentages in date order." data={sorted.map((x) => ({ label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(x.dateTimestamp), value: Math.max(0, x.percentage), note: `${x.mockName}: ${x.totalScore}/${x.maxMarks}` }))} /></div>
        </Card>
      )}
      {errors.size > 0 && (
        <Card>
          <Eyebrow>Repeated mistakes</Eyebrow>
          <ul className="mt-2 space-y-1 text-sm">{[...errors.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span>{errorLabel(k)}</span><span className="tnum text-ink-2">{v}</span></li>)}</ul>
        </Card>
      )}
      <Card>
        <Eyebrow>Logged mocks · {mocks.length}</Eyebrow>
        {mocks.length === 0 ? <p className="mt-2 text-sm text-ink-2">No mocks yet. Readiness needs at least two.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {mocks.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{x.mockName}</span>
                  <span className="text-xs text-muted">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(x.dateTimestamp)} · {x.scoringMode === "MARKS_ENTRY" ? "marks entry" : `${x.correctAnswers}✓ ${x.incorrectAnswers}✗ ${x.unansweredQuestions} skipped · accuracy ${x.accuracyPercent}%`}{x.weakestSubject ? ` · weakest ${x.weakestSubject}` : ""}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="tnum text-sm font-semibold">{x.totalScore}/{x.maxMarks}</span><span className="tnum text-xs text-muted">{x.percentage}%</span>
                  <button type="button" className="text-xs text-muted hover:text-terra" onClick={() => void deleteMock(x.id)} aria-label={`Delete ${x.mockName}`}>Delete</button></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {entry === "quick" && <QuickMockSheet exam={exam} onClose={() => setEntry(null)} />}
      {entry === "marks" && <MarksMockSheet exam={exam} onClose={() => setEntry(null)} />}
      {entry === "detailed" && <DetailedMockSheet exam={exam} onClose={() => setEntry(null)} />}
    </div>
  );
}

function QuickMockSheet({ exam, onClose }: { exam: ExamConfig; onClose: () => void }) {
  const m = exam.markingScheme;
  const [name, setName] = useState(`${exam.shortName} Mock`);
  const [total, setTotal] = useState(String(m.totalQuestions));
  const [correct, setCorrect] = useState("");
  const [wrong, setWrong] = useState("");
  const [mins, setMins] = useState(String(m.durationMinutes));
  const [pos, setPos] = useState(String(m.positiveMarks));
  const [negOn, setNegOn] = useState(m.hasNegativeMarking);
  const [neg, setNeg] = useState(String(m.negativeMarks));
  const [weak, setWeak] = useState("");
  const [notes, setNotes] = useState("");
  const T = Number(total) || 0, C = Number(correct) || 0, W = Number(wrong) || 0, P = Number(pos) || 0, N = negOn ? Number(neg) || 0 : 0;
  const scheme = { positiveMarks: P, negativeMarks: N, hasNegativeMarking: negOn && N > 0, totalQuestions: T, maxMarks: T * P, durationMinutes: Number(mins) || m.durationMinutes };
  const error = validateQuickEntry(T, C, W) ?? (P <= 0 ? "Marks per correct answer must be more than 0." : null);
  const preview = error ? null : scoreQuickEntry(T, C, W, scheme);
  return (
    <Sheet title="Quick mock entry" onClose={onClose}>
      <div className="mt-4 space-y-3">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Mock name" />
        <div className="grid grid-cols-2 gap-2">
          <Num label="Total questions" value={total} onChange={setTotal} /><Num label="Minutes" value={mins} onChange={setMins} />
          <Num label="Correct" value={correct} onChange={setCorrect} /><Num label="Incorrect" value={wrong} onChange={setWrong} />
          <Num label="Marks per correct" value={pos} onChange={setPos} decimal /><Num label="Minus per wrong" value={neg} onChange={setNeg} decimal disabled={!negOn} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={negOn} onChange={(e) => setNegOn(e.target.checked)} />Negative marking</label>
        <input className={inputClass} placeholder="Weakest subject (optional)" value={weak} onChange={(e) => setWeak(e.target.value)} maxLength={60} aria-label="Weakest subject" />
        <input className={inputClass} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={240} aria-label="Notes" />
        <p className={cx("rounded-xl px-3 py-2 text-sm", error ? "bg-terra-soft text-terra" : "bg-blue-soft")} role="status">
          {error ?? `Score ${preview!.finalScore}/${preview!.maxMarks} (${preview!.percentage}%) · accuracy ${preview!.accuracyPercent}% · −${preview!.negativeMarksDeducted} for wrong answers`}
        </p>
        <div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button disabled={!!error} onClick={async () => { const err = await recordQuickMock(exam, name, T, C, W, Number(mins) || m.durationMinutes, scheme, weak, notes); if (!err) onClose(); }}>Save mock</Button></div>
      </div>
    </Sheet>
  );
}

function MarksMockSheet({ exam, onClose }: { exam: ExamConfig; onClose: () => void }) {
  const m = exam.markingScheme;
  const [name, setName] = useState(`${exam.shortName} Paper`);
  const [marks, setMarks] = useState("");
  const [max, setMax] = useState(String(m.maxMarks));
  const [mins, setMins] = useState(String(m.durationMinutes));
  const [notes, setNotes] = useState("");
  const M = Number(max) || 0;
  const value = marks.trim() === "" ? NaN : Number(marks);
  const error = marks.trim() === "" ? "Enter the marks you scored." : validateMarksEntry(value, M, -M);
  return (
    <Sheet title="Log a paper" onClose={onClose}>
      <p className="mt-2 text-sm text-ink-2">{exam.shortName} papers are descriptive or mix question values, so enter your marks for one paper.</p>
      <div className="mt-4 space-y-3">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Paper name" />
        <div className="grid grid-cols-3 gap-2"><Num label="Marks obtained" value={marks} onChange={setMarks} decimal signed /><Num label="Out of" value={max} onChange={setMax} decimal /><Num label="Minutes" value={mins} onChange={setMins} /></div>
        <input className={inputClass} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={240} aria-label="Notes" />
        <p className={cx("rounded-xl px-3 py-2 text-sm", error ? "bg-terra-soft text-terra" : "bg-blue-soft")} role="status">{error ?? `${value}/${M} (${scoreMarksEntry(value, M).percentage}%)${exam.supportsPaperExemptions && value / M >= 0.6 ? " · at or above 60%" : ""}`}</p>
        <div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button disabled={!!error} onClick={async () => { const err = await recordMarksMock(exam, name, value, M, Number(mins) || m.durationMinutes, notes); if (!err) onClose(); }}>Save paper</Button></div>
      </div>
    </Sheet>
  );
}

function DetailedMockSheet({ exam, onClose }: { exam: ExamConfig; onClose: () => void }) {
  const [name, setName] = useState(`${exam.shortName} Detailed Mock`);
  const [mins, setMins] = useState(String(exam.markingScheme.durationMinutes));
  const [rows, setRows] = useState<QuestionAttemptInput[]>([]);
  const [q, setQ] = useState<QuestionAttemptInput>({ questionNumber: 1, subject: exam.subjects[0]?.name ?? "", topicName: "", selectedAnswer: "", correctAnswer: "", timeSpentSeconds: 60, errorCategory: null });
  const preview = rows.length ? scoreQuestionAttempts(rows, exam.markingScheme) : null;
  const add = () => {
    if (!q.correctAnswer.trim()) return;
    setRows([...rows, { ...q, selectedAnswer: q.selectedAnswer?.trim() || null }]);
    setQ({ ...q, questionNumber: q.questionNumber + 1, selectedAnswer: "", correctAnswer: "", errorCategory: null, topicName: "" });
  };
  const wrong = !!q.selectedAnswer?.trim() && q.selectedAnswer.trim().toLowerCase() !== q.correctAnswer.trim().toLowerCase() && !!q.correctAnswer.trim();
  return (
    <Sheet title="Question-by-question mock" onClose={onClose}>
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-2"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Mock name" /><Num label="Minutes" value={mins} onChange={setMins} /></div>
        <Card className="space-y-2 p-3">
          <p className="text-xs font-semibold text-ink-2">Question {q.questionNumber}</p>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} list="mock-subjects" placeholder="Subject" value={q.subject} onChange={(e) => setQ({ ...q, subject: e.target.value })} aria-label="Subject" />
            <input className={inputClass} placeholder="Topic" value={q.topicName} onChange={(e) => setQ({ ...q, topicName: e.target.value })} aria-label="Topic" />
            <input className={inputClass} placeholder="Your answer (blank = skipped)" value={q.selectedAnswer ?? ""} onChange={(e) => setQ({ ...q, selectedAnswer: e.target.value.slice(0, 20) })} aria-label="Your answer" />
            <input className={inputClass} placeholder="Correct answer" value={q.correctAnswer} onChange={(e) => setQ({ ...q, correctAnswer: e.target.value.slice(0, 20) })} aria-label="Correct answer" />
          </div>
          <datalist id="mock-subjects">{exam.subjects.map((s) => <option key={s.name} value={s.name} />)}</datalist>
          {wrong && <div className="flex flex-wrap gap-1">{ERROR_CATEGORIES.map(([k, l]) => <Chip key={k} active={q.errorCategory === k} onClick={() => setQ({ ...q, errorCategory: k })}>{l}</Chip>)}</div>}
          <Button variant="outline" disabled={!q.correctAnswer.trim()} onClick={add}>Add question</Button>
        </Card>
        {preview && <p className="rounded-xl bg-blue-soft px-3 py-2 text-sm" role="status">{rows.length} questions · score {preview.finalScore}/{preview.maxMarks} · accuracy {preview.accuracyPercent}%{preview.repeatedErrorDiagnosis ? ` · ${preview.repeatedErrorDiagnosis}` : ""}</p>}
        <div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button disabled={!rows.length} onClick={async () => { const err = await recordDetailedMock(exam, name, rows, Number(mins) || exam.markingScheme.durationMinutes, ""); if (!err) onClose(); }}>Save mock</Button></div>
      </div>
    </Sheet>
  );
}

function Num({ label, value, onChange, decimal, signed, disabled }: { label: string; value: string; onChange: (v: string) => void; decimal?: boolean; signed?: boolean; disabled?: boolean }) {
  return (
    <label className="text-xs text-muted">{label}
      <input className={cx(inputClass, "mt-1")} inputMode={decimal ? "decimal" : "numeric"} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(signed ? /[^0-9.-]/g : decimal ? /[^0-9.]/g : /[^0-9]/g, "").slice(0, 8))} />
    </label>
  );
}

function PlanTab({ exam, planInputs, today }: { exam: ExamConfig; planInputs: TopicPlanInput[]; today: string }) {
  const prep = usePrep();
  const { sessions } = useTempo();
  const plan = planFor(prep, exam.examId)!;
  const mocks = mocksFor(prep, exam.examId);
  const attempts = attemptsFor(prep, exam.examId);
  // Subject accuracy from question-level mocks drives the weak-subject boost, as on Android.
  const acc: Record<string, number> = {};
  const bySubject = new Map<string, { c: number; n: number }>();
  for (const a of attempts) if (a.selectedAnswer) { const x = bySubject.get(a.subject) ?? { c: 0, n: 0 }; x.n++; if (a.isCorrect) x.c++; bySubject.set(a.subject, x); }
  for (const [k, v] of bySubject) acc[k] = (v.c / v.n) * 100;
  const week = sessions.filter((s) => s.localDate >= addDays(today, -7) && s.localDate < today && s.phase === "focus" && (s.status === "completed" || s.status === "ended_early"));
  const studied = week.reduce((a, s) => a + s.actualSeconds / 60, 0);
  const missed = Math.max(0, Math.round(plan.dailyHours * 60 * Math.min(7, plan.studyDaysPerWeek) - studied));
  const p = generatePlan(exam, planInputs, today, plan.examDate, plan.dailyHours, plan.studyDaysPerWeek, acc, missed);
  const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="space-y-5">
      <Card className="grid gap-4 sm:grid-cols-4">
        <label className="text-xs text-muted">Exam date
          <input type="date" className={cx(inputClass, "mt-1")} value={plan.examDate ?? ""} min={today} onChange={(e) => void updatePlan(exam.examId, { examDate: isDateKey(e.target.value) ? e.target.value : null })} />
        </label>
        <label className="text-xs text-muted">Hours a day
          <input type="number" min={0.5} max={14} step={0.5} className={cx(inputClass, "mt-1")} value={plan.dailyHours} onChange={(e) => void updatePlan(exam.examId, { dailyHours: Number(e.target.value) || 0.5 })} />
        </label>
        <label className="text-xs text-muted">Study days a week
          <input type="number" min={1} max={7} className={cx(inputClass, "mt-1")} value={plan.studyDaysPerWeek} onChange={(e) => void updatePlan(exam.examId, { studyDaysPerWeek: Number(e.target.value) || 1 })} />
        </label>
        <label className="text-xs text-muted">Target score %
          <input type="number" min={30} max={100} className={cx(inputClass, "mt-1")} value={plan.targetScorePercent} onChange={(e) => void updatePlan(exam.examId, { targetScorePercent: Number(e.target.value) || 30 })} />
        </label>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label="Daily target" value={minutesLabel(p.dailyTargetMinutes)} sub={`${p.studyDaysPerWeek} days a week`} /></Card>
        <Card><Stat label="Revision backlog" value={p.revisionBacklogCount} sub={p.backlogRecoveryMinutesPerDay ? `${p.backlogRecoveryMinutesPerDay} min/day to recover` : "none"} /></Card>
        <Card><Stat label="Mock day" value={p.nextRecommendedMockDay} sub={`${mocks.length} logged so far`} /></Card>
      </div>
      <Card>
        <Eyebrow>Today</Eyebrow>
        {p.todayTasks.length === 0 ? <p className="mt-2 text-sm text-ink-2">Rest day.</p> : (
          <ul className="mt-2 divide-y divide-line">{p.todayTasks.map((t, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate text-sm font-medium">{t.topicName}</span><span className="text-xs text-muted">{t.taskType} · {t.subject}</span></span><span className="tnum shrink-0 text-sm">{t.allocatedMinutes} min</span></li>)}</ul>
        )}
        <p className="mt-2 text-xs text-muted">Start these from <Link className="underline" href="/app">Focus</Link>; pick the subject and session type to match.</p>
      </Card>
      <Card>
        <Eyebrow>This week</Eyebrow>
        <ul className="mt-2 grid gap-2 sm:grid-cols-7">
          {p.weeklySchedule.map((d) => (
            <li key={d.date} className={cx("rounded-xl p-2 text-xs", d.totalMinutes ? "bg-surface-2" : "border border-dashed border-line")}>
              <p className="font-semibold">{WD[d.weekday]} {formatDateKey(d.date, { day: "numeric" })}</p>
              <p className="text-muted">{d.totalMinutes ? minutesLabel(d.totalMinutes) : "Rest"}</p>
              {d.tasks.map((t, i) => <p key={i} className="mt-1 truncate" title={`${t.taskType}: ${t.topicName}`}>{t.taskType === "Mock Practice" ? "Mock" : t.subject}</p>)}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <Eyebrow>How time is shared between subjects</Eyebrow>
        <ul className="mt-2 space-y-2">
          {p.subjectAllocations.map((a) => (
            <li key={a.subject}>
              <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{a.subject}</span><span className="tnum text-ink-2">{minutesLabel(a.allocatedMinutesPerWeek)}/wk · {a.sharePercent}%</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ink" style={{ width: `${a.sharePercent}%` }} /></div>
              <p className="mt-0.5 text-xs text-muted">{a.weightageSource} · {a.rationale}</p>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <Eyebrow>Milestones</Eyebrow>
        <ul className="mt-2 space-y-2 text-sm">{p.monthlyMilestones.map((m) => <li key={m.monthLabel}><span className="font-medium">{m.monthLabel}</span><span className="block text-xs text-ink-2">{m.targetTopicsToComplete} topics · {m.recommendedMocks} mocks · {m.focusDirective}</span></li>)}</ul>
      </Card>
    </div>
  );
}
