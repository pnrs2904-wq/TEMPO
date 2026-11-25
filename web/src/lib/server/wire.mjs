/**
 * Sync wire format <-> Postgres rows.
 *
 * Wire format (what Android sends and reads, and what the web client uses):
 *   camelCase keys; every instant is a number of milliseconds since the epoch;
 *   calendar days are epoch-day integers (…EpochDay).
 * Database: snake_case columns; instants are timestamptz.
 *
 * Only fields listed here are written, so a client cannot set user_id, rev or any other column,
 * and extra client fields (Android's localId, for example) are dropped.
 */

/** kind: 'ms' = timestamptz <-> epoch ms; 'num' = numeric/bigint returned as number; 'raw' = as is. */
const F = (col, kind = 'raw') => ({ col, kind });

export const WIRE_FIELDS = {
  sessions: {
    startedAt: F('started_at', 'ms'),
    phase: F('phase'),
    energy: F('energy', 'num'),
    subject: F('subject'),
    sessionType: F('session_type'),
    plannedMinutes: F('planned_minutes', 'num'),
    actualSeconds: F('actual_seconds', 'num'),
    status: F('status'),
    focusQuality: F('focus_quality', 'num'),
    difficulty: F('difficulty', 'num'),
    durationFeedback: F('duration_feedback'),
    distractions: F('distractions', 'num'),
    notes: F('notes'),
    createdAt: F('created_at', 'ms'),
    // Web-only (migration 0005); Android leaves them out.
    tz: F('tz'),
    localDate: F('local_date'),
    expectedDifficulty: F('expected_difficulty', 'num'),
    topicId: F('topic_id'),
    mockScore: F('mock_score', 'num'),
    mockMaxScore: F('mock_max_score', 'num'),
  },
  user_exam_plans: {
    examId: F('exam_id'),
    applicableYear: F('applicable_year', 'num'),
    syllabusVersion: F('syllabus_version'),
    selectedCaGroup: F('selected_ca_group'),
    examDateEpochDay: F('exam_date_epoch_day', 'num'),
    dailyHours: F('daily_hours', 'num'),
    studyDaysPerWeek: F('study_days_per_week', 'num'),
    targetScorePercent: F('target_score_percent', 'num'),
  },
  user_topic_progress: {
    examId: F('exam_id'),
    syllabusVersion: F('syllabus_version'),
    subject: F('subject'),
    unit: F('unit'),
    chapter: F('chapter'),
    topicName: F('topic_name'),
    subtopics: F('subtopics'),
    status: F('status'),
    difficulty: F('difficulty'),
    ncertCompleted: F('ncert_completed'),
    formulaRevisionDone: F('formula_revision_done'),
    diagramRevisionDone: F('diagram_revision_done'),
    rtpMtpCompleted: F('rtp_mtp_completed'),
    revisionCount: F('revision_count', 'num'),
    lastStudiedEpochDay: F('last_studied_epoch_day', 'num'),
    nextRevisionEpochDay: F('next_revision_epoch_day', 'num'),
    isCustom: F('is_custom'),
  },
  revision_events: {
    examId: F('exam_id'),
    topicId: F('topic_id'),
    topicName: F('topic_name'),
    subject: F('subject'),
    revisionTimestamp: F('revision_timestamp', 'ms'),
    revisionEpochDay: F('revision_epoch_day', 'num'),
    revisionNumber: F('revision_number', 'num'),
    recallRating: F('recall_rating', 'num'),
    accuracyPercent: F('accuracy_percent', 'num'),
    difficulty: F('difficulty', 'num'),
    nextRevisionEpochDay: F('next_revision_epoch_day', 'num'),
    method: F('method'),
    notes: F('notes'),
  },
  mock_tests: {
    examId: F('exam_id'),
    attemptYear: F('attempt_year', 'num'),
    mockName: F('mock_name'),
    dateTimestamp: F('date_timestamp', 'ms'),
    totalQuestions: F('total_questions', 'num'),
    attemptedQuestions: F('attempted_questions', 'num'),
    correctAnswers: F('correct_answers', 'num'),
    incorrectAnswers: F('incorrect_answers', 'num'),
    unansweredQuestions: F('unanswered_questions', 'num'),
    positiveMarksPerQ: F('positive_marks_per_q', 'num'),
    negativeMarksPerQ: F('negative_marks_per_q', 'num'),
    totalScore: F('total_score', 'num'),
    maxMarks: F('max_marks', 'num'),
    percentage: F('percentage', 'num'),
    accuracyPercent: F('accuracy_percent', 'num'),
    durationMinutes: F('duration_minutes', 'num'),
    avgSecondsPerQuestion: F('avg_seconds_per_question', 'num'),
    weakestSubject: F('weakest_subject'),
    weakestSubjectAccuracy: F('weakest_subject_accuracy', 'num'),
    isQuickEntry: F('is_quick_entry'),
    notes: F('notes'),
    scoringMode: F('scoring_mode'), // migration 0005
  },
  question_attempts: {
    examId: F('exam_id'),
    mockTestId: F('mock_test_id'),
    questionNumber: F('question_number', 'num'),
    subject: F('subject'),
    topicName: F('topic_name'),
    difficulty: F('difficulty'),
    selectedAnswer: F('selected_answer'),
    correctAnswer: F('correct_answer'),
    isCorrect: F('is_correct'),
    timeSpentSeconds: F('time_spent_seconds', 'num'),
    errorCategory: F('error_category'),
  },
};

export const SYNC_TABLES = Object.keys(WIRE_FIELDS);

function toMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
const toIso = (v) => {
  const ms = toMs(v);
  return ms === null ? null : new Date(ms).toISOString();
};

/** Wire row -> database row. `userId` always comes from the verified token, never the body. */
export function wireToDb(table, row, userId) {
  const fields = WIRE_FIELDS[table];
  if (!fields) throw new Error(`Unknown sync table ${table}`);
  const out = { id: row.id, user_id: userId, updated_at: toIso(row.updatedAt), deleted_at: toIso(row.deletedAt) };
  for (const [key, { col, kind }] of Object.entries(fields)) {
    let v = row[key];
    // Android names a session's start `timestamp`.
    if (table === 'sessions' && key === 'startedAt' && (v === undefined || v === null)) v = row.timestamp;
    if (v === undefined) continue; // let the column default apply
    out[col] = kind === 'ms' ? toIso(v) : v;
  }
  return out;
}

/** Database row -> wire row. Includes `rev` so the server can advance cursors. */
export function dbToWire(table, row) {
  const fields = WIRE_FIELDS[table];
  if (!fields) throw new Error(`Unknown sync table ${table}`);
  const out = { id: row.id, updatedAt: toMs(row.updated_at), deletedAt: toMs(row.deleted_at), rev: Number(row.rev ?? 0) };
  for (const [key, { col, kind }] of Object.entries(fields)) {
    const v = row[col];
    out[key] = v === null || v === undefined ? null : kind === 'ms' ? toMs(v) : kind === 'num' ? Number(v) : v;
  }
  if (table === 'sessions') out.timestamp = out.startedAt; // Android reads `timestamp`
  return out;
}
