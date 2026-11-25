"use client";
import { useMemo } from "react";
import { effectiveSubjects, findExam, type CaGroup } from "@/domain/exams";
import { planFor, usePrep } from "./prep";
import { useTempo } from "./store";

/**
 * The student's subjects in a stable order: the selected exam's syllabus, their own extra subjects,
 * then anything else they have studied. Colours are assigned by position in this list.
 */
export function useSubjectNames(): string[] {
  const { userState, sessions } = useTempo();
  const prep = usePrep();
  return useMemo(() => {
    const exam = userState.advancedMode ? findExam(userState.selectedExamId) : undefined;
    const plan = exam ? planFor(prep, exam.examId) : null;
    const names = [...(exam ? effectiveSubjects(exam, (plan?.caGroup ?? "both") as CaGroup).map((s) => s.name) : []), ...userState.customSubjects];
    const seen = new Set(names.map((n) => n.toLowerCase()));
    for (const s of [...sessions].sort((a, b) => b.timestamp - a.timestamp)) {
      const n = s.subject.trim();
      if (!s.deletedAt && n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); names.push(n); }
    }
    return names;
  }, [userState.advancedMode, userState.selectedExamId, userState.customSubjects, sessions, prep]);
}
