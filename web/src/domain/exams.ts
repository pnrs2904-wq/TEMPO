/**
 * Examination registry shared with Android.
 *
 * src/data/exam-registry.json is GENERATED from the Kotlin registry
 * (android/tools/domain-check: ExportRegistry.kt), so both platforms use identical configurations.
 * Do not edit the JSON by hand; change the Kotlin and re-export.
 */
import registry from "@/data/exam-registry.json";

export type ExamCategory = "MEDICAL" | "LAW" | "CHARTERED_ACCOUNTANCY" | "CIVIL_SERVICES" | "ENGINEERING" | "STATE_EXAMS" | "UNIVERSITY_CUSTOM";
export type PatternStatus = "VERIFIED" | "PROVISIONAL";
export type ScoringMode = "PER_QUESTION" | "MARKS_ENTRY";
export type TopicDifficulty = "foundational" | "moderate" | "high" | "critical";
export type CaGroup = "group_1" | "group_2" | "both";

export interface Section { name: string; questions: number; minutes: number | null; maxMarks: number | null }
export interface MarkingScheme {
  positiveMarks: number;
  negativeMarks: number;
  hasNegativeMarking: boolean;
  totalQuestions: number;
  maxMarks: number;
  durationMinutes: number;
  scoringMode: ScoringMode;
  passCriteriaNote: string | null;
  sections: Section[];
}
export interface TopicSeed { name: string; subtopics: string[]; difficulty: TopicDifficulty; note: string | null; ncert: boolean }
export interface ChapterSeed { name: string; topics: TopicSeed[] }
export interface UnitSeed { name: string; chapters: ChapterSeed[] }
export interface SubjectSeed {
  name: string;
  group: string | null;
  paperCode: string | null;
  weightagePercent: number | null;
  weightageSource: string;
  units: UnitSeed[];
}
export interface ExamConfig {
  examId: string;
  name: string;
  shortName: string;
  category: ExamCategory;
  categoryLabel: string;
  level: string;
  applicableYear: number;
  syllabusVersion: string;
  patternStatus: PatternStatus;
  authorityName: string;
  officialNotificationUrl: string;
  officialSyllabusUrl: string;
  markingScheme: MarkingScheme;
  questionTypes: string[];
  revisionIntervalsDays: number[];
  revisionMethods: string[];
  poorRecallMultiplier: number;
  strongRecallMultiplier: number;
  supportsCaGroups: boolean;
  supportsNcertTracking: boolean;
  supportsPaperExemptions: boolean;
  strategySummary: string;
  resources: { title: string; category: string; url: string | null }[];
  subjects: SubjectSeed[];
}

export const EXAMS: ExamConfig[] = (registry as { exams: ExamConfig[] }).exams;
const byId = new Map(EXAMS.map((e) => [e.examId, e]));

export const DIFFICULTY_WEIGHT: Record<TopicDifficulty, number> = { foundational: 0.85, moderate: 1.0, high: 1.25, critical: 1.45 };
export const DIFFICULTY_LABEL: Record<TopicDifficulty, string> = { foundational: "Foundational", moderate: "Moderate", high: "High", critical: "Critical" };
export const parseDifficulty = (v: unknown): TopicDifficulty =>
  typeof v === "string" && (["foundational", "moderate", "high", "critical"] as string[]).includes(v.trim().toLowerCase())
    ? (v.trim().toLowerCase() as TopicDifficulty)
    : "moderate";

/** Unknown ids return undefined; Android falls back to NEET UG, which the web never does silently. */
export const findExam = (examId: string | null | undefined) => (examId ? byId.get(examId) : undefined);

export function examsByCategory(): { category: ExamCategory; label: string; exams: ExamConfig[] }[] {
  const out: { category: ExamCategory; label: string; exams: ExamConfig[] }[] = [];
  for (const e of EXAMS) {
    let g = out.find((x) => x.category === e.category);
    if (!g) out.push((g = { category: e.category, label: e.categoryLabel, exams: [] }));
    g.exams.push(e);
  }
  return out;
}

/** Port of ExamRegistry.getEffectiveSubjects: CA Inter/Final Group I, II or both. */
export function effectiveSubjects(exam: ExamConfig, group: CaGroup = "both"): SubjectSeed[] {
  if (!exam.supportsCaGroups) return exam.subjects;
  const pair = exam.examId.startsWith("ca_inter") ? ["ca_inter_g1", "ca_inter_g2"] : exam.examId.startsWith("ca_final") ? ["ca_final_g1", "ca_final_g2"] : null;
  if (!pair) return exam.subjects;
  const g1 = findExam(pair[0])?.subjects ?? [];
  const g2 = findExam(pair[1])?.subjects ?? [];
  return group === "group_1" ? g1 : group === "group_2" ? g2 : [...g1, ...g2];
}

export interface SeededTopic { subject: string; unit: string; chapter: string; topicName: string; subtopics: string; difficulty: TopicDifficulty; ncert: boolean }

export function seedTopics(exam: ExamConfig, group: CaGroup = "both"): SeededTopic[] {
  const out: SeededTopic[] = [];
  for (const s of effectiveSubjects(exam, group))
    for (const u of s.units)
      for (const c of u.chapters)
        for (const t of c.topics)
          out.push({ subject: s.name, unit: u.name, chapter: c.name, topicName: t.name, subtopics: t.subtopics.join(", "), difficulty: t.difficulty, ncert: t.ncert });
  return out;
}

export const topicKey = (subject: string, chapter: string, topic: string) => `${subject}|${chapter}|${topic}`.toLowerCase();
